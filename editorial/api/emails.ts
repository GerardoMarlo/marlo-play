import type { Env } from "./types";
import { renderEmail } from "./email-templates";
export { renderEmail, emailCopy } from "./email-templates";
const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
export function mailStatement(
  e: Env,
  id: string,
  recipient: string,
  kind: string,
  payload: unknown,
) {
  return e.DB.prepare(
    "INSERT OR IGNORE INTO outbox(id,recipient,kind,next_attempt,payload) SELECT ?,?,?,?,json_set(?, '$.orderNumber', COALESCE((SELECT public_number FROM orders WHERE id=json_extract(?, '$.id')),json_extract(?, '$.orderNumber'))) ",
  ).bind(
    id,
    recipient,
    kind,
    kind === "received" ? Date.now() + 5 * 60000 : 0,
    JSON.stringify(payload),
    JSON.stringify(payload),
    JSON.stringify(payload),
  );
}
export async function processOutbox(e: Env) {
  // Pausing email delivery must not exhaust retries before launch.
  if (
    e.MODE !== "local" &&
    (e.EMAIL_ENABLED !== "true" || !e.RESEND_API_KEY || !e.EMAIL_FROM)
  )
    return 0;
  const now = Date.now();
  const rows = await e.DB.prepare(
    "UPDATE outbox SET status='processing',lease_until=? WHERE id IN (SELECT id FROM outbox WHERE ((status='pending' AND next_attempt<=?) OR (status='processing' AND lease_until<?)) AND attempts<5 ORDER BY (kind='order_code') DESC,next_attempt LIMIT 5) RETURNING *",
  )
    .bind(now + 120000, now, now)
    .all<any>();
  for (const row of rows.results) {
    try {
      const payload = JSON.parse(row.payload);
      let suppress = ["local", "manual_shipping"].includes(row.kind);
      if (row.kind === "received") {
        const order = await e.DB.prepare(
          "SELECT payment FROM orders WHERE id=?",
        )
          .bind(payload.id || "")
          .first<any>();
        suppress ||= !order || order.payment !== "pending";
      }
      if (
        payload.appointmentId &&
        (!row.kind.startsWith("internal_") ||
          ["internal_pickup_approaching", "internal_pickup_overdue"].includes(
            row.kind,
          ))
      ) {
        const appointment = await e.DB.prepare(
          "SELECT a.*,o.payment FROM pickup_appointments a JOIN orders o ON o.id=a.order_id WHERE a.id=?",
        )
          .bind(payload.appointmentId)
          .first<any>();
        suppress ||=
          !appointment ||
          appointment.version !== payload.appointmentVersion ||
          appointment.status !== payload.appointmentStatus;
        if (["pickup_reminder", "internal_pickup_approaching"].includes(row.kind))
          suppress ||= appointment?.start - now > 2 * 3600000;
        if (
          [
            "pickup_reminder",
            "pickup_same_day",
            "pickup_confirmed",
            "pickup_rescheduled",
            "internal_pickup_approaching",
          ].includes(row.kind)
        )
          suppress ||=
            appointment?.payment !== "paid" || appointment?.start <= now;
      }
      if (
        [
          "pickup_ready",
          "pickup_invitation_reminder",
          "internal_pickup_ready",
          "internal_preparation",
          "paid",
        ].includes(row.kind)
      ) {
        const order = await e.DB.prepare(
          "SELECT payment,logistics FROM orders WHERE id=?",
        )
          .bind(payload.id || "")
          .first<any>();
        suppress ||=
          !order ||
          order.payment !== "paid" ||
          (["pickup_ready", "pickup_invitation_reminder", "internal_pickup_ready"].includes(row.kind) &&
            order.logistics !== "ready") ||
          (row.kind === "internal_preparation" &&
            order.logistics !== "pending_contact");
        if (row.kind === "pickup_invitation_reminder")
          suppress ||= !!(await e.DB.prepare("SELECT id FROM pickup_appointments WHERE order_id=? AND status NOT IN ('cancelled','completed')").bind(payload.id).first());
      }
      if (suppress) {
        await e.DB.prepare(
          "UPDATE outbox SET status='suppressed',error=NULL WHERE id=?",
        )
          .bind(row.id)
          .run();
        continue;
      }
      if (row.kind === "order_code" && JSON.parse(row.payload).expires < now) {
        await e.DB.prepare(
          "UPDATE outbox SET status='suppressed',error=NULL WHERE id=?",
        )
          .bind(row.id)
          .run();
        continue;
      }
      let unsubscribeUrl = "";
      if (row.kind === "marketing") {
        const subscriber = await e.DB.prepare(
          "SELECT consent,unsubscribe_token FROM marketing_subscribers WHERE email=?",
        )
          .bind(String(row.recipient).toLowerCase())
          .first<{ consent: number; unsubscribe_token: string }>();
        if (!subscriber?.consent) {
          await e.DB.prepare(
            "UPDATE outbox SET status='suppressed',error=NULL WHERE id=?",
          )
            .bind(row.id)
            .run();
          continue;
        }
        unsubscribeUrl =
          e.PUBLIC_ORIGIN + "/baja-noticias#" + subscriber.unsubscribe_token;
      }
      if (e.MODE === "local") {
        await e.DB.prepare(
          "UPDATE outbox SET status='preview',error=NULL WHERE id=?",
        )
          .bind(row.id)
          .run();
        continue;
      }
      if (e.EMAIL_ENABLED !== "true" || !e.RESEND_API_KEY || !e.EMAIL_FROM)
        throw Error("Correo pendiente de configurar; no enviado.");
      const custom = await e.DB.prepare("SELECT data FROM content WHERE id=?")
        .bind("email:" + row.kind)
        .first<{ data: string }>();
      if (row.first_attempt && now - row.first_attempt >= 23 * 3600000)
        throw Error(
          "Revisión manual requerida: ventana de idempotencia de correo vencida.",
        );
      const rendered = row.rendered
        ? JSON.parse(row.rendered)
        : renderEmail(
            row.kind,
            JSON.parse(row.payload),
            custom ? JSON.parse(custom.data).text : undefined,
          );
      if (unsubscribeUrl && !rendered.html.includes(unsubscribeUrl))
        rendered.html = rendered.html.replace(
          "</main>",
          `<p><a href="${escape(unsubscribeUrl)}">Dejar de recibir noticias y promociones</a></p></main>`,
        );
      if (
        unsubscribeUrl &&
        rendered.text &&
        !rendered.text.includes(unsubscribeUrl)
      )
        rendered.text += "\n\nDejar de recibir noticias: " + unsubscribeUrl;
      await e.DB.prepare(
        "UPDATE outbox SET first_attempt=COALESCE(first_attempt,?),rendered=COALESCE(rendered,?) WHERE id=?",
      )
        .bind(now, JSON.stringify(rendered), row.id)
        .run();
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + e.RESEND_API_KEY,
          "Content-Type": "application/json",
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: e.EMAIL_FROM,
          to: [row.recipient],
          reply_to: e.EMAIL_REPLY_TO || "soporte@marlo.games",
          ...rendered,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error("Resend no aceptó el correo.");
      const result = (await response.json()) as { id: string };
      await e.DB.prepare(
        "UPDATE outbox SET status='sent',provider_id=?,error=NULL WHERE id=?",
      )
        .bind(result.id, row.id)
        .run();
    } catch (err) {
      const attempts = row.attempts + 1;
      await e.DB.prepare(
        "UPDATE outbox SET status=?,attempts=?,next_attempt=?,error=? WHERE id=?",
      )
        .bind(
          attempts >= 5 ? "failed" : "pending",
          attempts,
          now + Math.min(3600000, 60000 * 2 ** attempts),
          err instanceof Error ? err.message : "Error de envío",
          row.id,
        )
        .run();
    }
  }
  return rows.results.length;
}
