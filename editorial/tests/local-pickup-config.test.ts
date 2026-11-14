import { describe, expect, it } from "vitest";
import {
  configuredSlots,
  defaultPickupSettings,
  pickupInstant,
  pickupDate,
  pickupTime,
} from "../src/local-pickup-config";
describe("local pickup availability", () => {
  const settings = {
    ...defaultPickupSettings,
    windows: [{ day: 1, start: "10:00", end: "10:30" }],
  };
  const now = pickupInstant("2026-10-24", "09:00");
  it("defaults to five minutes without invented working hours", () => {
    expect(defaultPickupSettings.durationMinutes).toBe(5);
    expect(defaultPickupSettings.windows).toEqual([]);
    expect(defaultPickupSettings.enabled).toBe(false);
    const slots = configuredSlots(settings, "2026-10-26", now);
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.end - s.start === 300000)).toBe(true);
    expect(slots[1].start).toBe(slots[0].end);
  });
  it("uses Mexico City civil time", () => {
    const ms = pickupInstant("2026-10-26", "10:00");
    expect(new Date(ms).toISOString()).toBe("2026-10-26T16:00:00.000Z");
    expect(pickupDate(ms)).toBe("2026-10-26");
    expect(pickupTime(ms)).toBe("10:00");
  });
  it("excludes breaks, closures, notice and buffers", () => {
    expect(
      configuredSlots(
        { ...settings, breaks: [{ day: 1, start: "10:10", end: "10:20" }] },
        "2026-10-26",
        now,
      ),
    ).toHaveLength(4);
    expect(
      configuredSlots(
        {
          ...settings,
          closures: [{ date: "2026-10-26", start: "00:00", end: "23:59" }],
        },
        "2026-10-26",
        now,
      ),
    ).toHaveLength(0);
    expect(
      configuredSlots(
        settings,
        "2026-10-26",
        pickupInstant("2026-10-26", "09:00"),
      ),
    ).toHaveLength(0);
    expect(
      configuredSlots({ ...settings, bufferMinutes: 5 }, "2026-10-26", now),
    ).toHaveLength(4);
  });
  it("deduplicates overlapping windows", () => {
    expect(
      configuredSlots(
        { ...settings, windows: [...settings.windows, ...settings.windows] },
        "2026-10-26",
        now,
      ),
    ).toHaveLength(6);
  });
});
