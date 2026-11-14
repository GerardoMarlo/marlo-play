PRAGMA foreign_keys=ON;
CREATE TABLE products(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),stock INTEGER NOT NULL CHECK(stock>=0),version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE content(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE coupons(code TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)),uses INTEGER NOT NULL DEFAULT 0 CHECK(uses>=0));
CREATE TABLE quotes(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,data TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE orders(id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,access_token TEXT NOT NULL,email TEXT NOT NULL,data TEXT NOT NULL,total INTEGER NOT NULL CHECK(total>=0),discount INTEGER NOT NULL,shipping INTEGER NOT NULL,shipping_cost INTEGER NOT NULL DEFAULT 0,payment TEXT NOT NULL DEFAULT 'pending',logistics TEXT NOT NULL DEFAULT 'pending_contact',provider TEXT NOT NULL,provider_id TEXT UNIQUE,expires INTEGER NOT NULL,created INTEGER NOT NULL,coupon TEXT REFERENCES coupons(code),tracking TEXT,notes TEXT NOT NULL DEFAULT '',appointment TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE order_items(order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL CHECK(quantity>0),price INTEGER NOT NULL,PRIMARY KEY(order_id,product_id));
CREATE TABLE coupon_uses(order_id TEXT PRIMARY KEY REFERENCES orders(id),code TEXT NOT NULL REFERENCES coupons(code),email TEXT NOT NULL);
CREATE TRIGGER reserve_stock AFTER INSERT ON order_items BEGIN
 UPDATE products SET stock=stock-NEW.quantity,version=version+1 WHERE id=NEW.product_id;
END;
CREATE TRIGGER reserve_coupon BEFORE INSERT ON coupon_uses BEGIN
 SELECT CASE WHEN (SELECT uses>=json_extract(data,'$.maxUses') FROM coupons WHERE code=NEW.code) THEN RAISE(ABORT,'Coupon exhausted') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM coupon_uses WHERE code=NEW.code AND email=NEW.email)>=(SELECT json_extract(data,'$.perCustomer') FROM coupons WHERE code=NEW.code) THEN RAISE(ABORT,'Customer coupon limit') END;
 UPDATE coupons SET uses=uses+1 WHERE code=NEW.code;
END;
CREATE TRIGGER release_stock AFTER UPDATE OF payment ON orders WHEN OLD.payment='pending' AND NEW.payment IN ('expired','rejected') BEGIN
 UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id),version=version+1 WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
 UPDATE coupons SET uses=uses-1 WHERE code IN (SELECT code FROM coupon_uses WHERE order_id=NEW.id);
 DELETE FROM coupon_uses WHERE order_id=NEW.id;
END;
CREATE TABLE events(id TEXT PRIMARY KEY,order_id TEXT,kind TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE outbox(id TEXT PRIMARY KEY,recipient TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,error TEXT,provider_id TEXT);
CREATE TABLE leads(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'nuevo',notes TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
CREATE TABLE messages(id TEXT PRIMARY KEY,data TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE rate_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE postal_codes(code TEXT NOT NULL,colony TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(code,colony));
CREATE INDEX orders_created ON orders(created);
CREATE INDEX outbox_due ON outbox(status,next_attempt);
