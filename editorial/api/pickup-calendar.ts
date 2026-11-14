import type { Env } from "./types";
import { BusinessError } from "../src/domain";
import { PICKUP_TIMEZONE } from "../src/local-pickup-config";
export function calendarConfigured(e: Env) {
  return !!(
    e.GOOGLE_CALENDAR_ID &&
    e.GOOGLE_CLIENT_ID &&
    e.GOOGLE_CLIENT_SECRET &&
    e.GOOGLE_REFRESH_TOKEN
  );
}
export class PickupCalendar {
  private token = "";
  constructor(private e: Env) {}
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<any> {
    if (!calendarConfigured(this.e))
      throw new BusinessError(
        "La agenda aún no está disponible. Intenta más tarde.",
        503,
      );
    if (!this.token) {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.e.GOOGLE_CLIENT_ID!,
          client_secret: this.e.GOOGLE_CLIENT_SECRET!,
          refresh_token: this.e.GOOGLE_REFRESH_TOKEN!,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok)
        throw new BusinessError(
          "No se pudo consultar la agenda. Intenta más tarde.",
          503,
        );
      const b = (await r.json()) as any;
      if (!b.access_token) throw new Error("calendar_token_missing");
      this.token = b.access_token;
    }
    const r = await fetch("https://www.googleapis.com/calendar/v3" + path, {
      method,
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 404 || r.status === 410) return null;
    if (!r.ok) throw new Error("calendar_http_" + r.status);
    return r.status === 204 ? {} : r.json();
  }
  private get path() {
    return (
      "/calendars/" + encodeURIComponent(this.e.GOOGLE_CALENDAR_ID!) + "/events"
    );
  }
  async busy(start: number, end: number) {
    const b = await this.request("/freeBusy", "POST", {
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      timeZone: PICKUP_TIMEZONE,
      items: [{ id: this.e.GOOGLE_CALENDAR_ID }],
    });
    const c = b?.calendars?.[this.e.GOOGLE_CALENDAR_ID!];
    if (!c || c.errors?.length || !Array.isArray(c.busy))
      throw new Error("calendar_busy_unavailable");
    return c.busy.map((v: any) => ({
      start: Date.parse(v.start),
      end: Date.parse(v.end),
    }));
  }
  async conflicts(start: number, end: number, exclude: string) {
    let pageToken = "",
      conflict = false,
      pages = 0;
    do {
      if (++pages > 3) throw new Error("calendar_too_many_conflicts");
      const q = new URLSearchParams({
        timeMin: new Date(start).toISOString(),
        timeMax: new Date(end).toISOString(),
        singleEvents: "true",
        maxResults: "250",
        ...(pageToken ? { pageToken } : {}),
      });
      const b = await this.request(this.path + "?" + q);
      if (!b || !Array.isArray(b.items))
        throw new Error("calendar_events_unavailable");
      conflict ||= b.items.some(
        (v: any) =>
          v.id !== exclude &&
          v.status !== "cancelled" &&
          v.transparency !== "transparent",
      );
      pageToken = b.nextPageToken || "";
    } while (pageToken);
    return conflict;
  }
  async put(a: any, orderNumber: string) {
    const body = {
      id: a.event_id,
      summary: "Entrega Marlo Games · " + orderNumber,
      location: "Plaza La Perla, Zapopan · " + a.meeting_point,
      description:
        "Pedido " + orderNumber + "\nResponsable: " + a.assigned_person,
      start: {
        dateTime: new Date(a.start).toISOString(),
        timeZone: PICKUP_TIMEZONE,
      },
      end: {
        dateTime: new Date(a.end).toISOString(),
        timeZone: PICKUP_TIMEZONE,
      },
      visibility: "private",
      transparency: "opaque",
      extendedProperties: {
        private: { marloAppointment: a.id, marloVersion: String(a.version) },
      },
    };
    const existing = await this.request(this.path + "/" + a.event_id);
    if (
      existing &&
      existing.extendedProperties?.private?.marloAppointment !== a.id
    )
      throw new Error("calendar_event_identity_conflict");
    await this.request(
      this.path + (existing ? "/" + a.event_id : "") + "?sendUpdates=none",
      existing ? "PUT" : "POST",
      body,
    );
    const verified = await this.request(this.path + "/" + a.event_id);
    if (
      !verified ||
      Date.parse(verified.start?.dateTime) !== a.start ||
      Date.parse(verified.end?.dateTime) !== a.end ||
      verified.extendedProperties?.private?.marloVersion !== String(a.version)
    )
      throw new Error("calendar_verify_failed");
  }
  async remove(id: string) {
    const accessible = await this.request(this.path + "?maxResults=1");
    if (!accessible || !Array.isArray(accessible.items))
      throw new Error("calendar_access_unverified");
    await this.request(this.path + "/" + id + "?sendUpdates=none", "DELETE");
    const remaining = await this.request(this.path + "/" + id);
    if (remaining && remaining.status !== "cancelled")
      throw new Error("calendar_delete_unverified");
  }
}
