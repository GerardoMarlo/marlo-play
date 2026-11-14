export const trackingLabels: Record<string, string> = {
  created: "Guía generada",
  picked_up: "Recibido por paquetería",
  in_transit: "En tránsito",
  last_mile: "En ruta de entrega",
  delivery_attempt: "Intento de entrega",
  delivered_to_branch: "Disponible en sucursal de paquetería",
  delivered: "Entregado",
  exception: "Incidencia con el envío",
  in_return: "En devolución",
  canceled: "Envío cancelado",
  destroyed: "Incidencia con el envío",
  retained: "Incidencia con el envío",
};
export type TrackingEvent = { status: string; date: string | null };
export type TrackingResult = {
  trackingNumber: string;
  carrier: string;
  status: string;
  updatedAt: string | null;
  events: TrackingEvent[];
  stale: boolean;
};
