CREATE TABLE shipment_tracking (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES orders(id),
 shipment_id TEXT NOT NULL,
 tracking_number TEXT NOT NULL,
 carrier TEXT NOT NULL,
 tracking_url TEXT,
 status TEXT NOT NULL DEFAULT 'unknown',
 status_at TEXT,
 checked_at INTEGER NOT NULL DEFAULT 0,
 refresh_after INTEGER NOT NULL DEFAULT 0,
 UNIQUE(order_id,carrier,tracking_number)
);
CREATE INDEX tracking_lookup ON shipment_tracking(tracking_number);
CREATE TABLE shipment_tracking_events (
 id TEXT PRIMARY KEY,
 tracking_id TEXT NOT NULL REFERENCES shipment_tracking(id),
 status TEXT NOT NULL,
 occurred_at TEXT,
 source TEXT NOT NULL,
 recorded_at INTEGER NOT NULL
);
CREATE INDEX tracking_history ON shipment_tracking_events(tracking_id,occurred_at);
CREATE TABLE shipping_webhook_receipts (
 id TEXT PRIMARY KEY, processed INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL
);
ALTER TABLE fulfillment ADD COLUMN tracking_checked_at INTEGER NOT NULL DEFAULT 0;
-- Update only the two requested FAQ entries, preserving all other site content.
UPDATE content SET data=json_set(data,'$.faq',json((SELECT json_group_array(json(CASE
 WHEN json_extract(value,'$[0]')='¿Cuánto cuesta el envío?' THEN json_array('¿Cuánto cuesta el envío?','Ofrecemos dos opciones de entrega:

• Entrega local gratuita ($0 MXN): recoge tu pedido en Plaza La Perla, Zapopan, Jalisco, previa coordinación. Disponible para clientes de la Zona Metropolitana de Guadalajara.

• Envío a domicilio nacional ($70 MXN): recibe tu pedido directamente en tu domicilio, sujeto a cobertura de nuestras paqueterías. Validamos la cobertura antes del pago.')
 WHEN json_extract(value,'$[0]')='¿Cómo puedo consultar el estado de mi pedido?' THEN json_array('¿Cómo puedo consultar el estado de mi pedido?','Cuando enviemos tu pedido, recibirás por correo electrónico un número de guía. Ingresa ese número en nuestra página de Rastreo de pedidos para consultar dónde está tu paquete y conocer su estado de entrega. Si elegiste entrega local gratuita, te contactaremos para coordinar la entrega en Plaza La Perla.')
 ELSE value END)) FROM json_each(content.data,'$.faq')))) WHERE id='site' AND json_type(data,'$.faq')='array';
