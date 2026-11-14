import { pickupDate } from "../src/local-pickup-config";
import { commercialName, money } from "../src/domain";
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const emailCopy: Record<string, string> = {
  received:
    "¡Qué gusto que hayas elegido Marlo Games! Ya registramos tu pedido. Por ahora, estamos esperando la confirmación del pago. En cuanto el proveedor lo confirme, te avisaremos por correo y comenzaremos a preparar tu compra. Puedes revisar su estado desde nuestra página web. ¡Gracias por elegirnos!",
  paid: "¡Muchas gracias por comprar en Marlo Games!\n\nNos hace mucha ilusión que uno de nuestros juegos vaya a formar parte de tus próximas reuniones. Creamos nuestros juegos para compartir momentos divertidos, y nos encanta saber que pronto disfrutarás uno.\n\n¡Tu pago está confirmado y ya tenemos tu pedido! Ahora nos toca a nosotros preparar todo con mucho cariño. Te enviaremos otra actualización cuando tu pedido esté listo para envío o recolección.\n\n¡Gracias por apoyar a una editorial independiente mexicana!",
  pickup_ready:
    "¡Buenas noticias! Tu pedido ya está listo para entregarse. Como elegiste nuestra opción de entrega local gratuita, puedes pasar a recogerlo en Plaza La Perla, Zapopan. Elige el día y horario que mejor te acomoden, entre los que tenemos disponibles. Una vez que elijas tu horario, recibirás la confirmación de nuestra cita. ¡Qué emoción que tu próxima partida esté tan cerca!",
  pickup_confirmed:
    "¡Perfecto! Ya tenemos fecha para entregarte tu juego. Tu cita quedó confirmada. ¡Gracias por elegir Marlo Games! Ya casi empieza tu próxima partida.",
  pickup_rescheduled:
    "Actualizamos el horario de tu entrega. Esta es tu nueva cita confirmada. ¡Nos vemos pronto!",
  pickup_cancelled:
    "Tu cita de entrega fue cancelada. Esto no cancela ni reembolsa tu compra. Si tu pedido sigue listo para recoger, puedes elegir otro horario disponible desde la página de tu pedido.",
  pickup_reminder:
    "Tu cita para recoger tu pedido de Marlo Games será en aproximadamente dos horas. Si necesitas otro horario, pulsa Reprogramar cita e ingresa con el número de pedido y el correo de tu compra. Puedes reprogramar antes de que empiece tu cita, sujeto a disponibilidad. ¡Nos vemos pronto!",
  pickup_same_day:
    "Hoy tenemos una cita para entregarte tu pedido. ¡Tu próxima partida está muy cerca!",
  pickup_completed:
    "¡Gracias por recoger tu pedido y por apoyar a Marlo Games! Que disfrutes muchísimo tu juego y las partidas que vienen.",
  rejected:
    "El proveedor reportó que tu pago fue rechazado. Sabemos que estas cosas pasan, así que queremos ayudarte a resolverlo. Puedes revisar el estado de tu pedido y, si corresponde, volver a intentar el pago. Si ves algún cargo en tu cuenta, contáctanos antes de intentar nuevamente para ayudarte a verificarlo.",
  payment_failed:
    "El proveedor informó que el pago no pudo completarse. Revisa el estado del pedido. Si ves algún cargo en tu cuenta, contáctanos antes de intentar nuevamente.",
  payment_cancelled:
    "El proveedor informó que el proceso de pago fue cancelado. Revisa el estado del pedido. Si ves algún cargo en tu cuenta, contáctanos antes de intentar nuevamente.",
  refunded:
    "El proveedor de pagos confirmó que procesó el reembolso de tu pedido. El tiempo que tarde en reflejarse en tu cuenta dependerá del método de pago y de tu institución financiera. Sentimos que esta compra no haya salido como esperabas. Si necesitas ayuda, estamos aquí para escucharte. Gracias por habernos dado la oportunidad de formar parte de tus partidas.",
  refund_initiated:
    "Registramos la solicitud de reembolso. Aún estamos esperando la confirmación del proveedor de pagos.",
  refund_failed:
    "El proveedor no pudo completar la solicitud de reembolso. Nuestro equipo debe revisar el caso.",
  label_created:
    "¡Tu pedido está cada vez más cerca! Ya preparamos la guía de envío y estamos organizando la entrega del paquete a la paquetería. Todavía no significa que el transportista lo haya recibido, pero puedes consultar su información desde ahora. Te avisaremos cuando el envío esté oficialmente en camino.",
  shipped:
    "¡Tu pedido ya salió rumbo a ti! Terminamos de prepararlo y ya está en manos de la paquetería. Ahora solo queda esperar a que llegue para empezar la diversión. ¡Gracias de nuevo por elegir Marlo Games! Esperamos que disfrutes muchísimo tu juego.",
  delivered:
    "¡Tenemos buenas noticias! La paquetería nos informó que tu pedido ya fue entregado. Esperamos que haya llegado en perfectas condiciones y que muy pronto esté sobre la mesa, rodeado de risas y buenos momentos. Si algo no llegó como esperabas, escríbenos y con gusto te ayudaremos. ¡Muchas gracias por apoyar a Marlo Games!",
  lead: "¡Gracias por contactarnos y por querer llevar Marlo Games a tu tienda! Recibimos tu solicitud de mayoreo y pronto nos pondremos en contacto contigo. Mientras tanto, puedes responder a este correo contándonos dónde está ubicada tu tienda y cuántas unidades piensas adquirir. ¡Nos encantará preparar la próxima partida contigo!",
  contact:
    "¡Gracias por escribirnos! Ya recibimos tu mensaje y pronto nos pondremos en contacto contigo. ¡En breve nos toca mover ficha y seguir la partida contigo!",
  pickup_invitation_reminder:
    "¡Tu juego sigue esperando su próxima partida contigo! Tu pedido ya está listo para recoger en Plaza La Perla, Zapopan, y todavía falta agendar tu entrega gratuita. Entra al enlace, consulta tu pedido con su número y el correo de tu compra, y elige un día y horario disponible. Recibirás un correo cuando tu cita quede confirmada. Si necesitas ayuda, responde a este correo. ¡Nos vemos pronto!",
  order_cancelled:
    "Tu pedido fue cancelado. Puedes consultar su estado y contactarnos si necesitas ayuda. La cancelación del pedido no confirma por sí sola un reembolso.",
  support_followup:
    "Tenemos una actualización sobre tu consulta. Gracias por permitirnos ayudarte.",
  incident:
    "Revisa el estado verificado del proveedor y atiende el pedido desde el administrador.",
  internal_preparation:
    "Preparar el pedido local pagado. Márcalo listo únicamente cuando esté empacado y disponible para entregar.",
  internal_pickup_ready:
    "Pedido listo sin cita. Revisar disponibilidad y seguimiento si continúa sin agendar.",
  internal_pickup_confirmed:
    "Cita confirmada. Preparar los juegos para la entrega indicada.",
  internal_pickup_rescheduled:
    "Cita reprogramada. Usar el nuevo horario indicado.",
  internal_pickup_cancelled:
    "Cita cancelada. Mantener la compra pagada y reservada si corresponde; no realizar un reembolso por esta cancelación.",
  internal_pickup_completed: "Entrega local registrada como completada.",
  internal_pickup_approaching:
    "Entrega en aproximadamente dos horas. Verifica los juegos, el punto de encuentro y el responsable. Usa el teléfono o el botón Abrir WhatsApp para contactar al cliente.",
  internal_pickup_overdue:
    "La hora de entrega pasó y el pedido no figura recogido. Revisar el caso y contactar al cliente.",
  internal_lead:
    "Revisar la solicitud comercial y contactar a la tienda con información pertinente.",
  internal_contact:
    "Revisar el mensaje recibido y responder al contacto indicado.",
};
const subjects: Record<string, string> = {
  received: "¡Ya tenemos tu pedido! Solo falta confirmar el pago",
  paid: "¡Gracias por tu compra! Tu próxima partida comienza aquí 🎲",
  pickup_ready: "¡Tu juego está listo! Elige cuándo recogerlo 🎁",
  pickup_confirmed: "¡Nos vemos pronto! Tu entrega ya está agendada 📅",
  pickup_rescheduled: "Tu entrega tiene un nuevo horario — Marlo Games",
  pickup_cancelled: "Tu cita de entrega fue cancelada — Marlo Games",
  pickup_reminder: "Tu entrega es en aproximadamente 2 horas — Marlo Games",
  internal_pickup_approaching: "Entrega en aproximadamente 2 horas — Marlo Games",
  internal_pickup_rescheduled: "Cita reprogramada — Marlo Games",
  pickup_same_day: "¡Hoy nos vemos! Tu juego te espera 🎁",
  pickup_completed: "¡Que empiece la partida! Gracias por recoger tu juego 🎲",
  rejected: "Hubo un problema con el pago de tu pedido",
  payment_failed: "Hubo un problema con el pago de tu pedido",
  payment_cancelled: "El proceso de pago fue cancelado",
  refunded: "Marlo Games · Reembolso confirmado",
  refund_initiated: "Marlo Games · Reembolso solicitado",
  refund_failed: "Marlo Games · Reembolso no completado",
  pickup_invitation_reminder: "Marlo Games · Agenda tu entrega gratuita",
  label_created: "¡Tu paquete ya tiene guía! 📦",
  shipped: "¡Tu juego ya va en camino! 📦",
  delivered: "¡Que empiece la partida! Tu pedido fue entregado 🎲",
  order_code: "Tu código para consultar tu pedido — Marlo Games",
  lead: "¡Gracias por querer llevar Marlo Games a tu tienda!",
  contact: "¡Gracias por escribirnos! — Marlo Games",
  order_cancelled: "Tu pedido fue cancelado — Marlo Games",
  support_followup: "Seguimiento de tu consulta — Marlo Games",
};
export function renderEmail(
  kind: string,
  p: Record<string, any>,
  copy = emailCopy[kind] || "Actualización de Marlo Games",
) {
  const id =
    p.orderNumber || (/^MG-\d{4}-\d{6,}$/.test(p.id || "") ? p.id : "");
  const internal = kind.startsWith("internal_") || kind === "incident";
  const subjectBase =
    (kind === "pickup_reminder" &&
    p.appointmentStart &&
    pickupDate(p.appointmentStart) === pickupDate(Date.now() + 86400000)
      ? "¡Mañana nos vemos! Tu juego te espera 🎁"
      : subjects[kind]) ||
    (internal
      ? "Acción Marlo Games · " +
        kind.replace("internal_", "").replaceAll("_", " ")
      : "Actualización de Marlo Games");
  const subject = subjectBase + (id ? " · " + id : "");
  const paragraphs =
    kind === "order_code"
      ? [
          "Recibimos una solicitud para consultar un pedido de Marlo Games.",
          "Tu código de verificación es: " + String(p.code),
          "Este código vence en 10 minutos y solo puede utilizarse una vez. Si tú no solicitaste este código, puedes ignorar el mensaje.",
        ]
      : copy.split("\n\n");
  if (kind === "paid" && p.delivery === "local")
    paragraphs.push("Elegiste la entrega local gratuita en Plaza La Perla, Zapopan, Jalisco. Cuando tu pedido esté listo para recoger, te enviaremos el enlace para que elijas por tu cuenta un día y horario disponible. Tu cita quedará reservada cuando recibas su confirmación por correo.");
  const details: string[] = [];
  if (id) details.push("Pedido: " + id);
  if (Array.isArray(p.lines))
    for (const l of p.lines)
      details.push(
        `${l.quantity} × ${commercialName(l.title)} — ${money(l.amount)} MXN`,
      );
  if (typeof p.total === "number")
    details.push("Total: " + money(p.total) + " MXN");
  if (kind === "refunded" && typeof p.refundAmount === "number")
    details.push("Importe reembolsado: " + money(p.refundAmount) + " MXN");
  if (p.delivery)
    details.push(
      p.delivery === "local"
        ? "Entrega local gratuita — Plaza La Perla, Zapopan, Jalisco"
        : "Envío nacional",
    );
  if (p.appointment)
    details.push("Cita: " + p.appointment + " (hora de Ciudad de México)");
  if (p.meetingPoint) details.push("Punto de encuentro: " + p.meetingPoint);
  if (p.assignedPerson) details.push("Responsable: " + p.assignedPerson);
  if (p.address)
    details.push(
      ["street", "exterior", "colony", "city", "state", "postalCode"]
        .map((k) => p.address[k] || "")
        .filter(Boolean)
        .join(", "),
    );
  const labels: Record<string, string> = {
    store: "Tienda",
    name: "Nombre",
    email: "Correo",
    phone: "Teléfono",
    city: "Ciudad",
    state: "Estado",
    website: "Sitio",
    comments: "Comentarios",
    message: "Mensaje",
    provider: "Proveedor",
    verifiedStatus: "Estado verificado",
    errorCategory: "Categoría",
  };
  if (internal || ["lead", "contact", "support_followup"].includes(kind))
    for (const [k, label] of Object.entries(labels))
      if (p[k]) details.push(label + ": " + p[k]);
  // Checkout stores Mexican numbers as +52 followed by ten digits.
  // Links are generated only for internal local-pickup notifications.
  const pickupContact = kind === "internal_preparation" || kind.startsWith("internal_pickup_");
  const rawPhone = typeof p.phone === "string" ? p.phone.trim() : "";
  const digits = /^[+\d\s().-]+$/.test(rawPhone) ? rawPhone.replace(/\D/g, "") : "";
  const contactNumber = /^\d{10}$/.test(digits) ? "52" + digits : /^52\d{10}$/.test(digits) ? digits : "";
  const contactLinks = pickupContact && contactNumber
    ? [{ label: "Llamar al cliente", url: "tel:+" + contactNumber }, { label: "Abrir WhatsApp", url: "https://wa.me/" + contactNumber }]
    : [];
  const numbers =
    p.delivery === "local"
      ? []
      : (Array.isArray(p.trackingNumbers)
          ? p.trackingNumbers
          : typeof p.tracking === "string"
            ? p.tracking.split(",").map((v: string) => v.trim())
            : []
        ).filter(
          (v: unknown) =>
            typeof v === "string" && /^[A-Za-z0-9-]{6,50}$/.test(v),
        );
  const origin = "https://marlo.games";
  const cta = internal
    ? "Abrir administrador"
    : ["pickup_ready", "pickup_invitation_reminder"].includes(kind)
      ? "Agendar mi entrega gratuita"
      : kind === "pickup_reminder"
        ? "Reprogramar cita"
      : kind.startsWith("pickup_")
        ? "Ver o cambiar mi cita"
        : id
          ? "Consultar mi pedido"
          : kind === "lead"
            ? "Conocer la editorial"
            : "Contactar a Marlo Games";
  const url =
    origin +
    (internal
      ? "/admin"
      : kind.startsWith("pickup_")
        ? "/pedido/agendar-entrega"
        : id
          ? "/consultar-pedido"
          : kind === "lead"
            ? "/nosotros"
            : "/contacto");
  const greeting = internal
    ? "Equipo de Marlo Games:"
    : p.name
      ? "¡Hola, " + p.name + "!"
      : "¡Hola!";
  const signature = internal
    ? "Marlo Games · Operaciones"
    : "Con cariño,\nEl equipo de Marlo Games 🐘";
  const tracking = numbers.map((n: string, i: number) => ({
    text: `Paquete ${i + 1}${p.carrier ? " · " + p.carrier : ""} · Guía: ${n}`,
    url: origin + "/rastrear-pedido?guia=" + encodeURIComponent(n),
  }));
  const text = [
    greeting,
    ...paragraphs,
    ...details,
    ...contactLinks.map(link => link.label + ": " + link.url),
    ...tracking.map((t: any) => t.text + "\nRastrear mi paquete: " + t.url),
    ...(kind === "order_code" ? [] : [cta + ": " + url]),
    signature,
    "Ayuda: " + origin + "/contacto",
  ].join("\n\n");
  const html = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f8f1e5;color:#28251f;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:28px 20px"><img src="${origin}/brand/marlo-logo-ink.png" alt="Marlo Games" width="200" style="display:block;width:200px;max-width:100%;height:auto;margin:0 0 28px"><p>${escape(greeting)}</p><h1 style="font:700 25px/1.3 Georgia,serif;color:#a53f1d">${escape(subject)}</h1>${paragraphs.map((t) => `<p>${escape(t)}</p>`).join("")}<div style="padding:16px;background:#fffaf2;border-radius:12px;overflow-wrap:anywhere">${details.map((t) => `<p style="margin:5px 0;white-space:pre-line">${escape(t)}</p>`).join("")}</div>${contactLinks.length ? `<p>${contactLinks.map(link => `<a href="${escape(link.url)}" style="display:inline-block;background:#efce5c;color:#28251f;padding:12px 16px;margin:6px 8px 6px 0;border-radius:8px;text-decoration:none;font-weight:bold">${escape(link.label)}</a>`).join("")}</p>` : ""}${tracking.map((t: any) => `<p>${escape(t.text)}<br><a href="${escape(t.url)}" style="color:#923717">Rastrear mi paquete</a></p>`).join("")}${kind === "order_code" ? "" : `<p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#efce5c;color:#28251f;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${cta}</a></p>`}<p style="white-space:pre-line">${escape(signature)}</p><hr style="border:0;border-top:1px solid #d9cbb6"><p style="font-size:14px"><a href="${origin}/contacto" style="color:#923717">Ayuda y contacto</a><br>Marlo Games · Jalisco, México</p></main></body></html>`;
  return { subject, html, text };
}
