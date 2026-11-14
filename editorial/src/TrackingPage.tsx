import { trackingLabels, type TrackingResult } from "./tracking-status";
import "./tracking.css";
export function trackingDate(value: string) {
  // Carrier dates without an offset are printed as supplied, not shifted to a guessed zone.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
    return value.replace("T", " ").replace(/:\d{2}(\.\d+)?$/, "");
  return (
    new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    }).format(new Date(value)) + " (hora del centro de México)"
  );
}
export function TrackingDetails({ result }: { result: TrackingResult }) {
 const milestones = ["created", "picked_up", "in_transit", "last_mile", "delivered"];
 const observed = new Set(result.events.map(e => e.status));
 return (
        <section
          className="tracking-result"
          aria-label="Estado del envío"
          aria-live="polite"
        >
          <p className="eyebrow">TU ENVÍO</p>
          <h2>
            {trackingLabels[result.status] ||
              "Esperando información de la paquetería"}
          </h2>
          <dl>
            <div>
              <dt>Paquetería</dt>
              <dd>{result.carrier}</dd>
            </div>
            <div>
              <dt>Número de guía</dt>
              <dd>{result.trackingNumber}</dd>
            </div>
            <div>
              <dt>Última actualización disponible</dt>
              <dd>
                {result.updatedAt
                  ? trackingDate(result.updatedAt)
                  : "Sin fecha informada"}
              </dd>
            </div>
          </dl>
          {result.stale && (
            <p className="tracking-notice">
              No pudimos actualizar el historial ahora. Mostramos únicamente la
              última información confirmada; puedes volver a consultar más
              tarde.
            </p>
          )}
          <ol className="tracking-milestones" aria-label="Etapas del envío">
            {milestones.map((status) => {
              const state =
                result.status === status
                  ? "current"
                  : observed.has(status)
                    ? "complete"
                    : "pending";
              return (
                <li
                  key={status}
                  className={state}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span aria-hidden="true">
                    {state === "complete"
                      ? "✓"
                      : state === "current"
                        ? "●"
                        : "○"}
                  </span>
                  <strong>{trackingLabels[status]}</strong>
                  <small>
                    {state === "current"
                      ? "Estado actual"
                      : state === "complete"
                        ? "Confirmado"
                        : "Sin confirmar"}
                  </small>
                </li>
              );
            })}
          </ol>
          <p className="tracking-caption">
            Las etapas sin confirmar son una referencia del recorrido. No
            indican que tu paquete ya haya pasado por ellas.
          </p>
          <h3>Historial del envío</h3>
          {result.events.length ? (
            <ol className="tracking-history">
              {result.events.map((event, i) => (
                <li key={event.status + event.date + i}>
                  <strong>{trackingLabels[event.status]}</strong>
                  <span>
                    {event.date
                      ? trackingDate(event.date)
                      : "Fecha no informada por la paquetería"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>La paquetería todavía no ha compartido eventos de rastreo.</p>
          )}
        </section>
 );
}
