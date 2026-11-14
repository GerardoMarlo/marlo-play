import { useState } from "react";
import { api } from "./api";

type Slot = { date: string; startHour: string; endHour: string };
export function PickupScheduler({ orderId }: { orderId: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [requested, setRequested] = useState(false);
  async function load() {
    setBusy(true);
    setMessage("");
    setSlots([]);
    setSelected("");
    try {
      const result = await api<{ dates: Slot[] }>("/admin/pickup-dates?id=" + encodeURIComponent(orderId));
      setSlots(result.dates || []);
      if (!result.dates?.length) setMessage("No hay horarios disponibles. Consulta Skydropx.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function schedule() {
    const slot = slots[Number(selected)];
    if (selected === "" || !slot || busy || requested) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/admin/order", {
        id: orderId, action: "pickup",
        scheduledFrom: slot.date + " " + slot.startHour,
        scheduledTo: slot.date + " " + slot.endHour,
      });
      setRequested(true);
      setMessage("Solicitud de recolección enviada. Confirma su estado en Skydropx.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div>
    <button className="secondary" disabled={busy || requested} onClick={load}>
      {busy ? "Consultando…" : "Consultar horarios de recolección"}
    </button>
    {!!slots.length && !requested && <>
      <label>Horario ofrecido por el transportista
        <select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
          <option value="">Selecciona un horario</option>
          {slots.map((slot, index) => <option key={slot.date + slot.startHour + slot.endHour} value={index}>
            {slot.date} · {slot.startHour}–{slot.endHour}
          </option>)}
        </select>
      </label>
      <button disabled={busy || selected === ""} onClick={schedule}>Solicitar recolección</button>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
