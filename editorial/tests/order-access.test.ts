import { beforeEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { database } from "./db";
import worker, { updatePayment } from "../api/worker";
import { renderEmail } from "../api/emails";
import type { Env, OrderRow } from "../api/types";
let db: ReturnType<typeof database>;
let env: Env;
beforeEach(() => {
  db = database();
  env = {
    DB: db.db,
    MODE: "local",
    PUBLIC_ORIGIN: "http://localhost",
    PAYMENTS_ENABLED: "false",
    EMAIL_ENABLED: "false",
    LABELS_ENABLED: "false",
  };
});
async function call(path: string, body?: any, cookie?: string, headers = {}) {
  const response = await worker.fetch(
    new Request("http://localhost/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: "http://localhost",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return {
    response,
    status: response.status,
    data: (await response.json()) as any,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
const input = () => ({
  items: [{ id: "demo-mesa", quantity: 1 }],
  name: "Comprador",
  email: "buyer@example.com",
  phone: "3312345678",
  delivery: "local",
  localConsent: true,
  terms: true,
  privacy: true,
  provider: "mercadopago",
  idempotencyKey: crypto.randomUUID(),
});
async function challenge(number: string, email = "buyer@example.com") {
  const result = await call("/order-access/request", {
    orderNumber: number,
    email,
  });
  const mail = db.sqlite
    .prepare("SELECT payload FROM outbox WHERE id=?")
    .get("order-code:" + result.data.challengeId);
  return {
    ...result,
    code: mail ? JSON.parse(String(mail.payload)).code : undefined,
  };
}
it("assigns unique immutable public numbers, preserving internal UUIDs and idempotency", async () => {
  const payload = input(),
    first = await call("/orders", payload),
    retry = await call("/orders", payload),
    next = await call("/orders", input());
  expect(first.data.orderNumber).toMatch(/^MG-\d{4}-\d{6,}$/);
  expect(retry.data.orderNumber).toBe(first.data.orderNumber);
  expect(next.data.orderNumber).not.toBe(first.data.orderNumber);
  const stored = db.sqlite
    .prepare("SELECT * FROM orders WHERE public_number=?")
    .get(first.data.orderNumber)!;
  expect(stored.id).not.toBe(first.data.id);
  expect(JSON.stringify(first.data)).not.toContain(String(stored.id));
  expect(first.data.accessToken).toBeUndefined();
  expect(first.response.headers.get("set-cookie")).toContain(
    "HttpOnly; SameSite=Lax",
  );
  expect(() =>
    db.sqlite
      .prepare("UPDATE orders SET public_number='changed' WHERE id=?")
      .run(stored.id),
  ).toThrow();
  expect(() => db.sqlite.exec("DELETE FROM order_number_registry")).toThrow();
});
it("temporary session grants immediate status; a number or legacy bearer never grants access", async () => {
  const created = await call("/orders", input());
  expect(
    (await call("/order-session", undefined, created.cookie)).data.orderNumber,
  ).toBe(created.data.orderNumber);
  expect((await call("/orders/" + created.data.orderNumber)).status).toBe(403);
  const stored = db.sqlite.prepare("SELECT * FROM orders").get()!;
  expect(
    (
      await call("/orders/" + stored.id, undefined, undefined, {
        Authorization: "Bearer " + stored.access_token,
      })
    ).status,
  ).toBe(403);
  db.sqlite.exec("UPDATE order_sessions SET expires=0");
  expect((await call("/order-session", undefined, created.cookie)).status).toBe(
    401,
  );
});
it("isolates each order's session, masks email, and omits private data", async () => {
  const a = await call("/orders", input()),
    b = await call("/orders", input());
  expect(
    (await call("/orders/" + b.data.orderNumber, undefined, a.cookie)).status,
  ).toBe(403);
  const view = (await call("/order-session", undefined, a.cookie)).data;
  expect(view.email).toBe("b***@example.com");
  for (const key of ["address", "access_token", "data", "providerId"])
    expect(view[key]).toBeUndefined();
  expect(view.payment).toBe("pending");
});
it("number and email require a one-use code before issuing another session", async () => {
  const o = await call("/orders", input()),
    c = await challenge(o.data.orderNumber);
  expect(c.status).toBe(200);
  expect(c.code).toMatch(/^\d{6}$/);
  expect(c.data.code).toBeUndefined();
  const verified = await call("/order-access/verify", {
    challengeId: c.data.challengeId,
    code: c.code,
  });
  expect(verified.status).toBe(200);
  expect(
    (await call("/order-session", undefined, verified.cookie)).data.orderNumber,
  ).toBe(o.data.orderNumber);
  expect(
    (
      await call("/order-access/verify", {
        challengeId: c.data.challengeId,
        code: c.code,
      })
    ).status,
  ).toBe(403);
});
it("unknown number and mismatched email have the same generic response and send no email", async () => {
  const o = await call("/orders", input());
  const unknown = await challenge("MG-2026-999999", "other@example.com"),
    wrong = await challenge(o.data.orderNumber, "other@example.com");
  expect(unknown.data.message).toBe(wrong.data.message);
  expect(unknown.status).toBe(200);
  expect(wrong.status).toBe(200);
  expect(unknown.code).toBeUndefined();
  expect(wrong.code).toBeUndefined();
  expect(
    (
      await call("/order-access/verify", {
        challengeId: unknown.data.challengeId,
        code: "123456",
      })
    ).status,
  ).toBe(403);
});
it("expires codes and locks them after five wrong guesses", async () => {
  const o = await call("/orders", input()),
    c = await challenge(o.data.orderNumber);
  const wrong = c.code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++)
    expect(
      (
        await call("/order-access/verify", {
          challengeId: c.data.challengeId,
          code: wrong,
        })
      ).status,
    ).toBe(403);
  expect(
    (
      await call("/order-access/verify", {
        challengeId: c.data.challengeId,
        code: c.code,
      })
    ).status,
  ).toBe(403);
  const second = await challenge(o.data.orderNumber);
  db.sqlite.exec("UPDATE order_challenges SET expires=0");
  expect(
    (
      await call("/order-access/verify", {
        challengeId: second.data.challengeId,
        code: second.code,
      })
    ).status,
  ).toBe(403);
});
it("rate-limits code requests per mailbox regardless of existence", async () => {
  await challenge("MG-2026-999999");
  await challenge("MG-2026-999998");
  expect((await challenge("MG-2026-999997")).status).toBe(429);
});
it("requires same-origin POST and never exposes simulation outside local", async () => {
  const o = await call("/orders", input());
  expect(
    (
      await call("/order-access/request", {}, undefined, {
        Origin: "https://evil.example",
      })
    ).status,
  ).toBe(403);
  env.MODE = "production";
  expect(
    (
      await call(
        "/orders/" + o.data.orderNumber + "/simulate",
        { state: "paid" },
        o.cookie,
      )
    ).status,
  ).toBe(403);
});
it("only confirmed payment queues one paid email containing the public reference and ordinary lookup URL", async () => {
  const created = await call("/orders", input());
  const row = db.sqlite
    .prepare("SELECT * FROM orders")
    .get() as unknown as OrderRow;
  expect(
    db.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='paid'").get()
      ?.n,
  ).toBe(0);
  await updatePayment(env, row, "paid", "paid-one");
  await updatePayment(env, { ...row, payment: "paid" }, "paid", "paid-two");
  const rows = db.sqlite
    .prepare("SELECT * FROM outbox WHERE kind='paid'")
    .all();
  expect(rows).toHaveLength(1);
  const rendered = renderEmail("paid", JSON.parse(String(rows[0].payload)));
  expect(rendered.subject).toBe(
    "¡Gracias por tu compra! Tu próxima partida comienza aquí 🎲 · " + JSON.parse(String(rows[0].payload)).orderNumber,
  );
  expect(rendered.html).toContain("/consultar-pedido");
  expect(rendered.html).not.toContain(row.id);
  expect(rendered.html).not.toContain(row.access_token);
  expect(rendered.html).not.toContain("enlace privado");
  expect(
    (await call("/order-session", undefined, created.cookie)).data.payment,
  ).toBe("paid");
});
it("backfills existing orders without duplicating rows or altering inventory/history", () => {
  const legacy = database(false);
  legacy.sqlite
    .prepare(
      "INSERT INTO orders(id,idempotency_key,fingerprint,access_token,email,data,total,discount,shipping,provider,expires,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "legacy-id",
      "legacy-key",
      "fingerprint",
      "old-secret",
      "buyer@example.com",
      JSON.stringify({
        checkout: { delivery: "local" },
        totals: { lines: [] },
      }),
      25900,
      0,
      0,
      "paypal",
      0,
      Date.UTC(2025, 1, 1),
    );
  const before = legacy.sqlite
    .prepare("SELECT sum(stock) stock FROM products")
    .get()?.stock;
  legacy.sqlite.exec(
    readFileSync(
      new URL("../migrations/schema/0007_order_access.sql", import.meta.url),
      "utf8",
    ),
  );
  const row = legacy.sqlite.prepare("SELECT * FROM orders").get()!;
  expect(row.id).toBe("legacy-id");
  expect(row.public_number).toBe("MG-2025-000001");
  expect(legacy.sqlite.prepare("SELECT count(*) n FROM orders").get()?.n).toBe(
    1,
  );
  expect(
    legacy.sqlite.prepare("SELECT sum(stock) stock FROM products").get()?.stock,
  ).toBe(before);
});

it("looks up an exact guide with the owner's email and keeps other orders private", async () => {
  const first = await call("/orders", input());
  db.sqlite.prepare("UPDATE orders SET tracking='ABC123456, SECOND987' WHERE public_number=?").run(first.data.orderNumber);
  const found = await challenge("abc123456");
  expect(found.code).toMatch(/^\d{6}$/);
  const verified = await call("/order-access/verify", { challengeId: found.data.challengeId, code: found.code });
  expect((await call("/order-session", undefined, verified.cookie)).data.orderNumber).toBe(first.data.orderNumber);
  expect((await challenge("ABC123456", "wrong@example.com")).code).toBeUndefined();
  expect((await call("/order-tracking")).status).toBe(401);
  const tracking = await call("/order-tracking", undefined, verified.cookie);
  expect(tracking.data.shipments.map((s: any) => s.number)).toEqual(["ABC123456", "SECOND987"]);
});
it("does not match a partial guide", async () => {
  const first = await call("/orders", input());
  db.sqlite.prepare("UPDATE orders SET tracking='ABC123456' WHERE public_number=?").run(first.data.orderNumber);
  expect((await challenge("ABC123")).code).toBeUndefined();
});
