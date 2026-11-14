ALTER TABLE orders ADD COLUMN public_number TEXT;
CREATE UNIQUE INDEX orders_public_number ON orders(public_number);
CREATE TABLE order_number_registry(sequence INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT UNIQUE NOT NULL,year TEXT NOT NULL);
INSERT INTO order_number_registry(order_id,year) SELECT id,strftime('%Y',created/1000,'unixepoch') FROM orders ORDER BY created,id;
UPDATE orders SET public_number=(SELECT 'MG-'||year||'-'||printf('%06d',sequence) FROM order_number_registry WHERE order_id=orders.id);
CREATE TRIGGER assign_order_number AFTER INSERT ON orders BEGIN
 INSERT INTO order_number_registry(order_id,year) VALUES(NEW.id,strftime('%Y',NEW.created/1000,'unixepoch'));
 UPDATE orders SET public_number=(SELECT 'MG-'||year||'-'||printf('%06d',sequence) FROM order_number_registry WHERE order_id=NEW.id) WHERE id=NEW.id;
END;
CREATE TRIGGER preserve_order_number BEFORE UPDATE OF public_number ON orders WHEN OLD.public_number IS NOT NULL AND NEW.public_number IS NOT OLD.public_number BEGIN SELECT RAISE(ABORT,'Immutable order number'); END;
CREATE TRIGGER preserve_number_registry BEFORE DELETE ON order_number_registry BEGIN SELECT RAISE(ABORT,'Order numbers are never reused'); END;
CREATE TABLE order_sessions(token_hash TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),expires INTEGER NOT NULL);
CREATE INDEX order_sessions_expiry ON order_sessions(expires);
CREATE TABLE order_challenges(id TEXT PRIMARY KEY,order_id TEXT REFERENCES orders(id),code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX order_challenges_expiry ON order_challenges(expires);
-- Rewrite queued customer email links, including cached templates. Preserve send/idempotency history.
UPDATE outbox SET payload=json_set(payload,'$.orderNumber',(SELECT public_number FROM orders WHERE id=json_extract(outbox.payload,'$.id')),'$.orderUrl','https://marlo.games/consultar-pedido'),rendered=CASE WHEN first_attempt IS NULL THEN NULL ELSE rendered END,status=CASE WHEN first_attempt IS NOT NULL THEN 'review' ELSE status END WHERE json_extract(payload,'$.id') IN (SELECT id FROM orders) AND status IN ('pending','processing','failed','preview');

UPDATE content SET data=json_set(data, '$.faq', (SELECT json_group_array(json(CASE WHEN json_extract(value,'$[0]')='¿Cómo puedo consultar el estado de mi pedido?' THEN json_array('¿Cómo puedo consultar el estado de mi pedido?','Al realizar tu compra recibirás un número de pedido, que también enviaremos a tu correo electrónico. Puedes consultar el estado de tu compra en nuestra página web ingresando ese número y tu correo. Cuando enviemos tu paquete, también recibirás un número de guía para rastrear su entrega.') ELSE value END)) FROM json_each(content.data,'$.faq'))) WHERE id='site' AND json_type(data,'$.faq')='array';
