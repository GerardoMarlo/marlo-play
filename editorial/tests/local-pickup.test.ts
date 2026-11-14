import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { database } from "./db";
import worker, { updatePayment } from "../api/worker";
import {
  changeAppointment,
  markPickup,
  processPickups,
  syncAppointment,
  adminPickup,
} from "../api/local-pickup";
import { processOutbox, renderEmail, emailCopy } from "../api/emails";
import {
  defaultPickupSettings,
  pickupInstant,
} from "../src/local-pickup-config";
import type { Env, OrderRow } from "../api/types";
let d: ReturnType<typeof database>,
  e: Env,
  events: Map<string, any>,
  fail: boolean,
  loseResponse: boolean,
  sent: any[];
const now = pickupInstant("2026-10-23", "09:00"),
  start = pickupInstant("2026-10-26", "10:00");
const settings = {
  ...defaultPickupSettings,
  enabled: true,
  meetingPoint: "Punto configurado por el administrador",
  windows: [{ day: 1, start: "10:00", end: "12:00" }],
};
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  d = database();
  events = new Map();
  fail = false;
  loseResponse = false;
  sent = [];
  e = {
    DB: d.db,
    MODE: "local",
    PUBLIC_ORIGIN: "http://localhost",
    PAYMENTS_ENABLED: "false",
    EMAIL_ENABLED: "false",
    LABELS_ENABLED: "false",
    LOCAL_PICKUP_ENABLED: "true",
    GOOGLE_CALENDAR_ID: "private-calendar",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    GOOGLE_REFRESH_TOKEN: "test",
    ADMIN_EMAIL: "admin@example.com",
  };
  d.sqlite
    .prepare("UPDATE pickup_settings SET data=?")
    .run(JSON.stringify(settings));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const u = new URL(String(input));
    if (u.hostname === "api.resend.com") {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "mail" });
    }
    if (fail) return Response.json({ error: "outage" }, { status: 503 });
    if (u.hostname === "oauth2.googleapis.com")
      return Response.json({ access_token: "test" });
    if (u.pathname.endsWith("/freeBusy"))
      return Response.json({
        calendars: {
          "private-calendar": {
            busy: [...events.values()].map((x) => ({
              start: x.start.dateTime,
              end: x.end.dateTime,
            })),
          },
        },
      });
    if (u.pathname.endsWith("/events")) {
      if (init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        events.set(b.id, b);
        if (loseResponse) {
          loseResponse = false;
          throw Error("response lost");
        }
        return Response.json(b);
      }
      const min = Date.parse(u.searchParams.get("timeMin") || "1970-01-01"),
        max = Date.parse(u.searchParams.get("timeMax") || "2100-01-01");
      return Response.json({
        items: [...events.values()].filter(
          (x) =>
            Date.parse(x.start.dateTime) < max &&
            Date.parse(x.end.dateTime) > min,
        ),
      });
    }
    const id = u.pathname.split("/").pop()!;
    if (init?.method === "PUT") {
      const b = JSON.parse(String(init.body));
      events.set(id, b);
      return Response.json(b);
    }
    if (init?.method === "DELETE") {
      events.delete(id);
      return new Response(null, { status: 204 });
    }
    return events.has(id)
      ? Response.json(events.get(id))
      : Response.json({ error: "notFound" }, { status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());
async function call(path: string, body?: any, cookie?: string) {
  const r = await worker.fetch(
    new Request("http://localhost/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: "http://localhost",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    e,
  );
  return {
    status: r.status,
    data: (await r.json()) as any,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function order(paid = true, ready = true) {
  const r = await call("/orders", {
    items: [{ id: "demo-mesa", quantity: 1 }],
    name: "Ana <test>",
    email: "ana@example.com",
    phone: "3312345678",
    delivery: "local",
    localConsent: true,
    terms: true,
    privacy: true,
    provider: "paypal",
    idempotencyKey: crypto.randomUUID(),
  });
  let row = d.sqlite
    .prepare("SELECT * FROM orders WHERE public_number=?")
    .get(r.data.orderNumber) as unknown as OrderRow;
  if (paid) await updatePayment(e, row, "paid", crypto.randomUUID());
  row = d.sqlite
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(row.id) as unknown as OrderRow;
  if (ready) await markPickup(e, row, "ready", "admin");
  row = d.sqlite
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(row.id) as unknown as OrderRow;
  return { row, cookie: r.cookie };
}
const appointment = () =>
  d.sqlite
    .prepare("SELECT * FROM pickup_appointments ORDER BY created LIMIT 1")
    .get() as any;
it("queues one invitation per day only for ready orders without appointments", async () => {
  const { row } = await order(true, false);
  await expect(adminPickup(e, "POST", {action:"invite", orderId:row.id}, "admin")).rejects.toThrow();
  await markPickup(e, row, "ready", "admin");
  await adminPickup(e, "POST", {action:"invite", orderId:row.id}, "admin");
  await adminPickup(e, "POST", {action:"invite", orderId:row.id}, "admin");
  expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_invitation_reminder'").get()?.n).toBe(1);
  d.sqlite.prepare("UPDATE orders SET logistics='scheduled' WHERE id=?").run(row.id);
  await expect(adminPickup(e, "POST", {action:"invite", orderId:row.id}, "admin")).rejects.toThrow();
  await processOutbox(e);
  expect(d.sqlite.prepare("SELECT status FROM outbox WHERE kind='pickup_invitation_reminder'").get()?.status).toBe("suppressed");
});
it("renders specific refund subjects, local instructions and invitation link", () => {
  const p = {orderNumber:"MG-2026-000001", delivery:"local"};
  expect(renderEmail("refunded", p).subject).toBe("Marlo Games · Reembolso confirmado · MG-2026-000001");
  expect(renderEmail("refund_failed", p).subject).toContain("Reembolso no completado");
  expect(renderEmail("paid", p).text).toContain("Cuando tu pedido esté listo para recoger");
  expect(renderEmail("pickup_invitation_reminder", p).text).toContain("Agendar mi entrega gratuita: https://marlo.games/pedido/agendar-entrega");
  expect(renderEmail("lead", {}).text).toContain("cuántas unidades");
  expect(renderEmail("contact", {}).text).toContain("mover ficha");
});
it("sends one purchase confirmation, delays pending mail and invites only after ready", async () => {
  const { row } = await order(true, false);
  expect(
    d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='paid'").get()
      ?.n,
  ).toBe(1);
  expect(
    d.sqlite
      .prepare(
        "SELECT count(*) n FROM outbox WHERE kind IN ('local','pickup_ready','manual_shipping')",
      )
      .get()?.n,
  ).toBe(0);
  expect(
    Number(
      d.sqlite
        .prepare("SELECT next_attempt FROM outbox WHERE kind='received'")
        .get()?.next_attempt,
    ),
  ).toBe(now + 300000);
  await markPickup(e, row, "ready", "admin");
  expect(
    d.sqlite
      .prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_ready'")
      .get()?.n,
  ).toBe(1);
  d.sqlite.exec("UPDATE outbox SET next_attempt=0");
  await processOutbox(e);
  expect(
    d.sqlite.prepare("SELECT status FROM outbox WHERE kind='received'").get()
      ?.status,
  ).toBe("suppressed");
});
it("requires verified session and refuses unpaid or unprepared orders", async () => {
  expect((await call("/pickup")).status).toBe(401);
  const { row, cookie } = await order(false, false);
  expect(
    (await call("/pickup", { action: "book", start }, cookie)).status,
  ).toBe(409);
  await updatePayment(e, row, "paid", "paid");
  expect(
    (await call("/pickup", { action: "book", start }, cookie)).status,
  ).toBe(409);
  expect(events.size).toBe(0);
});
it("returns only five-minute public slots without raw calendar details", async () => {
  const { cookie } = await order();
  events.set("personal", {
    id: "personal",
    summary: "Private note never public",
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(start + 300000).toISOString() },
  });
  const r = await call("/pickup?date=2026-10-26", undefined, cookie);
  expect(r.status).toBe(200);
  expect(r.data.slots[0].start).toBe(start + 300000);
  expect(r.data.slots.every((s: any) => s.end - s.start === 300000)).toBe(true);
  expect(JSON.stringify(r.data)).not.toMatch(
    /private-calendar|Private note|refresh_token|event_id/,
  );
});
it("books and verifies a private five-minute event with one confirmation and immutable order ownership", async () => {
  const { row, cookie } = await order();
  const r = await call(
    "/pickup",
    { action: "book", start, orderId: "someone-else" },
    cookie,
  );
  expect(r.status).toBe(200);
  expect(r.data.appointment.status).toBe("confirmed");
  const a = appointment();
  expect(a.order_id).toBe(row.id);
  expect(a.end - a.start).toBe(300000);
  expect(events.get(a.event_id)).toMatchObject({
    visibility: "private",
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(start + 300000).toISOString() },
  });
  await call("/pickup", { action: "book", start }, cookie);
  expect(events.size).toBe(1);
  expect(
    d.sqlite
      .prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_confirmed'")
      .get()?.n,
  ).toBe(1);
});
it("atomically rejects concurrent exclusive bookings for different orders", async () => {
  const a = await order(),
    b = await order();
  const r = await Promise.allSettled([
    changeAppointment(e, a.row, { action: "book", start }, "customer"),
    changeAppointment(e, b.row, { action: "book", start }, "customer"),
  ]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(
    d.sqlite
      .prepare(
        "SELECT count(*) n FROM pickup_appointments WHERE status='confirmed'",
      )
      .get()?.n,
  ).toBe(1);
});
it("cannot change another order using appointment IDs or order numbers", async () => {
  const a = await order(),
    b = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  const r = await call(
    "/pickup",
    {
      action: "cancel",
      version: 1,
      orderId: a.row.id,
      appointmentId: appointment().id,
    },
    b.cookie,
  );
  expect(r.status).toBe(409);
  expect(appointment().status).toBe("confirmed");
});
it("rechecks external busy periods on submission", async () => {
  const a = await order();
  events.set("busy", {
    id: "busy",
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(start + 300000).toISOString() },
  });
  await expect(
    changeAppointment(e, a.row, { action: "book", start }, "customer"),
  ).rejects.toThrow("disponible");
  expect(appointment()).toBeUndefined();
});
it("recovers an accepted event whose response was lost without duplicate events or early email", async () => {
  const a = await order();
  loseResponse = true;
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  expect(appointment().status).toBe("pending");
  expect(events.size).toBe(1);
  expect(
    d.sqlite
      .prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_confirmed'")
      .get()?.n,
  ).toBe(0);
  await syncAppointment(e, appointment().id);
  expect(appointment().status).toBe("confirmed");
  expect(events.size).toBe(1);
});
it("reschedules the same event, suppresses old emails and enforces version checks", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  await processPickups({ ...e, MODE: "sandbox" });
  const id = appointment().event_id;
  await changeAppointment(
    e,
    a.row,
    { action: "reschedule", start: start + 600000, version: 1 },
    "customer",
  );
  expect(events.size).toBe(1);
  expect(appointment()).toMatchObject({
    event_id: id,
    start: start + 600000,
    version: 2,
    status: "confirmed",
    old_start: null,
  });
  await expect(
    changeAppointment(e, a.row, { action: "cancel", version: 1 }, "customer"),
  ).rejects.toThrow("cambió");
  d.sqlite.exec("UPDATE outbox SET next_attempt=0");
  await processOutbox(e);
  await processOutbox(e);
  expect(
    d.sqlite
      .prepare("SELECT status FROM outbox WHERE kind='pickup_confirmed'")
      .get()?.status,
  ).toBe("suppressed");
});
it("cancels only the appointment, releases its slot after Google deletion and keeps the order paid", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  await changeAppointment(
    e,
    a.row,
    { action: "cancel", version: 1 },
    "customer",
  );
  expect(appointment().status).toBe("cancelled");
  expect(events.size).toBe(0);
  expect(
    d.sqlite
      .prepare("SELECT payment,logistics FROM orders WHERE id=?")
      .get(a.row.id),
  ).toMatchObject({ payment: "paid", logistics: "ready" });
  const b = await order();
  await changeAppointment(e, b.row, { action: "book", start }, "customer");
  expect(events.size).toBe(1);
});
it("keeps slot held during failed cancellation and retries safely", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  fail = true;
  await changeAppointment(
    e,
    a.row,
    { action: "cancel", version: 1 },
    "customer",
  );
  expect(appointment().status).toBe("cancelling");
  expect(events.size).toBe(1);
  fail = false;
  await syncAppointment(e, appointment().id);
  expect(appointment().status).toBe("cancelled");
  expect(events.size).toBe(0);
});
it("retains both old and new slots during an ambiguous reschedule", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  // Hold the in-flight reschedule directly to test the database's independent overlap protection.
  d.sqlite
    .prepare(
      "UPDATE pickup_appointments SET status='rescheduling',old_start=start,old_end=end,old_hold_start=hold_start,old_hold_end=hold_end,start=?,end=?,hold_start=?,hold_end=? WHERE id=?",
    )
    .run(
      start + 600000,
      start + 900000,
      start + 600000,
      start + 900000,
      appointment().id,
    );
  const b = await order();
  await expect(
    changeAppointment(
      e,
      b.row,
      { action: "book", start: start + 600000 },
      "customer",
    ),
  ).rejects.toThrow("ocuparse");
  expect(appointment().old_start).toBe(start);
});
it("deduplicates reminders and suppresses them after collection", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  vi.spyOn(Date, "now").mockReturnValue(start - 2 * 3600000 - 1);
  await processPickups(e);
  expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind IN ('pickup_reminder','internal_pickup_approaching')").get()?.n).toBe(0);
  vi.spyOn(Date, "now").mockReturnValue(start - 2 * 3600000);
  await processPickups(e);
  await processPickups(e);
  expect(
    d.sqlite
      .prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_reminder'")
      .get()?.n,
  ).toBe(1);
  const internalReminder = d.sqlite.prepare("SELECT * FROM outbox WHERE kind='internal_pickup_approaching'").get() as any;
  expect(internalReminder.recipient).toBe('admin@example.com');
  expect(JSON.parse(internalReminder.payload).phone).toBe('+523312345678');
  const current = d.sqlite
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(a.row.id) as unknown as OrderRow;
  await markPickup(e, current, "completed", "admin");
  d.sqlite.exec("UPDATE outbox SET next_attempt=0");
  for (let n = 0; n < 4; n++) await processOutbox(e);
  expect(
    d.sqlite
      .prepare("SELECT status FROM outbox WHERE kind='pickup_reminder'")
      .get()?.status,
  ).toBe("suppressed");
  expect(
    d.sqlite
      .prepare("SELECT status FROM outbox WHERE kind='pickup_completed'")
      .get()?.status,
  ).toBe("preview");
});
it('allows rescheduling from the two-hour reminder and notifies both parties with the new appointment', async () => {
  const a = await order();
  await changeAppointment(e,a.row,{action:'book',start},'customer');
  vi.spyOn(Date,'now').mockReturnValue(start-2*3600000);
  await processPickups(e);
  const nextStart=start+7*86400000;
  await changeAppointment(e,a.row,{action:'reschedule',start:nextStart,version:1},'customer');
  expect(appointment().start).toBe(nextStart);
  expect(appointment().status).toBe('confirmed');
  const mails=d.sqlite.prepare("SELECT * FROM outbox WHERE kind IN ('pickup_rescheduled','internal_pickup_rescheduled')").all() as any[];
  expect(mails).toHaveLength(2);
  expect(mails.map(m=>m.recipient).sort()).toEqual(['admin@example.com','ana@example.com']);
  const internal=mails.find(m=>m.kind==='internal_pickup_rescheduled');
  const payload=JSON.parse(internal.payload);
  expect(payload.appointmentStart).toBe(nextStart);
  expect(renderEmail(internal.kind,payload).html).toContain('https://wa.me/523312345678');
  for(let n=0;n<5;n++) await processOutbox(e);
  expect(d.sqlite.prepare("SELECT status FROM outbox WHERE kind='pickup_reminder'").get()?.status).toBe('suppressed');
  expect(d.sqlite.prepare("SELECT status FROM outbox WHERE kind='internal_pickup_approaching'").get()?.status).toBe('suppressed');
  vi.spyOn(Date,'now').mockReturnValue(nextStart-2*3600000);
  await processPickups(e);
  await processPickups(e);
  expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_reminder'").get()?.n).toBe(2);
  vi.spyOn(Date,'now').mockReturnValue(nextStart);
  await expect(changeAppointment(e,a.row,{action:'reschedule',start:nextStart+7*86400000,version:2},'customer')).rejects.toThrow('plazo');
});
it("enforces cancellation cutoff but allows admin resolution", async () => {
  const a = await order();
  await changeAppointment(e, a.row, { action: "book", start }, "customer");
  vi.spyOn(Date, "now").mockReturnValue(start - 3600000);
  await expect(
    changeAppointment(e, a.row, { action: "cancel", version: 1 }, "customer"),
  ).rejects.toThrow("plazo");
  await changeAppointment(
    e,
    a.row,
    { action: "cancel", version: 1 },
    "admin@example.com",
  );
  expect(appointment().status).toBe("cancelled");
});
it("renders escaped branded HTML and plain text for every template", () => {
  for (const kind of [...Object.keys(emailCopy), "order_code"]) {
    const r = renderEmail(kind, {
      name: "<img src=x onerror=bad>",
      message: "<script>alert(1)</script>",
      orderNumber: "MG-2026-000001",
      code: "123456",
      delivery: "local",
      total: 25900,
      refundAmount: 25900,
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("onerror=bad>");
    expect(r.html).toContain("/brand/marlo-logo-ink.png");
    expect(r.html).toContain("viewport");
    expect(r.text.length).toBeGreaterThan(40);
    if (kind === "lead") expect(r.text).toContain("puedes responder a este correo");
  }
  expect(renderEmail("received", {}).text).toContain(
    "esperando la confirmación",
  );
  expect(renderEmail("refunded", { refundAmount: 25900 }).text).toContain(
    "Importe reembolsado: $259.00 MXN",
  );
  expect(renderEmail("refunded", {}).text).not.toMatch(/\d+ días/);
});
it("sends Reply-To only when configured and maintains Resend idempotency", async () => {
  await order(true, false);
  d.sqlite.exec("UPDATE outbox SET status='suppressed' WHERE kind<>'paid'");
  e.MODE = "sandbox";
  e.EMAIL_ENABLED = "true";
  e.EMAIL_FROM = "pedidos@example.com";
  e.EMAIL_REPLY_TO = "help@example.com";
  e.RESEND_API_KEY = "test";
  await processOutbox(e);
  await processOutbox(e);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ reply_to: "help@example.com" });
  expect(sent[0].text).toContain("Gracias");
});
it('reconciles a confirmed appointment after a verified refund without sending reminders', async () => {
 const a=await order();
 await changeAppointment(e,a.row,{action:'book',start},'customer');
 const current=d.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(a.row.id) as unknown as OrderRow;
 await updatePayment(e,current,'refunded','refund-confirmed');
 await processPickups(e);
 expect(appointment().status).toBe('cancelled');
 expect(events.size).toBe(0);
 expect(d.sqlite.prepare('SELECT payment FROM orders WHERE id=?').get(a.row.id)?.payment).toBe('refunded');
});
it('distinguishes verified payment cancellation and failure from rejection', async () => {
 const a=await order(false,false);
 await updatePayment(e,{...a.row,verified_payment_status:'canceled'},'rejected','provider-cancelled');
 expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='payment_cancelled'").get()?.n).toBe(1);
 expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='incident'").get()?.n).toBe(1);
 expect(renderEmail('payment_cancelled',{}).text).toContain('Si ves algún cargo');
});
it('disables bookings and readiness invitations until the private calendar is configured', async () => {
 const a=await order(true,false);delete e.GOOGLE_REFRESH_TOKEN;
 await expect(markPickup(e,a.row,'ready','admin')).rejects.toThrow('Configura');
 expect((await call('/pickup',undefined,a.cookie)).data.enabled).toBe(false);
 expect(d.sqlite.prepare("SELECT count(*) n FROM outbox WHERE kind='pickup_ready'").get()?.n).toBe(0);
});
it('sends a pending payment reminder only after its delay while still pending', async () => {
 await order(false,false);await processOutbox(e);
 expect(d.sqlite.prepare("SELECT status FROM outbox WHERE kind='received'").get()?.status).toBe('pending');
 vi.spyOn(Date,'now').mockReturnValue(now+300001);await processOutbox(e);
 expect(d.sqlite.prepare("SELECT status FROM outbox WHERE kind='received'").get()?.status).toBe('preview');
});
