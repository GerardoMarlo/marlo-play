-- User-confirmed opening stock. Refuse to overwrite an already active inventory.
CREATE TABLE inventory_adjustments(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TRIGGER apply_inventory_adjustment AFTER INSERT ON inventory_adjustments BEGIN
 UPDATE products SET stock=stock+NEW.quantity,version=version+1 WHERE id=NEW.product_id;
END;
INSERT OR IGNORE INTO inventory_adjustments(id,product_id,quantity,reason,created)
 SELECT 'opening-MARLO-XMAS-001-20261018',id,2000,'Opening stock confirmed by owner',unixepoch()*1000
 FROM products WHERE id='intercambio-navideno' AND stock=0 AND NOT EXISTS(SELECT 1 FROM order_items WHERE product_id=products.id);
UPDATE products SET data=json_set(data,'$.status','available'),version=version+1 WHERE id='intercambio-navideno' AND EXISTS(SELECT 1 FROM inventory_adjustments WHERE id='opening-MARLO-XMAS-001-20261018');
