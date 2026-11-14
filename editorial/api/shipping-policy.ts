import { z } from "zod";
import { BusinessError } from "../src/domain";
import type { Env } from "./types";
import { defaultPackaging, planPackaging } from "../src/packaging";

// Account/service evidence is mandatory: the API's `days` alone does not
// specify business days, and pickup availability does not establish its cost.
export const serviceEvidence = z.array(
  z.object({
    carrier: z.string().min(1),
    service: z.string().min(1),
    homeDelivery: z.literal(true),
    businessDays: z.literal(true),
    source: z.string().min(8),
    validUntil: z.number().int().positive(),
    pickup: z
      .object({
        extraCents: z.number().int().nonnegative(),
        source: z.string().min(8),
      })
      .optional(),
    dropoff: z
      .object({
        extraCents: z.number().int().nonnegative(),
        source: z.string().min(8),
        officeId: z.string().uuid(),
      })
      .optional(),
  }),
);
export type Evidence = z.infer<typeof serviceEvidence>[number];
export type Candidate = {
  rateId: string;
  carrier: string;
  service: string;
  cost: number;
  rateCost: number;
  transitDays: number;
  method: "pickup" | "dropoff";
  officeId?: string;
  evidence: Evidence;
};
export function chooseShipping(
  rates: any[],
  evidence: Evidence[],
  packages: number,
  now = Date.now(),
) {
  const eligible: Candidate[] = [];
  for (const r of rates) {
    const proof = evidence.find(
      (p) =>
        p.carrier === r.provider_name &&
        p.service === r.provider_service_code &&
        p.validUntil > now,
    );
    const cost = Math.round(Number(r.total) * 100);
    if (
      !proof ||
      r.success !== true ||
      r.currency_code !== "MXN" ||
      typeof r.office_delivery !== "boolean" ||
      r.requires_origin_verification !== false ||
      !Number.isInteger(r.days) ||
      r.days < 1 ||
      r.days > 6 ||
      !Number.isSafeInteger(cost) ||
      cost <= 0 ||
      !r.id ||
      !["single", "multipackage"].includes(r.shipment_creation_type) ||
      (packages > 1 && r.shipment_creation_type !== "multipackage")
    )
      continue;
    const base = {
      rateId: r.id,
      carrier: r.provider_name,
      service: r.provider_service_code,
      rateCost: cost,
      transitDays: r.days,
      evidence: proof,
    };
    if (
      r.pickup === true &&
      r.pickup_ocurre === true &&
      Number.isInteger(r.pickup_package_min) &&
      r.pickup_package_min <= packages &&
      proof.pickup
    )
      eligible.push({
        ...base,
        method: "pickup",
        cost: cost + proof.pickup.extraCents,
      });
    if (r.office_pickup === true && proof.dropoff)
      eligible.push({
        ...base,
        method: "dropoff",
        cost: cost + proof.dropoff.extraCents,
        officeId: proof.dropoff.officeId,
      });
  }
  eligible.sort((a, b) => a.cost - b.cost || a.rateId.localeCompare(b.rateId));
  const p = eligible.find((r) => r.method === "pickup"),
    d = eligible.find((r) => r.method === "dropoff");
  const selected = p && d ? (p.cost - d.cost >= 3000 ? d : p) : p || d;
  if (!selected)
    throw new BusinessError(
      "Lo sentimos, por ahora no contamos con cobertura de envío para esta dirección. Revisa tus datos o intenta con otra dirección.",
      409,
    );
  return {
    ...selected,
    savings: selected.method === "dropoff" && p ? p.cost - selected.cost : 0,
    rationale:
      p && d
        ? `Pickup ${p.cost}; dropoff ${d.cost}; threshold 3000 centavos; selected ${selected.method}.`
        : `Only verified eligible method: ${selected.method}.`,
    compared: eligible.map(({ rateId, method, cost }) => ({
      rateId,
      method,
      cost,
    })),
  };
}

export function pack(e: Env, items: { id: string; quantity: number }[]) {
  const config = e.SHIPPING_PACKAGING_JSON
    ? JSON.parse(e.SHIPPING_PACKAGING_JSON)
    : defaultPackaging;
  return planPackaging(config, items, !config.allowProvisionalQuotes);
}
