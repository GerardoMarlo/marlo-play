import { useState } from "react";
import { api } from "./api";
export function Unsubscribe() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="reading">
      <h1>Dejar de recibir noticias</h1>
      <p>
        La baja de promociones no afecta tus pedidos ni los avisos necesarios
        sobre tus compras.
      </p>
      <button
        disabled={busy || !!message}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/marketing/unsubscribe", {
              token: location.hash.slice(1),
            });
            setMessage("Listo. Ya no recibirás comunicaciones promocionales.");
          } catch {
            setMessage(
              "No pudimos procesar la baja. Revisa el enlace o contacta a Marlo Games.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirmar baja
      </button>
      <p role="status">{message}</p>
      <a href="/contacto">Contactar a Marlo Games</a>
    </section>
  );
}
