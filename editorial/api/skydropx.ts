import { z } from "zod";
import { addressSchema, BusinessError } from "../src/domain";
import type { Env } from "./types";
import type { ShippingQuote } from "./providers";
import { chooseShipping, serviceEvidence } from "./shipping-policy";
import type { PackedParcel } from "../src/packaging";
const parcelsSchema = z
  .array(
    z.object({
      weight: z.number().positive(),
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  )
  .min(1)
  .max(30);
const originSchema = z
  .object({
    country_code: z.literal("MX"),
    postal_code: z.string().regex(/^\d{5}$/),
    area_level1: z.string().min(1),
    area_level2: z.string().min(1),
    area_level3: z.string().min(1),
  })
  .passthrough();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function skyClient(
  e: Env,
  transport: typeof fetch = fetch,
  wait = sleep,
) {
  if (
    !e.SKYDROPX_CLIENT_ID ||
    !e.SKYDROPX_CLIENT_SECRET ||
    (e.MODE !== "sandbox" && e.MODE !== "production") ||
    e.SKYDROPX_ENVIRONMENT !== e.MODE
  )
    throw new BusinessError(
      "Skydropx pendiente de configurar para este ambiente.",
      503,
    );
  const base =
    e.SKYDROPX_ENVIRONMENT === "production"
      ? "https://api-pro.skydropx.com"
      : "https://sb-pro.skydropx.com";
  let token = "",
    expiry = 0;
  async function raw(path: string, init: RequestInit) {
    if (e.DB) {
      const slot = await e.DB.prepare(
        "INSERT INTO provider_throttle(id,next_at) VALUES('skydropx',?) ON CONFLICT(id) DO UPDATE SET next_at=max(next_at,?)+550 RETURNING next_at",
      )
        .bind(Date.now() + 550, Date.now())
        .first<{ next_at: number }>();
      const delay = Math.max(0, (slot?.next_at || 0) - Date.now() - 550);
      if (delay > 20000)
        throw new BusinessError(
          "Skydropx ocupado. Intenta de nuevo en un momento.",
          429,
        );
      if (delay) await wait(delay);
    }
    try {
      return await transport(base + path, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BusinessError(
        "Skydropx no está disponible. Revisa el estado antes de reintentar.",
        503,
      );
    }
  }
  async function authenticate() {
    if (token && expiry > Date.now()) return;
    const r = await raw("/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: e.SKYDROPX_CLIENT_ID!,
        client_secret: e.SKYDROPX_CLIENT_SECRET!,
      }),
    });
    if (!r.ok) throw new BusinessError("Skydropx no autenticó la cuenta.", 503);
    const d: any = await r.json();
    if (typeof d.access_token !== "string")
      throw new BusinessError("Respuesta de autenticación inválida.", 502);
    token = d.access_token;
    expiry =
      Date.now() + Math.min(Number(d.expires_in) || 7200, 7200) * 1000 - 60000;
  }
  return async function send(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await authenticate();
      const r = await raw(path, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 401 && attempt === 0) {
        token = "";
        continue;
      }
      if (r.status === 429 && attempt < 2) {
        await wait(
          Math.min(10, Math.max(1, Number(r.headers.get("Retry-After")) || 2)) *
            1000,
        );
        continue;
      }
      // Official tracking contract: 404 means no carrier events yet, not a fabricated journey.
      if (
        r.status === 404 &&
        method === "GET" &&
        path.startsWith("/api/v1/shipments/tracking?")
      )
        return { data: [] };
      if (!r.ok)
        throw new BusinessError(
          "Skydropx no pudo completar la solicitud. Revisa el estado antes de reintentar.",
          r.status === 409 ? 409 : 503,
        );
      return r.json();
    }
    throw new BusinessError("Skydropx temporalmente no disponible.", 503);
  };
}
export async function quoteSkydropx(
  e: Env,
  address: unknown,
  items: unknown,
  transport: typeof fetch = fetch,
  wait = sleep,
): Promise<ShippingQuote> {
  const send = skyClient(e, transport, wait);
  if (!e.SHIPPING_ORIGIN_JSON)
    throw new BusinessError(
      "Falta configurar el origen privado de Skydropx.",
      503,
    );
  const a = addressSchema.parse(address),
    parcels = parcelsSchema.parse(items),
    origin = originSchema.parse(JSON.parse(e.SHIPPING_ORIGIN_JSON));
  const started = Date.now();
  let q = await send("/api/v1/quotations", "POST", {
    quotation: {
      address_from: origin,
      address_to: {
        country_code: "MX",
        postal_code: a.postalCode,
        area_level1: a.state,
        area_level2: a.city,
        area_level3: a.colony,
      },
      parcels,
    },
  });
  if (typeof q.id !== "string")
    throw new BusinessError("Cotización inválida.", 502);
  const id = q.id;
  for (let i = 0; q.is_completed !== true && i < 12; i++) {
    await wait(1000);
    q = await send("/api/v1/quotations/" + encodeURIComponent(id));
  }
  if (q.is_completed !== true)
    throw new BusinessError(
      "La cotización sigue en proceso. Vuelve a consultar.",
      503,
    );
  const selected = chooseShipping(
    Array.isArray(q.rates) ? q.rates : [],
    serviceEvidence.parse(JSON.parse(e.SHIPPING_SERVICES_JSON || "[]")),
    parcels.length,
  );
  return {
    id,
    ...selected,
    expires: Math.min(started + 24 * 3600000, selected.evidence.validUntil),
    fixture: false,
    parcels,
    packaging: (items as PackedParcel[]).every((p) => p.packaging)
      ? {
          parcels: (items as PackedParcel[]).map((p) => p.packaging),
          costCents: (items as PackedParcel[]).some(
            (p) => p.packaging.costCents === null,
          )
            ? null
            : (items as PackedParcel[]).reduce(
                (s, p) => s + p.packaging.costCents!,
                0,
              ),
          config: JSON.parse(e.SHIPPING_PACKAGING_JSON || "null"),
        }
      : undefined,
  };
}
export async function prepareShipment(
  e: Env,
  q: ShippingQuote,
  address: unknown,
) {
  if (e.LABELS_ENABLED !== "true" || q.fixture)
    throw new BusinessError("Compra de guías deshabilitada.", 403);
  if (q.expires <= Date.now() || !q.parcels)
    throw new BusinessError(
      "Cotización vencida. Recotiza y autoriza el importe.",
      409,
    );
  if (!e.SHIPPING_CONSIGNMENT_NOTE || !e.SHIPPING_PACKAGE_TYPE)
    throw new BusinessError(
      "Confirma los códigos Carta Porte y embalaje.",
      503,
    );
  const a = addressSchema.parse(address),
    origin = JSON.parse(e.SHIPPING_ORIGIN_JSON || "{}");
  const details = z
    .object({
      street1: z.string().min(1).max(45),
      name: z.string().min(1).max(30),
      company: z.string().max(60),
      phone: z.string().min(10),
      email: z.email(),
      reference: z.string().max(40).optional(),
      apartment_number: z.string().optional(),
      further_information: z.string().max(70).optional(),
    })
    .passthrough();
  const destination = details.parse({
    street1: a.street + " " + a.exterior,
    name: a.recipient,
    company: "",
    phone: a.phone,
    email: a.email,
    apartment_number: a.interior,
    reference: a.references.slice(0, 40),
    further_information: a.references.slice(40, 110),
  });
  const send = skyClient(e);
  const current = await send("/api/v1/quotations/" + encodeURIComponent(q.id));
  if (current.is_completed !== true)
    throw new BusinessError("La tarifa ya no está confirmada.", 409);
  const selected = chooseShipping(
    current.rates || [],
    serviceEvidence.parse(JSON.parse(e.SHIPPING_SERVICES_JSON || "[]")),
    q.parcels.length,
  );
  if (
    selected.rateId !== q.rateId ||
    selected.method !== q.method ||
    selected.cost !== q.cost
  )
    throw new BusinessError(
      "Cambió la tarifa. Requiere revisión administrativa sin cargo extra al cliente.",
      409,
    );
  return {
    shipment: {
      rate_id: q.rateId,
      unique_shipment: true,
      printing_format: "standard",
      office_delivery: false,
      office_pickup: q.method === "dropoff",
      ...(q.officeId ? { office_pickup_point_id: q.officeId } : {}),
      address_from: details.parse(origin),
      address_to: destination,
      packages: q.parcels.map((_, i) => ({
        package_number: String(i + 1),
        package_protected: false,
        consignment_note: e.SHIPPING_CONSIGNMENT_NOTE,
        package_type: e.SHIPPING_PACKAGE_TYPE,
      })),
    },
  };
}
export async function createShipment(e: Env, payload: unknown) {
  if (e.LABELS_ENABLED !== "true")
    throw new BusinessError("Compra de guías deshabilitada.", 403);
  return skyClient(e)("/api/v1/shipments", "POST", payload);
}
export async function getShipment(e: Env, id: string) {
  const d = await skyClient(e)("/api/v1/shipments/" + encodeURIComponent(id));
  if (d.data?.id !== id)
    throw new BusinessError("Referencia de envío incorrecta.", 502);
  const packages = (d.included || [])
    .filter((x: any) => x.type === "package" || x.type === "packages")
    .map((x: any) => x.attributes);
  return {
    id,
    carrier: d.data.attributes?.carrier_name,
    workflow: d.data.attributes?.workflow_status,
    cost: Math.round(Number(d.data.attributes?.total) * 100),
    packages,
  };
}
