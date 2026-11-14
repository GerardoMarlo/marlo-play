import { z } from "zod";

export const PICKUP_TIMEZONE = "America/Mexico_City";
export const DEFAULT_PICKUP_MINUTES = 5;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const pickupSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    durationMinutes: z
      .number()
      .int()
      .min(5)
      .max(120)
      .default(DEFAULT_PICKUP_MINUTES),
    noticeHours: z.number().min(0).max(720).default(24),
    cutoffHours: z.number().min(0).max(168).default(24),
    bufferMinutes: z.number().int().min(0).max(60).default(0),
    meetingPoint: z.string().max(500).default(""),
    assignedPerson: z.string().max(100).default(""),
    sameDayReminder: z.boolean().default(false),
    windows: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            start: clock,
            end: clock,
          })
          .refine(
            (v) => v.start < v.end,
            "El fin debe ser posterior al inicio.",
          ),
      )
      .max(40)
      .default([]),
    breaks: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            start: clock,
            end: clock,
          })
          .refine((v) => v.start < v.end),
      )
      .max(40)
      .default([]),
    closures: z
      .array(
        z
          .object({
            date,
            start: clock.default("00:00"),
            end: clock.default("23:59"),
          })
          .refine((v) => v.start < v.end),
      )
      .max(366)
      .default([]),
  })
  .refine(
    (v) =>
      !v.enabled || (v.meetingPoint.trim().length > 0 && v.windows.length > 0),
    "Configura el punto de encuentro y al menos un horario.",
  );
export type PickupSettings = z.infer<typeof pickupSettingsSchema>;
export const defaultPickupSettings = pickupSettingsSchema.parse({});

export function pickupDate(ms: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PICKUP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}
export function pickupTime(ms: number) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: PICKUP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}
export function pickupLabel(ms: number) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: PICKUP_TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(ms));
}
// Resolve civil time using the IANA timezone rather than the host's timezone.
export function pickupInstant(day: string, time: string) {
  const target = Date.parse(`${day}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const civil = Date.parse(`${pickupDate(guess)}T${pickupTime(guess)}:00Z`);
    guess += target - civil;
  }
  return guess;
}
export const overlaps = (a: number, b: number, c: number, d: number) =>
  a < d && c < b;
export function configuredSlots(
  s: PickupSettings,
  day: string,
  now = Date.now(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const midnight = pickupInstant(day, "00:00");
  if (
    !Number.isFinite(midnight) ||
    pickupDate(midnight) !== day ||
    midnight > now + 60 * 86400000
  )
    return [];
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  const blocked = [
    ...s.breaks.filter((b) => b.day === weekday),
    ...s.closures.filter((c) => c.date === day),
  ];
  const result = new Map<
    number,
    { start: number; end: number; holdStart: number; holdEnd: number }
  >();
  for (const w of s.windows.filter((w) => w.day === weekday)) {
    const from = pickupInstant(day, w.start),
      to = pickupInstant(day, w.end);
    for (
      let start = from;
      start + s.durationMinutes * 60000 <= to;
      start += s.durationMinutes * 60000
    ) {
      const end = start + s.durationMinutes * 60000;
      const holdStart = start - s.bufferMinutes * 60000,
        holdEnd = end + s.bufferMinutes * 60000;
      if (
        start < now + s.noticeHours * 3600000 ||
        holdStart < from ||
        holdEnd > to
      )
        continue;
      if (
        blocked.some((b) =>
          overlaps(
            holdStart,
            holdEnd,
            pickupInstant(day, b.start),
            pickupInstant(day, b.end),
          ),
        )
      )
        continue;
      result.set(start, { start, end, holdStart, holdEnd });
    }
  }
  return [...result.values()].sort((a, b) => a.start - b.start);
}
