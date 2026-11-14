import { LocalPickupBooking } from "./LocalPickup";
import { useEffect, useState } from "react";
import { api } from "./api";
import { money } from "./domain";
import "./order.css";
import { TrackingDetails } from "./TrackingPage";

const payments: Record<string, string> = {
  paid: "Confirmado",
  pending: "Pendiente de verificación",
  rejected: "No aprobado",
  expired: "Pedido vencido",
  refunded: "Reembolsado",
  review: "En revisión",
};
const logistics: Record<string, string> = {
  pending_contact: "Pendiente de coordinación",
  scheduled: "Fecha de entrega acordada",
  ready: "Listo para entregar",
  label_created: "Guía creada; pendiente de envío",
  shipped: "En camino",
  delivered: "Entregado",
  incident: "Incidencia en revisión",
};
export function OrderPage({
  local,
  confirmation = false,
}: {
  local: boolean;
  confirmation?: boolean;
}) {
  const [order, setOrder] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [challenge, setChallenge] = useState("");
  const [number, setNumber] = useState(new URLSearchParams(location.search).get("guia") || "");
  const [shipments, setShipments] = useState<any[]>([]);
  const [trackingError, setTrackingError] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setShipments([]); setTrackingError(""); setTrackingBusy(false);
    if (order?.tracking && order.delivery !== "local") {
      setTrackingBusy(true);
      api("/order-tracking").then(r => { if (active) setShipments(r.shipments); })
        .catch(() => { if (active) setTrackingError("No pudimos actualizar el rastreo. Intenta más tarde."); })
        .finally(() => { if (active) setTrackingBusy(false); });
    }
    return () => { active = false; };
  }, [order]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    // Retire legacy fragments immediately; they no longer grant access.
    if (location.hash) history.replaceState(null, "", "/consultar-pedido");
    for (const key of Object.keys(localStorage))
      if (key.startsWith("marlo-order:") || key === "marlo-last-order")
        localStorage.removeItem(key);
    api("/order-session")
      .then(setOrder)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      if (!local && ["pending", "review"].includes(order.payment))
        await api("/orders/" + order.orderNumber + "/refresh", {});
      setOrder(await api("/order-session"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function lookup(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!challenge) {
        const result = await api("/order-access/request", {
          orderNumber: number,
          email,
        });
        setChallenge(result.challengeId);
        setMessage(result.message);
      } else {
        await api("/order-access/verify", { challengeId: challenge, code });
        setOrder(await api("/order-session"));
        setMessage("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Consultando tu pedido…</p>;
  const paid = order?.payment === "paid";
  const localDelivery = order?.delivery === "local";
  const seen = (kind: string) =>
    order?.history?.some((event: any) => event.kind === kind);
  const milestones = order
    ? [
        ["Pedido recibido", true],
        ["Pago confirmado", seen("payment:paid") || paid],
        [
          "Preparación",
          ["ready", "scheduled", "shipped", "delivered"].includes(
            order.logistics,
          ),
        ],
        ...(localDelivery
          ? [
              [
                "Listo para recoger",
                seen("pickup_ready") || ["ready", "scheduled", "delivered"].includes(order.logistics),
              ],
              [
                "Entrega acordada",
                ["scheduled", "delivered"].includes(order.logistics),
              ],
            ]
          : [
              ["Guía creada", !!order.tracking],
              [
                "Enviado",
                seen("logistics:shipped") ||
                  ["shipped", "delivered"].includes(order.logistics),
              ],
            ]),
        [
          "Entregado",
          order.logistics === "delivered" || seen("logistics:delivered"),
        ],
      ]
    : [];
  return (
    <div className="order-page">
      {!order ? (
        <section className="form-card">
          <span className="eyebrow">TU PRÓXIMA PARTIDA</span>
          <h1>Rastrea tu pedido</h1>
          <p>
            Ingresa tu número de pedido o guía y el correo electrónico que utilizaste
            durante la compra.
          </p>
          <form onSubmit={lookup}>
            <label>
              Número de pedido o guía
              <input
                required
                autoComplete="off"
                placeholder="Número de pedido o guía"
                maxLength={100}
                value={number}
                disabled={!!challenge}
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
            <label>
              Correo electrónico
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                disabled={!!challenge}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {challenge && (
              <label>
                Código de verificación
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
            {message && <p role="status">{message}</p>}
            <button disabled={busy}>
              {busy
                ? "Verificando…"
                : challenge
                  ? "Verificar código"
                  : "Rastrear mi pedido"}
            </button>
            {challenge && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setChallenge("");
                  setCode("");
                  setMessage("");
                }}
              >
                Cambiar datos o solicitar otro código
              </button>
            )}
          </form>
          <p className="muted">
            Si no encuentras tu número, revisa el correo de tu compra o{" "}
            <a href="/contacto">contacta a soporte</a>.
          </p>
        </section>
      ) : (
        <>
          <section className="order-hero">
            <span className="eyebrow">MARLO GAMES · TU PEDIDO</span>
            <h1>
              {confirmation
                ? paid
                  ? "¡Tu pedido está confirmado!"
                  : order.payment === "pending" || order.payment === "review"
                    ? "Estamos verificando tu pago"
                    : order.payment === "refunded"
                      ? "Tu pago fue reembolsado"
                      : "Tu pago no fue confirmado"
                : "El estado de tu pedido"}
            </h1>
            {confirmation && paid && (
              <p>
                Gracias por comprar en Marlo Games. Tu próxima partida está cada
                vez más cerca.
              </p>
            )}
            {order.payment === "pending" && (
              <p>
                El pedido está registrado. Confirmaremos la compra cuando el
                proveedor confirme el pago.
              </p>
            )}
            <p className="order-reference">
              <span>Número de pedido</span>
              <strong>{order.orderNumber}</strong>
            </p>
            <p>
              {new Date(order.created).toLocaleDateString("es-MX", {
                dateStyle: "long",
              })}{" "}
              · {order.email}
            </p>
          </section>
          <section className="form-card">
            <h2>Tu próxima partida</h2>
            {order.lines?.map((line: any, i: number) => (
              <p key={i}>
                {line.quantity} × {line.title}{" "}
                <strong>{money(line.amount)} MXN</strong>
              </p>
            ))}
            <dl className="order-facts">
              <div>
                <dt>{paid ? "Total pagado" : "Total del pedido"}</dt>
                <dd>{money(order.total)} MXN</dd>
              </div>
              <div>
                <dt>Pago</dt>
                <dd>{payments[order.payment] || "En revisión"}</dd>
              </div>
              <div>
                <dt>Preparación</dt>
                <dd>
                  {!paid
                    ? "Pendiente de pago confirmado"
                    : [
                          "ready",
                          "shipped",
                          "delivered",
                        ].includes(order.logistics)
                      ? "Preparación completada"
                      : "Preparando tu pedido"}
                </dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>
                  {localDelivery
                    ? "GRATIS ENTREGA LOCAL · Plaza La Perla, Zapopan"
                    : "Envío a domicilio"}
                </dd>
              </div>
              <div>
                <dt>Estado de entrega</dt>
                <dd>
                  {!localDelivery && order.logistics === "pending_contact"
                    ? "Pendiente de envío"
                    : logistics[order.logistics] || "Pendiente"}
                </dd>
              </div>
            </dl>
            <ol className="order-timeline">
              {milestones.map(([label, complete]) => (
                <li key={String(label)} className={complete ? "complete" : ""}>
                  <span aria-hidden="true">{complete ? "✓" : "○"}</span>
                  {label}
                  <small>{complete ? "Completado" : "Pendiente"}</small>
                </li>
              ))}
            </ol>
            {localDelivery ? (
              <LocalPickupBooking key={order.id} orderId={order.id} />
            ) : (
              order.tracking && <div>
                <h2>Seguimiento de tu envío</h2>
                {trackingBusy && <p role="status">Consultando la paquetería…</p>}
                {trackingError && <p role="alert">{trackingError}</p>}
                {shipments.map(shipment => shipment.result
                  ? <TrackingDetails key={shipment.number} result={shipment.result} />
                  : <p key={shipment.number}>Guía {shipment.number}: {shipment.error}</p>)}
              </div>
            )}
            <div className="order-actions">
              <button disabled={busy} onClick={refresh}>
                {busy ? "Consultando…" : "Actualizar estado"}
              </button>
              {confirmation && (
                <a className="button secondary" href="/consultar-pedido">
                  Consultar estado de mi pedido
                </a>
              )}
              <a className="button secondary" href="/juegos">
                Seguir explorando
              </a>
              <button
                className="secondary"
                onClick={() => {
                  setOrder(undefined);
                  setChallenge("");
                  setError("");
                }}
              >
                Consultar otro pedido
              </button>
            </div>
          </section>
          {local && (
            <section className="sandbox-box">
              <h3>Simulación local</h3>
              <p>No representa un pago real.</p>
              {["pending", "paid", "rejected", "refunded"].map((state) => (
                <button
                  key={state}
                  onClick={async () => {
                    try {
                      await api("/orders/" + order.orderNumber + "/simulate", {
                        state,
                      });
                      setOrder(await api("/order-session"));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {payments[state]}
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
