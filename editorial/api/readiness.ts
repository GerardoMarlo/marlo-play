import type { Env, OrderRow } from "./types";
export function lifecycle(o: OrderRow) {
  if (o.payment === "review") return "PAYMENT_REVIEW";
  if (o.payment === "refunded") return "REFUNDED";
  if (o.payment === "rejected") return "PAYMENT_FAILED";
  if (o.payment === "expired") return "CANCELLED";
  if (o.payment !== "paid")
    return o.payment_started ? "PAYMENT_PROCESSING" : "PENDING_PAYMENT";
  if (JSON.parse(o.data).checkout?.delivery === "local") {
    if (o.logistics === "ready") return "READY_FOR_PICKUP";
    if (o.logistics === "scheduled") return "PICKUP_SCHEDULED";
    if (o.logistics === "delivered") return "PICKED_UP";
  }
  return (
    (
      {
        label_created: "LABEL_CREATED",
        shipped: "SHIPPED",
        delivered: "DELIVERED",
      } as Record<string, string>
    )[o.logistics] || "FULFILLMENT_PENDING"
  );
}
export function readiness(e: Env, authenticatedAdmin = false) {
  const entry = (keys: (keyof Env)[], enabled = true) => ({
    status: keys.every((k) => !!e[k]) && enabled ? "NOT TESTED" : "BLOCKED",
    missing: keys.filter((k) => !e[k]),
    enabled,
    reason: keys.some(k => !e[k]) ? "Configuración incompleta." : !enabled ? "Credenciales configuradas. Operación desactivada hasta completar las pruebas." : "Configuración presente. Falta validar el flujo completo.",
  });
  return {
    mode: e.MODE,
    localPickup: entry(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CALENDAR_ID"], e.LOCAL_PICKUP_ENABLED === "true"),
    mercadopago: entry(
      ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY", "MP_WEBHOOK_SECRET"],
      e.PAYMENTS_ENABLED === "true" && e.MP_ENABLED === "true",
    ),
    paypal: entry(
      [
        "PAYPAL_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET",
        "PAYPAL_WEBHOOK_ID",
        "PAYPAL_ENVIRONMENT",
      ],
      e.PAYMENTS_ENABLED === "true" && e.PAYPAL_ENABLED === "true",
    ),
    skydropx: entry([
      "SKYDROPX_CLIENT_ID",
      "SKYDROPX_CLIENT_SECRET",
      "SKYDROPX_ENVIRONMENT",
      "SHIPPING_ORIGIN_JSON",
      "SHIPPING_PACKAGING_JSON",
      "SHIPPING_SERVICES_JSON",
    ]),
    resend: entry(["RESEND_API_KEY", "EMAIL_FROM"], e.EMAIL_ENABLED === "true"),
    labels: entry(
      ["SHIPPING_CONSIGNMENT_NOTE", "SHIPPING_PACKAGE_TYPE"],
      e.LABELS_ENABLED === "true",
    ),
    admin: authenticatedAdmin && e.MODE === "production" ? {status: "READY", missing: [], enabled: true, reason: "Sesión actual autenticada: firma, audiencia y correo autorizado verificados."} : entry(["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ADMIN_EMAILS"]),
    antiBot: entry(["TURNSTILE_SECRET", "TURNSTILE_SITE_KEY"]),
  };
}
