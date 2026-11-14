import { z } from "zod";
import { BusinessError } from "../src/domain";
import {
  configuredSlots,
  defaultPickupSettings,
  overlaps,
  pickupDate,
  pickupInstant,
  pickupLabel,
  pickupSettingsSchema,
} from "../src/local-pickup-config";
import type { Env, OrderRow } from "./types";
import { PickupCalendar, calendarConfigured } from "./pickup-calendar";
import { mailStatement } from "./emails";
export async function pickupSettings(e: Env) {
  const row = await e.DB.prepare(
    "SELECT data FROM pickup_settings WHERE id=1",
  ).first<{ data: string }>();
  return pickupSettingsSchema.parse(
    row ? JSON.parse(row.data) : defaultPickupSettings,
  );
}
export const activeAppointment = (e: Env, id: string) =>
  e.DB.prepare(
    "SELECT * FROM pickup_appointments WHERE order_id=? AND status NOT IN ('cancelled','completed')",
  )
    .bind(id)
    .first<any>();
function eligible(o: OrderRow) {
  if (
    o.payment !== "paid" ||
    JSON.parse(o.data).checkout.delivery !== "local" ||
    !["ready", "scheduled"].includes(o.logistics)
  )
    throw new BusinessError(
      "Tu pedido debe estar pagado y listo para recoger antes de agendar.",
      409,
    );
}
function publicAppointment(a: any) {
  return a
    ? {
        id: a.id,
        start: a.start,
        end: a.end,
        status: a.status,
        version: a.version,
        meetingPoint: a.meeting_point,
        assignedPerson: a.assigned_person,
      }
    : null;
}
function payload(o: OrderRow, a?: any) {
  const d = JSON.parse(o.data);
  return {
    id: o.id,
    orderNumber: o.public_number,
    name: d.checkout.name,
    email: o.email,
    phone: d.checkout.phone,
    ...d.totals,
    delivery: "local",
    ...(a
      ? {
          appointmentId: a.id,
          appointmentVersion: a.version,
          appointmentStatus: a.status,
          appointmentStart: a.start,
          appointment: pickupLabel(a.start),
          meetingPoint: a.meeting_point,
          assignedPerson: a.assigned_person,
        }
      : {}),
  };
}
function history(e: Env, a: any, actor: string, action: string) {
  return e.DB.prepare("INSERT INTO pickup_history VALUES(?,?,?,?,?,?)").bind(
    crypto.randomUUID(),
    a.id,
    actor,
    action,
    JSON.stringify(publicAppointment(a)),
    Date.now(),
  );
}
async function available(e: Env, o: OrderRow, day: string) {
  eligible(o);
  const s = await pickupSettings(e);
  if (e.LOCAL_PICKUP_ENABLED !== "true" || !s.enabled || !calendarConfigured(e))
    return [];
  const slots = configuredSlots(s, day);
  if (!slots.length) return [];
  const from = slots[0].holdStart,
    to = slots[slots.length - 1].holdEnd;
  const [remote, held] = await Promise.all([
    new PickupCalendar(e).busy(from, to),
    e.DB.prepare(
      "SELECT hold_start,hold_end,old_hold_start,old_hold_end FROM pickup_appointments WHERE status NOT IN ('cancelled','completed') AND (hold_start<? AND hold_end>? OR old_hold_start<? AND old_hold_end>?)",
    )
      .bind(to, from, to, from)
      .all<any>(),
  ]);
  return slots.filter(
    (slot) =>
      !remote.some((b: any) =>
        overlaps(slot.holdStart, slot.holdEnd, b.start, b.end),
      ) &&
      !held.results.some(
        (a) =>
          overlaps(slot.holdStart, slot.holdEnd, a.hold_start, a.hold_end) ||
          overlaps(
            slot.holdStart,
            slot.holdEnd,
            a.old_hold_start,
            a.old_hold_end,
          ),
      ),
  );
}
export async function customerPickup(
  e: Env,
  o: OrderRow,
  method: string,
  body: any,
  day: string,
) {
  if (method === "GET") {
    const s = await pickupSettings(e),
      a = await activeAppointment(e, o.id);
    const canBook =
      o.payment === "paid" &&
      JSON.parse(o.data).checkout.delivery === "local" &&
      ["ready", "scheduled"].includes(o.logistics);
    return {
      enabled:
        e.LOCAL_PICKUP_ENABLED === "true" && s.enabled && calendarConfigured(e),
      eligible: canBook,
      orderStatus: o.logistics,
      payment: o.payment,
      durationMinutes: s.durationMinutes,
      noticeHours: s.noticeHours,
      cutoffHours: s.cutoffHours,
      meetingPoint: s.meetingPoint,
      appointment: publicAppointment(a),
      slots: canBook && day ? await available(e, o, day) : [],
    };
  }
  return changeAppointment(e, o, body, "customer");
}
export async function changeAppointment(
  e: Env,
  o: OrderRow,
  raw: any,
  actor: string,
) {
  const b = z
    .object({
      action: z.enum(["book", "reschedule", "cancel"]),
      start: z.number().int().optional(),
      version: z.number().int().optional(),
    })
    .parse(raw);
  const s = await pickupSettings(e),
    a = await activeAppointment(e, o.id),
    now = Date.now();
  if (e.LOCAL_PICKUP_ENABLED !== "true" || !s.enabled || !calendarConfigured(e))
    throw new BusinessError("La agenda no está disponible por ahora.", 503);
  eligible(o);
  if (b.action === "book" && a) return { appointment: publicAppointment(a) };
  if (
    b.action !== "book" &&
    (!a ||
      (a.status !== "confirmed" &&
        !(actor !== "customer" && b.action === "cancel")) ||
      a.version !== b.version ||
      a.lease_until > now)
  )
    throw new BusinessError(
      "La cita cambió o se está sincronizando. Actualiza la página.",
      409,
    );
  if (a && actor === "customer" &&
      (a.start <= now || (b.action === "cancel" && a.start - now < s.cutoffHours * 3600000)))
    throw new BusinessError(
      "El plazo para cambiar esta cita terminó. Contáctanos para ayudarte.",
      409,
    );
  if (b.action === "cancel") {
    await e.DB.batch([
      e.DB.prepare(
        "UPDATE pickup_appointments SET status='cancelling',version=version+1,error=NULL WHERE id=? AND version=? AND status NOT IN ('cancelled','completed') AND lease_until<=?",
      ).bind(a.id, a.version, now),
      history(e, a, actor, "cancellation_requested"),
    ]);
    await syncAppointment(e, a.id);
    return { appointment: publicAppointment(await activeAppointment(e, o.id)) };
  }
  const slot = configuredSlots(s, pickupDate(b.start || 0)).find(
    (v) => v.start === b.start,
  );
  if (!slot) throw new BusinessError("Elige un horario disponible.", 409);
  const calendar = new PickupCalendar(e);
  if (await calendar.conflicts(slot.holdStart, slot.holdEnd, a?.event_id || ""))
    throw new BusinessError("Ese horario ya no está disponible.", 409);
  const id = a?.id || crypto.randomUUID().replaceAll("-", "");
  try {
    if (a) {
      const changed = await e.DB.prepare(
        "UPDATE pickup_appointments SET old_start=start,old_end=end,old_hold_start=hold_start,old_hold_end=hold_end,start=?,end=?,hold_start=?,hold_end=?,status='rescheduling',version=version+1,error=NULL WHERE id=? AND version=? AND status='confirmed' AND lease_until<=? RETURNING id",
      )
        .bind(
          slot.start,
          slot.end,
          slot.holdStart,
          slot.holdEnd,
          a.id,
          a.version,
          now,
        )
        .first();
      if (!changed)
        throw new BusinessError("La cita cambió. Actualiza la página.", 409);
    } else
      await e.DB.prepare(
        "INSERT INTO pickup_appointments(id,order_id,status,start,end,hold_start,hold_end,event_id,calendar_id,meeting_point,assigned_person,created) VALUES(?,?,'pending',?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          o.id,
          slot.start,
          slot.end,
          slot.holdStart,
          slot.holdEnd,
          id,
          e.GOOGLE_CALENDAR_ID!,
          s.meetingPoint,
          s.assignedPerson,
          now,
        )
        .run();
  } catch (err) {
    if (err instanceof BusinessError) throw err;
    if (/pickup_conflict|UNIQUE constraint/i.test(String(err)))
      throw new BusinessError(
        "Ese horario acaba de ocuparse. Elige otro.",
        409,
      );
    if (String(err).includes("pickup_ineligible"))
      throw new BusinessError(
        "El pedido ya no está disponible para agendar.",
        409,
      );
    throw err;
  }
  await history(
    e,
    { ...a, id, start: slot.start, end: slot.end, status: "pending" },
    actor,
    b.action + "_requested",
  ).run();
  await syncAppointment(e, id);
  return { appointment: publicAppointment(await activeAppointment(e, o.id)) };
}
export async function syncAppointment(e: Env, id: string) {
  const now = Date.now(),
    lease = now + 120000;
  const a = await e.DB.prepare(
    "UPDATE pickup_appointments SET lease_until=? WHERE id=? AND lease_until<=? AND status IN ('pending','rescheduling','cancelling') RETURNING *",
  )
    .bind(lease, id, now)
    .first<any>();
  if (!a) return;
  try {
    const o = (await e.DB.prepare("SELECT * FROM orders WHERE id=?")
      .bind(a.order_id)
      .first<OrderRow>())!;
    const calendar = new PickupCalendar({
      ...e,
      GOOGLE_CALENDAR_ID: a.calendar_id,
    });
    const cancel =
      a.status === "cancelling" ||
      o.payment !== "paid" ||
      !["ready", "scheduled"].includes(o.logistics);
    if (cancel) await calendar.remove(a.event_id);
    else {
      if (await calendar.conflicts(a.hold_start, a.hold_end, a.event_id))
        throw new Error("calendar_conflict_requires_review");
      await calendar.put(a, o.public_number);
      if (await calendar.conflicts(a.hold_start, a.hold_end, a.event_id))
        throw new Error("calendar_conflict_requires_review");
    }
    const next = cancel ? "cancelled" : "confirmed";
    const kind = cancel
      ? "pickup_cancelled"
      : a.status === "rescheduling"
        ? "pickup_rescheduled"
        : "pickup_confirmed";
    const p = payload(o, { ...a, status: next });
    // Commit the verified calendar result and emails atomically. A failed commit keeps the hold for retry.
    await e.DB.batch([
      e.DB.prepare(
        "INSERT INTO events(id,order_id,kind,created) VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM pickup_appointments WHERE id=? AND version=? AND lease_until=?) THEN ? ELSE NULL END,?)",
      ).bind(
        "pickup:" + a.id + ":" + a.version,
        o.id,
        a.id,
        a.version,
        lease,
        kind,
        Date.now(),
      ),
      e.DB.prepare(
        "UPDATE pickup_appointments SET status=?,old_start=NULL,old_end=NULL,old_hold_start=NULL,old_hold_end=NULL,error=NULL,lease_until=0 WHERE id=? AND version=? AND lease_until=?",
      ).bind(next, a.id, a.version, lease),
      e.DB.prepare(
        "UPDATE orders SET logistics=?,appointment=?,version=version+1 WHERE id=? AND payment='paid' AND logistics IN ('ready','scheduled')",
      ).bind(
        cancel ? "ready" : "scheduled",
        cancel ? "" : pickupLabel(a.start),
        o.id,
      ),
      history(e, { ...a, status: next }, "calendar", kind),
      mailStatement(e, `pickup:${a.id}:${a.version}:${kind}`, o.email, kind, p),
      ...(e.ADMIN_EMAIL
        ? [
            mailStatement(
              e,
              `pickup:${a.id}:${a.version}:${kind}:admin`,
              e.ADMIN_EMAIL,
              "internal_" + kind,
              p,
            ),
          ]
        : []),
    ]);
  } catch {
    await e.DB.prepare(
      "UPDATE pickup_appointments SET error='Revisar sincronización o conflicto de calendario; horarios reservados hasta resolver.',lease_until=0 WHERE id=? AND version=? AND lease_until=?",
    )
      .bind(a.id, a.version, lease)
      .run();
  }
}
export async function markPickup(
  e: Env,
  o: OrderRow,
  action: "ready" | "completed",
  actor: string,
) {
  const d = JSON.parse(o.data);
  if (o.payment !== "paid" || d.checkout.delivery !== "local")
    throw new BusinessError("Se requiere un pedido local pagado.", 409);
  const a = await activeAppointment(e, o.id);
  if (action === "ready") {
    const settings = await pickupSettings(e);
    if (
      e.LOCAL_PICKUP_ENABLED !== "true" ||
      !settings.enabled ||
      !calendarConfigured(e)
    )
      throw new BusinessError(
        "Configura y habilita la agenda antes de enviar invitaciones.",
        409,
      );
    if (o.logistics === "ready") return { ok: true };
    if (!["pending_contact", "incident"].includes(o.logistics) || a)
      throw new BusinessError(
        "No se puede cambiar el estado de este pedido.",
        409,
      );
  } else if (!a || a.status !== "confirmed" || a.lease_until > Date.now())
    throw new BusinessError(
      "Se requiere una cita confirmada sin cambios pendientes.",
      409,
    );
  const kind = action === "ready" ? "pickup_ready" : "pickup_completed";
  const p = payload(
    o,
    a ? { ...a, status: "completed", version: a.version + 1 } : undefined,
  );
  await e.DB.batch([
    e.DB.prepare(
      `INSERT INTO events(id,order_id,kind,created) VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM orders WHERE id=? AND logistics=? AND payment='paid') AND (?='ready' OR EXISTS(SELECT 1 FROM pickup_appointments WHERE id=? AND version=? AND status='confirmed' AND lease_until<=?)) THEN ? ELSE NULL END,?)`,
    ).bind(
      o.id + ":" + kind,
      o.id,
      o.id,
      o.logistics,
      action,
      a?.id || "",
      a?.version || 0,
      Date.now(),
      kind,
      Date.now(),
    ),
    e.DB.prepare(
      "UPDATE orders SET logistics=?,version=version+1 WHERE id=?",
    ).bind(action === "ready" ? "ready" : "delivered", o.id),
    ...(a
      ? [
          e.DB.prepare(
            "UPDATE pickup_appointments SET status='completed',version=version+1 WHERE id=? AND status='confirmed'",
          ).bind(a.id),
          history(e, { ...a, status: "completed" }, actor, kind),
        ]
      : []),
    mailStatement(e, o.id + ":" + kind, o.email, kind, p),
    ...(e.ADMIN_EMAIL
      ? [
          mailStatement(
            e,
            o.id + ":" + kind + ":admin",
            e.ADMIN_EMAIL,
            "internal_" + kind,
            p,
          ),
        ]
      : []),
  ]);
  return { ok: true };
}
export async function processPickups(e: Env) {
  if (e.LOCAL_PICKUP_ENABLED !== "true" || !calendarConfigured(e)) return;
  await e.DB.prepare(
    "UPDATE pickup_appointments SET status='cancelling',version=version+1 WHERE status='confirmed' AND lease_until<=? AND order_id IN (SELECT id FROM orders WHERE payment<>'paid')",
  )
    .bind(Date.now())
    .run();
  const due = await e.DB.prepare(
    "SELECT id FROM pickup_appointments WHERE status IN ('pending','rescheduling','cancelling') AND lease_until<=? ORDER BY created LIMIT 5",
  )
    .bind(Date.now())
    .all<any>();
  for (const a of due.results) await syncAppointment(e, a.id);
  const s = await pickupSettings(e),
    now = Date.now();
  const reminders = await e.DB.prepare(
    "SELECT a.*,o.data,o.email,o.public_number,o.payment,o.logistics FROM pickup_appointments a JOIN orders o ON o.id=a.order_id WHERE a.status='confirmed' AND o.payment='paid' AND o.logistics='scheduled' AND a.start BETWEEN ? AND ? ORDER BY a.reminders_checked_at,a.start LIMIT 100",
  )
    .bind(now - 7 * 86400000, now + 86400000)
    .all<any>();
  for (const a of reminders.results) {
    const o = { ...a, id: a.order_id } as OrderRow;
    const p = payload(o, a);
    const kinds: string[] = [];
    if (a.start > now && a.start - now <= 2 * 3600000)
      kinds.push("pickup_reminder");
    if (
      s.sameDayReminder &&
      a.start > now &&
      pickupDate(a.start) === pickupDate(now)
    )
      kinds.push("pickup_same_day");
    const statements = kinds.map((kind) =>
      mailStatement(e, `pickup:${a.id}:${a.version}:${kind}${kind === "pickup_reminder" ? ":2h" : ""}`, a.email, kind, p),
    );
    if (e.ADMIN_EMAIL && a.start - now <= 2 * 3600000)
      statements.push(
        mailStatement(
          e,
          `pickup:${a.id}:${a.version}:${a.start > now ? "approaching:2h" : "overdue"}`,
          e.ADMIN_EMAIL,
          a.start > now
            ? "internal_pickup_approaching"
            : "internal_pickup_overdue",
          p,
        ),
      );
    statements.push(
      e.DB.prepare(
        "UPDATE pickup_appointments SET reminders_checked_at=? WHERE id=?",
      ).bind(now, a.id),
    );
    await e.DB.batch(statements);
  }
}
export async function adminPickup(
  e: Env,
  method: string,
  b: any,
  actor: string,
) {
  if (method === "GET")
    return {
      settings: await pickupSettings(e),
      configured: calendarConfigured(e),
      featureEnabled: e.LOCAL_PICKUP_ENABLED === "true",
      appointments: (
        await e.DB.prepare(
          "SELECT a.*,o.public_number,o.email,o.data FROM pickup_appointments a JOIN orders o ON o.id=a.order_id ORDER BY a.start DESC LIMIT 200",
        ).all()
      ).results,
      history: (
        await e.DB.prepare(
          "SELECT * FROM pickup_history ORDER BY created DESC LIMIT 100",
        ).all()
      ).results,
    };
  if (b.action === "settings") {
    const settings = pickupSettingsSchema.parse(b.settings);
    await e.DB.prepare("UPDATE pickup_settings SET data=? WHERE id=1")
      .bind(JSON.stringify(settings))
      .run();
    return { ok: true };
  }
  if (b.action === "reconcile") {
    await processPickups(e);
    return { ok: true };
  }
  const o = await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(String(b.orderId || ""))
    .first<OrderRow>();
  if (!o) throw new BusinessError("Pedido no encontrado.", 404);
  if (b.action === "invite") {
    eligible(o);
    if (o.logistics !== "ready" || await activeAppointment(e, o.id))
      throw new BusinessError("El pedido ya tiene una cita o no está listo para agendar.", 409);
    const settings = await pickupSettings(e);
    if (e.LOCAL_PICKUP_ENABLED !== "true" || !settings.enabled || !calendarConfigured(e))
      throw new BusinessError("Habilita la agenda antes de reenviar la invitación.", 409);
    // One reminder per order per day, including retries and repeated clicks.
    await mailStatement(e, o.id + ":pickup-invitation:" + pickupDate(Date.now()), o.email,
      "pickup_invitation_reminder", payload(o)).run();
    return { ok: true };
  }
  if (["ready", "completed"].includes(b.action))
    return markPickup(e, o, b.action, actor);
  return changeAppointment(e, o, b, actor);
}
