import { useEffect, useState } from "react";
import { api } from "./api";
import {
  defaultPickupSettings,
  pickupDate,
  pickupInstant,
  pickupLabel,
  pickupTime,
} from "./local-pickup-config";
import "./local-pickup.css";
const statuses: Record<string, string> = {
  pending: "Confirmando con la agenda",
  rescheduling: "Confirmando el nuevo horario",
  cancelling: "Procesando cancelación",
  confirmed: "Cita confirmada",
  cancelled: "Cancelada",
  completed: "Recogido",
};
export function LocalPickupBooking({ orderId }: { orderId: string }) {
  const [day, setDay] = useState(""),
    [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => api("/pickup" + (day ? "?date=" + day : "")).then(setData);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    api("/pickup" + (day ? "?date=" + day : ""))
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [day, orderId]);
  async function change(action: string, start?: number) {
    setBusy(true);
    setError("");
    try {
      await api("/pickup", {
        action,
        start,
        version: data.appointment?.version,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const a = data?.appointment;
  return (
    <section className="pickup-panel">
      <h2>Tu entrega en Plaza La Perla</h2>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        error ? (
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              void load().catch((e) => setError(e.message));
            }}
          >
            Reintentar consulta
          </button>
        ) : (
          <p role="status">Consultando agenda…</p>
        )
      ) : (
        <>
          {a && (
            <div className="pickup-confirmation">
              <strong>{statuses[a.status]}</strong>
              <p>
                {pickupLabel(a.start)} · {pickupTime(a.end)}
              </p>
              <p>{a.meetingPoint}</p>
              {a.status !== "confirmed" && (
                <>
                  <p>
                    Estamos verificando tu cambio. Te enviaremos un correo
                    cuando se confirme.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => load().catch((e) => setError(e.message))}
                  >
                    Actualizar cita
                  </button>
                </>
              )}
            </div>
          )}
          {!data.eligible ? (
            <p>
              {data.orderStatus === "delivered"
                ? "Tu pedido ya fue entregado. ¡Que disfrutes tus partidas!"
                : data.payment !== "paid"
                  ? "Para agendar se requiere un pago confirmado. Consulta arriba el estado de tu pedido."
                  : "Te avisaremos por correo cuando tu pedido esté listo para recoger."}
            </p>
          ) : !data.enabled ? (
            <p>
              La agenda todavía no está disponible. Puedes contactarnos para
              coordinar tu entrega.
            </p>
          ) : (
            (!a || a.status === "confirmed") && (
              <>
                <p>
                  Entrega gratuita · {data.durationMinutes} minutos por cita ·
                  Hora de Ciudad de México.
                </p>
                <p>{data.meetingPoint}</p>
                <p>
                  Reserva con al menos {data.noticeHours} horas de anticipación.
                  Puedes reprogramar antes de que empiece tu cita, sujeto a disponibilidad.
                  Puedes cancelar hasta {data.cutoffHours} horas antes.
                </p>
                <label>
                  {a ? "Reprogramar cita" : "Elige un día"}
                  <input
                    type="date"
                    min={pickupDate(Date.now())}
                    max={pickupDate(Date.now() + 60 * 86400000)}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {day && (
                  <div
                    className="pickup-slots"
                    aria-label="Horarios disponibles"
                  >
                    {data.slots.length ? (
                      data.slots.map((s: any) => (
                        <button
                          key={s.start}
                          disabled={busy}
                          onClick={() =>
                            change(a ? "reschedule" : "book", s.start)
                          }
                        >
                          {pickupTime(s.start)}–{pickupTime(s.end)}
                        </button>
                      ))
                    ) : (
                      <p>
                        No hay horarios disponibles ese día. Prueba otra fecha.
                      </p>
                    )}
                  </div>
                )}
                {a && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Cancelar la cita? Tu compra seguirá pagada y podrás elegir otro horario.",
                        )
                      )
                        void change("cancel");
                    }}
                  >
                    Cancelar mi cita
                  </button>
                )}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export function LocalPickupAdmin({
  orders,
  refresh,
}: {
  orders: any[];
  refresh: () => void;
}) {
  const [data, setData] = useState<any>(),
    [settings, setSettings] = useState(defaultPickupSettings),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [day, setDay] = useState(pickupDate(Date.now()));
  const load = async () => {
    const v = await api("/admin/local-pickup");
    setData(v);
    setSettings(v.settings);
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function action(b: any) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/local-pickup", b);
      await load();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const num = (
    key: "durationMinutes" | "noticeHours" | "cutoffHours" | "bufferMinutes",
    label: string,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={key === "durationMinutes" ? 5 : 0}
        value={settings[key]}
        onChange={(e) =>
          setSettings({ ...settings, [key]: Number(e.target.value) })
        }
      />
    </label>
  );
  return (
    <section className="pickup-panel">
      <h2>Agenda de entregas locales</h2>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Cargando…</p>
      ) : (
        <>
          <p>
            {data.configured && data.featureEnabled
              ? "Conexión habilitada"
              : "Pendiente de configurar o habilitar Google Calendar en el servidor."}
          </p>
          <details>
            <summary>Disponibilidad y punto de encuentro</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action({ action: "settings", settings });
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                />
                Permitir reservas cuando la conexión esté habilitada
              </label>
              <div className="pickup-settings">
                {num("durationMinutes", "Minutos por cliente")}
                {num("noticeHours", "Anticipación mínima (horas)")}
                {num("cutoffHours", "Plazo para cambios (horas)")}
                {num("bufferMinutes", "Margen antes y después (minutos)")}
              </div>
              <label>
                Punto de encuentro
                <input
                  required={settings.enabled}
                  value={settings.meetingPoint}
                  onChange={(e) =>
                    setSettings({ ...settings, meetingPoint: e.target.value })
                  }
                />
              </label>
              <label>
                Responsable
                <input
                  value={settings.assignedPerson}
                  onChange={(e) =>
                    setSettings({ ...settings, assignedPerson: e.target.value })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.sameDayReminder}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sameDayReminder: e.target.checked,
                    })
                  }
                />
                Recordatorio adicional el mismo día
              </label>
              {(["windows", "breaks"] as const).map((key) => (
                <fieldset key={key}>
                  <legend>
                    {key === "windows" ? "Horarios semanales" : "Descansos"}
                  </legend>
                  {settings[key].map((w, i) => (
                    <div className="pickup-row" key={i}>
                      <select
                        aria-label="Día"
                        value={w.day}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            [key]: settings[key].map((x, j) =>
                              j === i
                                ? { ...x, day: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      >
                        {weekdays.map((d, n) => (
                          <option key={d} value={n}>
                            {d}
                          </option>
                        ))}
                      </select>
                      {(["start", "end"] as const).map((k) => (
                        <input
                          key={k}
                          aria-label={k === "start" ? "Inicio" : "Fin"}
                          type="time"
                          value={w[k]}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              [key]: settings[key].map((x, j) =>
                                j === i ? { ...x, [k]: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      ))}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            [key]: settings[key].filter((_, j) => j !== i),
                          })
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        [key]: [
                          ...settings[key],
                          { day: 1, start: "", end: "" },
                        ],
                      })
                    }
                  >
                    Añadir {key === "windows" ? "horario" : "descanso"}
                  </button>
                </fieldset>
              ))}
              <fieldset>
                <legend>Cierres y días festivos</legend>
                {settings.closures.map((c, i) => (
                  <div className="pickup-row" key={i}>
                    {(["date", "start", "end"] as const).map((k) => (
                      <input
                        aria-label={k}
                        key={k}
                        type={k === "date" ? "date" : "time"}
                        value={c[k]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            closures: settings.closures.map((x, j) =>
                              j === i ? { ...x, [k]: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    ))}
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          closures: settings.closures.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      closures: [
                        ...settings.closures,
                        { date: day, start: "00:00", end: "23:59" },
                      ],
                    })
                  }
                >
                  Añadir cierre
                </button>
              </fieldset>
              <button disabled={busy}>Guardar disponibilidad</button>
            </form>
          </details>
          <h3>Preparación</h3>
          {orders
            .filter(
              (o) =>
                JSON.parse(o.data).checkout.delivery === "local" &&
                o.payment === "paid" &&
                ["pending_contact", "incident"].includes(o.logistics),
            )
            .map((o) => (
              <p key={o.id}>
                {o.public_number} · {JSON.parse(o.data).checkout.name}{" "}
                <button
                  disabled={busy}
                  onClick={() => action({ action: "ready", orderId: o.id })}
                >
                  Marcar listo para recoger
                </button>
              </p>
            ))}
          <h3>Pendientes de agendar</h3>
          <p>Reenvía la invitación para que el cliente elija su horario. Se envía como máximo un recordatorio por pedido al día. Puedes editar el texto en Correos, plantilla pickup_invitation_reminder.</p>
          {orders.filter(o => JSON.parse(o.data).checkout.delivery === "local" && o.payment === "paid" && o.logistics === "ready" && !data.appointments.some((a: any) => a.order_id === o.id && !["cancelled", "completed"].includes(a.status))).map(o => (
            <p key={o.id}>{o.public_number} · {JSON.parse(o.data).checkout.name}{" "}
              <button disabled={busy} onClick={() => action({ action: "invite", orderId: o.id })}>Reenviar invitación para agendar</button>
            </p>
          ))}
          <h3>Calendario</h3>
          <label>
            Fecha
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <div className="pickup-week">
            {Array.from({ length: 7 }, (_, i) =>
              pickupDate(pickupInstant(day, "12:00") + i * 86400000),
            ).map((d) => (
              <button className="secondary" key={d} onClick={() => setDay(d)}>
                {d}
                <br />
                {
                  data.appointments.filter(
                    (a: any) =>
                      pickupDate(a.start) === d && a.status === "confirmed",
                  ).length
                }{" "}
                citas
              </button>
            ))}
          </div>
          {data.appointments
            .filter((a: any) => pickupDate(a.start) === day)
            .map((a: any) => {
              const d = JSON.parse(a.data);
              return (
                <article key={a.id} className="pickup-confirmation">
                  <h4>
                    {pickupTime(a.start)}–{pickupTime(a.end)} ·{" "}
                    {a.public_number}
                  </h4>
                  <p>
                    {d.checkout.name} · {a.email} · {d.checkout.phone}
                  </p>
                  <p>
                    {d.totals?.lines?.reduce(
                      (n: number, l: any) => n + l.quantity,
                      0,
                    ) || 0}{" "}
                    juegos · {statuses[a.status]} · {a.assigned_person}
                  </p>
                  <p>{a.meeting_point}</p>
                  {a.error && (
                    <>
                      <p role="alert">{a.error}</p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action({
                            action: "cancel",
                            orderId: a.order_id,
                            version: a.version,
                          })
                        }
                      >
                        Cancelar solicitud pendiente
                      </button>
                    </>
                  )}
                  {a.status === "confirmed" && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          action({ action: "completed", orderId: a.order_id })
                        }
                      >
                        Marcar recogido
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          action({
                            action: "cancel",
                            orderId: a.order_id,
                            version: a.version,
                          })
                        }
                      >
                        Cancelar cita
                      </button>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void action({
                            action: "reschedule",
                            orderId: a.order_id,
                            version: a.version,
                            start: pickupInstant(
                              String(f.get("date")),
                              String(f.get("time")),
                            ),
                          });
                        }}
                      >
                        <label>
                          Nueva fecha
                          <input required type="date" name="date" />
                        </label>
                        <label>
                          Hora de Ciudad de México
                          <input required type="time" name="time" />
                        </label>
                        <button disabled={busy}>Reprogramar</button>
                      </form>
                    </>
                  )}
                </article>
              );
            })}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => action({ action: "reconcile" })}
          >
            Reintentar sincronizaciones pendientes
          </button>
          <details>
            <summary>Próximas citas y pendientes</summary>
            {data.appointments
              .filter(
                (a: any) => !["completed", "cancelled"].includes(a.status),
              )
              .sort((a: any, b: any) => a.start - b.start)
              .map((a: any) => (
                <p key={a.id}>
                  <button
                    className="secondary"
                    onClick={() => setDay(pickupDate(a.start))}
                  >
                    {pickupLabel(a.start)} · {a.public_number} ·{" "}
                    {statuses[a.status]}
                  </button>
                </p>
              ))}
          </details>
          <details>
            <summary>Historial de citas</summary>
            {data.history.map((h: any) => (
              <p key={h.id}>
                {pickupLabel(h.created)} · {h.action} · {h.actor}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
