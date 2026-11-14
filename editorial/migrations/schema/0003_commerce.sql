CREATE TABLE provider_throttle(id TEXT PRIMARY KEY,next_at INTEGER NOT NULL);
CREATE TABLE sandbox_webhook_events(id TEXT PRIMARY KEY,event_type TEXT NOT NULL,resource_id TEXT,verified_at INTEGER NOT NULL);
CREATE TABLE fulfillment(order_id TEXT PRIMARY KEY REFERENCES orders(id),rate_id TEXT UNIQUE NOT NULL,state TEXT NOT NULL DEFAULT 'creating',shipment_id TEXT UNIQUE,request TEXT NOT NULL,data TEXT,created INTEGER NOT NULL);
ALTER TABLE fulfillment ADD COLUMN pickup_state TEXT;
ALTER TABLE fulfillment ADD COLUMN pickup_data TEXT;
CREATE INDEX payment_reconciliation ON orders(payment,created);
ALTER TABLE orders ADD COLUMN payment_started INTEGER;
ALTER TABLE orders ADD COLUMN reconciled_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN quote_id TEXT REFERENCES quotes(id);
CREATE UNIQUE INDEX orders_quote_id ON orders(quote_id);
ALTER TABLE outbox ADD COLUMN first_attempt INTEGER;
ALTER TABLE outbox ADD COLUMN rendered TEXT;
CREATE TRIGGER logistics_history AFTER UPDATE OF logistics ON orders WHEN OLD.logistics<>NEW.logistics BEGIN
 INSERT INTO events(id,order_id,kind,created) VALUES(lower(hex(randomblob(16))),NEW.id,'logistics:'||NEW.logistics,unixepoch()*1000);
END;
CREATE TRIGGER payment_start_history AFTER UPDATE OF payment_started ON orders WHEN OLD.payment_started IS NULL AND NEW.payment_started IS NOT NULL BEGIN
 INSERT INTO events(id,order_id,kind,created) VALUES(lower(hex(randomblob(16))),NEW.id,'PAYMENT_PROCESSING',unixepoch()*1000);
END;
-- Record business facts without resetting stock when migrating an active shop.
UPDATE products SET data=json_set(data,'$.sku','MARLO-XMAS-001','$.price',25900,'$.components','64 cartas y un reglamento','$.weight',0.25,'$.length',8,'$.width',11,'$.height',4),version=version+1 WHERE id='intercambio-navideno';
-- Inventory intake is a separate, auditable action; do not blindly SET stock=2000.
