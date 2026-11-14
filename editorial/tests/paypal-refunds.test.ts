import { afterEach, expect, it, vi } from "vitest";
import { paypalWebhookOrderId } from "../api/providers";
import { paymentTransition } from "../src/domain";
import type { Env } from "../api/types";
const env = { MODE: "sandbox", PAYPAL_ENVIRONMENT: "sandbox", PAYPAL_CLIENT_ID: "test", PAYPAL_CLIENT_SECRET: "test" } as Env;
afterEach(() => vi.restoreAllMocks());
it("resolves refund notifications through their parent capture", async () => {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
    const path = String(url);
    if (path.endsWith("/oauth2/token")) return Response.json({access_token: "test"});
    if (path.endsWith("/refunds/REFUND1")) return Response.json({links: [{rel: "up", href: "https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1"}]});
    if (path.endsWith("/captures/CAPTURE1")) return Response.json({supplementary_data: {related_ids: {order_id: "ORDER1"}}});
    throw Error("Unexpected provider request");
  });
  expect(await paypalWebhookOrderId(env, {event_type: "PAYMENT.CAPTURE.REFUNDED", resource: {id: "REFUND1"}})).toBe("ORDER1");
  expect(spy.mock.calls.every(([url]) => String(url).startsWith("https://api-m.sandbox.paypal.com/"))).toBe(true);
});
it("rejects a refund without a usable capture relationship", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async url => String(url).endsWith("/oauth2/token")
    ? Response.json({access_token: "test"})
    : Response.json({links: [{rel: "up", href: "https://example.com/arbitrary-path"}]}));
  await expect(paypalWebhookOrderId(env, {event_type: "PAYMENT.CAPTURE.REFUNDED", resource: {id: "REFUND1"}})).rejects.toThrow(/relacionar/);
});
it("holds paid orders for review without allowing stale pending events to downgrade payment", () => {
  expect(paymentTransition("paid", "review")).toBe("review");
  expect(paymentTransition("paid", "pending")).toBe("paid");
  expect(paymentTransition("review", "paid")).toBe("review");
  expect(paymentTransition("review", "refunded")).toBe("refunded");
  expect(paymentTransition("refunded", "review")).toBe("refunded");
});
