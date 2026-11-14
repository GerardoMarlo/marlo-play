import { BusinessError } from "../src/domain";
import { trackingLabels } from "../src/tracking-status";
import type { TrackingResult, TrackingEvent } from "../src/tracking-status";
import type { Env, OrderRow } from "./types";
import { skyClient } from "./skydropx";
import { hash } from "./security";

export function trackingNumber(value: unknown) {
  if (typeof value !== "string" || value.length > 100)
    throw new BusinessError("Escribe un número de guía válido.", 400);
  const normalized = value.trim().replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{5,49}$/.test(normalized))
    throw new BusinessError(
      "Revisa tu número de guía: utiliza entre 6 y 50 letras, números o guiones.",
      400,
    );
  return normalized;
}
export function providerDate(value: unknown): string | null {
  // Preserve an absent timezone instead of inventing the carrier's timezone.
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}
const statusCode = (value: unknown) =>
  typeof value === "string" &&
  Object.hasOwn(trackingLabels, value.toLowerCase())
    ? value.toLowerCase()
    : "unknown";
export function normalizeTrackingResponse(raw: any): TrackingEvent[] {
  if (!Array.isArray(raw?.data) || raw.data.length > 1000)
    throw new BusinessError(
      "No se pudo actualizar el rastreo. Intenta más tarde.",
      502,
    );
  return raw.data
    .map((item: any) => ({
      status: statusCode(item?.attributes?.status),
      date: providerDate(item?.attributes?.date),
    }))
    .filter((item: TrackingEvent) => item.status !== "unknown");
}
export async function recordTrackingEvent(
  e: Env,
  id: string,
  event: TrackingEvent,
  source: string,
) {
  const key = await hash(`${id}:${source}:${event.status}:${event.date || ""}`);
  await e.DB.batch([
    e.DB.prepare(
      "INSERT OR IGNORE INTO shipment_tracking_events VALUES(?,?,?,?,?,?)",
    ).bind(key, id, event.status, event.date, source, Date.now()),
    // Atomic guard prevents concurrent/late responses overwriting newer events.
    e.DB.prepare(
      `UPDATE shipment_tracking SET status=?,status_at=? WHERE id=?
      AND (status_at IS NULL OR (? IS NOT NULL AND julianday(?)>=julianday(status_at)))
      AND (status=? OR status='unknown' OR (
        status NOT IN ('canceled','destroyed') AND
        (status<>'delivered' OR ?='in_return') AND
        (status<>'in_return' OR ? IN ('canceled','destroyed')) AND
        NOT (status IN ('picked_up','in_transit','last_mile','delivery_attempt','delivered_to_branch') AND ?='created') AND
        NOT (status IN ('in_transit','last_mile','delivery_attempt','delivered_to_branch') AND ?='picked_up') AND
        NOT (status IN ('last_mile','delivery_attempt','delivered_to_branch') AND ?='in_transit')
      ))`,
    ).bind(
      event.status,
      event.date,
      id,
      event.date,
      event.date,
      event.status,
      event.status,
      event.status,
      event.status,
      event.status,
      event.status,
    ),
  ]);
}
export async function registerTracking(e: Env, o: OrderRow, result: any) {
  if (JSON.parse(o.data).checkout.delivery === "local") return;
  const carrier =
    typeof result.carrier === "string" ? result.carrier.trim() : "";
  if (!/^[a-zA-Z0-9 _-]{1,80}$/.test(carrier)) return; // Never guess carrier from a number.
  for (const p of result.packages) {
    if (!p.tracking_number) continue;
    let number: string;
    try {
      number = trackingNumber(String(p.tracking_number));
    } catch {
      continue;
    }
    const id = await hash(`${o.id}:${carrier.toLowerCase()}:${number}`);
    const url =
      typeof p.tracking_url_provider === "string" &&
      /^https:\/\//.test(p.tracking_url_provider)
        ? p.tracking_url_provider
        : null;
    await e.DB.prepare(
      `INSERT INTO shipment_tracking(id,order_id,shipment_id,tracking_number,carrier,tracking_url) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET tracking_url=COALESCE(excluded.tracking_url,tracking_url)`,
    )
      .bind(id, o.id, result.id, number, carrier, url)
      .run();
    const status = statusCode(p.tracking_status);
    if (status !== "unknown")
      await recordTrackingEvent(
        e,
        id,
        { status, date: providerDate(p.updated_at) },
        "snapshot",
      );
  }
}
export async function refreshTracking(e: Env, row: any) {
  const now = Date.now();
  const claim = await e.DB.prepare(
    "UPDATE shipment_tracking SET refresh_after=? WHERE id=? AND refresh_after<=? RETURNING id",
  )
    .bind(now + 300000, row.id, now)
    .first();
  if (!claim) return;
  try {
    const raw = await skyClient(e)(
      "/api/v1/shipments/tracking?" +
        new URLSearchParams({
          tracking_number: row.tracking_number,
          carrier_name: row.carrier,
        }),
    );
    const events = normalizeTrackingResponse(raw);
    events.sort(
      (a, b) =>
        (a.date ? Date.parse(a.date) : 0) - (b.date ? Date.parse(b.date) : 0),
    );
    for (const event of events)
      await recordTrackingEvent(e, row.id, event, "tracking");
    await e.DB.prepare("UPDATE shipment_tracking SET checked_at=? WHERE id=?")
      .bind(now, row.id)
      .run();
  } catch {
    /* Keep verified cache and five-minute backoff; never invent progress. */
  }
}
export async function publicTracking(
  e: Env,
  value: unknown,
): Promise<TrackingResult> {
  const number = trackingNumber(value);
  const rows = await e.DB.prepare(
    "SELECT * FROM shipment_tracking WHERE tracking_number=? LIMIT 2",
  )
    .bind(number)
    .all<any>();
  if (rows.results.length !== 1)
    throw new BusinessError(
      "No pudimos localizar esta guía de forma segura. Revisa el número recibido por correo o contacta a soporte@marlo.games.",
      404,
    );
  const row = rows.results[0];
  await refreshTracking(e, row);
  const current = await e.DB.prepare(
    "SELECT * FROM shipment_tracking WHERE id=?",
  )
    .bind(row.id)
    .first<any>();
  const history = await e.DB.prepare(
    "SELECT status,occurred_at AS date FROM shipment_tracking_events WHERE tracking_id=? AND source='tracking' ORDER BY julianday(occurred_at) DESC LIMIT 100",
  )
    .bind(row.id)
    .all<TrackingEvent>();
  return {
    trackingNumber: number,
    carrier: current.carrier,
    status: current.status,
    updatedAt: current.status_at,
    events: history.results,
    stale: !current.checked_at || Date.now() - current.checked_at > 600000,
  };
}
