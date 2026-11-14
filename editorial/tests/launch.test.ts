import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { database } from "./db";
import launch from "../data/intercambio-navideno.json";
import { productSchema, totals } from "../src/domain";
import { pageMetadata, jsonForHtml } from "../src/seo";
import site from "../api/site";
const migration = readFileSync(
  new URL(
    "../migrations/schema/0002_intercambio_navideno.sql",
    import.meta.url,
  ),
  "utf8",
);
it("registers the launch at 259 MXN without enabling purchase or inventing measurements", () => {
  const { sqlite } = database();
  sqlite.exec(migration);
  const row = sqlite
    .prepare("SELECT * FROM products WHERE slug='intercambio-navideno'")
    .get()!;
  const p = productSchema.parse(JSON.parse(row.data as string));
  expect(p.price).toBe(25900);
  expect(row.stock).toBe(0);
  expect(p.status).toBe("coming_soon");
  expect(p.weight).toBe(0);
  expect(() => totals([{ id: p.id, quantity: 1 }], [p], "national")).toThrow(
    "no está disponible",
  );
  expect(
    productSchema.safeParse({ ...p, status: "available", stock: 1 }).success,
  ).toBe(false);
  sqlite.close();
});
it("renames an existing product while retaining its identity, SKU and inventory", () => {
  const { sqlite } = database();
  const old = {
    ...launch,
    id: "legacy-id",
    sku: "ORIGINAL-SKU",
    slug: "xmas-xchange",
    title: "Xmas Xchange",
    stock: 7,
  };
  sqlite
    .prepare("INSERT INTO products(id,slug,data,stock) VALUES(?,?,?,?)")
    .run(old.id, old.slug, JSON.stringify(old), 7);
  sqlite.exec(migration);
  const row = sqlite
    .prepare("SELECT * FROM products WHERE slug='intercambio-navideno'")
    .get()!;
  const p = JSON.parse(row.data as string);
  expect(row.id).toBe("legacy-id");
  expect(p.sku).toBe("ORIGINAL-SKU");
  expect(row.stock).toBe(7);
  expect(p.title).toBe("Intercambio Navideño");
  expect(p.status).toBe("coming_soon");
  expect(
    sqlite
      .prepare("SELECT count(*) n FROM products WHERE slug='xmas-xchange'")
      .get()?.n,
  ).toBe(0);
  sqlite.close();
});
it("requires quoted delivery, quantities and coupon calculations at the commercial price", () => {
  const p = productSchema.parse({
    ...launch,
    status: "available",
    stock: 5,
    weight: 1,
    length: 1,
    width: 1,
    height: 1,
  });
  expect(totals([{ id: p.id, quantity: 2 }], [p], "national").total).toBe(
    51800,
  );
  expect(totals([{ id: p.id, quantity: 1 }], [p], "local").total).toBe(25900);
  expect(
    totals([{ id: p.id, quantity: 2 }], [p], "national", {
      code: "TEST",
      type: "percent",
      value: 10,
      starts: 0,
      expires: Date.now() + 10000,
      maxUses: 10,
      perCustomer: 1,
      minimum: 0,
      eligible: [],
      active: true,
      combinable: false,
    }).total,
  ).toBe(46620);
});
it("emits canonical product identity, exact price and unavailable schema without unsafe script contents", () => {
  const m = pageMetadata(
    "/juegos/intercambio-navideno",
    "",
    productSchema.parse(launch),
  );
  expect(m.product?.offers.price).toBe("259.00");
  expect(m.product?.offers.availability).toContain("OutOfStock");
  expect(m.url).toBe("https://marlo.games/juegos/intercambio-navideno");
  expect(m.image).toContain("https://marlo.games/images/");
  expect(m.title).not.toMatch(/xmas/i);
  expect(jsonForHtml({ name: "</script>" })).not.toContain("<");
});
it("redirects the former public slug permanently while preserving query parameters", async () => {
  const r = await site.fetch(
    new Request("https://marlo.games/juegos/xmas-xchange?ref=test"),
    {} as any,
    {} as any,
  );
  expect(r.status).toBe(301);
  expect(r.headers.get("Location")).toBe(
    "https://marlo.games/juegos/intercambio-navideno?ref=test",
  );
});
it("rejects unsafe image paths but accepts bundled art and HTTPS administration images", () => {
  expect(
    productSchema.safeParse({ ...launch, image: "//external.test/a" }).success,
  ).toBe(false);
  expect(
    productSchema.safeParse({ ...launch, image: "/images/../secret" }).success,
  ).toBe(false);
  expect(
    productSchema.safeParse({
      ...launch,
      image: "https://example.com/new.webp",
    }).success,
  ).toBe(true);
});
