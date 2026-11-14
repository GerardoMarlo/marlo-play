import { z } from "zod";
export const commercialName = (name: string) =>
  /^xmas\s+xchange$/i.test(name.trim()) ? "Intercambio Navideño" : name;
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    cents / 100,
  );
const text = z.string().trim().min(1).max(200);
export const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, "").replace(/^52(?=\d{10}$)/, ""))
  .pipe(
    z.string().regex(/^\d{10}$/, "Escribe un teléfono mexicano de 10 dígitos."),
  )
  .transform((v) => "+52" + v);
export const addressSchema = z.object({
  recipient: text,
  phone,
  email: z.email(),
  street: text,
  exterior: text,
  interior: z.string().max(50).default(""),
  colony: text,
  city: text,
  state: text,
  postalCode: z.string().regex(/^\d{5}$/),
  country: z.literal("MX"),
  references: z.string().max(500).default(""),
});
export type Address = z.infer<typeof addressSchema>;
const safeUrl = z.union([
  z.literal(""),
  z
    .string()
    .regex(/^\/images\/[a-z0-9/_.-]+$/)
    .refine((v) => !v.includes(".."), "Ruta de imagen inválida"),
  z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"), "Usa HTTPS"),
]);
export const productSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: text,
    description: z.string().max(4000),
    shortDescription: z.string().max(400),
    price: z.number().int().min(0).max(100000000),
    stock: z.number().int().min(0),
    status: z.enum(["available", "sold_out", "coming_soon", "preorder"]),
    sku: text,
    players: text,
    duration: text,
    age: z.string().max(60),
    components: z.string().max(4000),
    weight: z.number().nonnegative(),
    length: z.number().nonnegative(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    image: safeUrl,
    gallery: z.array(safeUrl).max(12),
    rules: safeUrl,
    theme: z.enum(["editorial", "festive", "mint", "coral"]).optional(),
    themeAccent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    themePaper: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    themeFont: z.enum(["expressive", "classic", "sans"]).optional(),
    category: text,
    featured: z.boolean(),
    fixture: z.boolean(),
    archived: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (["available", "preorder"].includes(p.status))
      for (const key of ["weight", "length", "width", "height"] as const)
        if (!p[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message:
              "Confirma las medidas y el peso empacado antes de habilitar ventas.",
          });
  });
export type Product = z.infer<typeof productSchema>;
export const cartSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      quantity: z.number().int().min(1).max(20),
    }),
  )
  .min(1)
  .max(30)
  .refine(
    (v) => new Set(v.map((x) => x.id)).size === v.length,
    "Productos duplicados",
  );
export type Cart = z.infer<typeof cartSchema>;
export const checkoutSchema = z
  .object({
    items: cartSchema,
    coupon: z.string().trim().max(40).default(""),
    name: text,
    email: z.email().transform((v) => v.toLowerCase()),
    phone,
    delivery: z.enum(["local", "national"]),
    localConsent: z.boolean(),
    terms: z.literal(true),
    privacy: z.literal(true),
    marketingConsent: z.boolean().default(false),
    address: addressSchema.optional(),
    quoteId: z.string().max(100).optional(),
    provider: z.enum(["mercadopago", "paypal"]),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.delivery === "local" && !v.localConsent)
      ctx.addIssue({
        code: "custom",
        message: "Confirma que puedes acudir a Plaza La Perla.",
        path: ["localConsent"],
      });
    if (v.delivery === "national" && !v.address)
      ctx.addIssue({
        code: "custom",
        message: "Completa tu domicilio.",
        path: ["address"],
      });
  });
export type Checkout = z.infer<typeof checkoutSchema>;
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,40}$/),
    type: z.enum(["percent", "fixed"]),
    value: z.number().int().positive(),
    starts: z.number().int(),
    expires: z.number().int(),
    maxUses: z.number().int().positive(),
    perCustomer: z.number().int().positive(),
    minimum: z.number().int().min(0),
    eligible: z.array(z.string()),
    active: z.boolean(),
    combinable: z.boolean().default(false),
  })
  .refine(
    (v) => v.expires > v.starts && (v.type !== "percent" || v.value <= 100),
    "Fechas o porcentaje inválidos",
  );
export type Coupon = z.infer<typeof couponSchema>;
export class BusinessError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function totals(
  items: Cart,
  products: Product[],
  delivery: "local" | "national",
  coupon?: Coupon,
  now = Date.now(),
) {
  const lines = cartSchema.parse(items).map((item) => {
    const p = products.find((p) => p.id === item.id);
    if (!p || p.archived || !["available", "preorder"].includes(p.status))
      throw new BusinessError("Este producto no está disponible.");
    if (p.stock < item.quantity)
      throw new BusinessError("No hay inventario suficiente.", 409);
    return {
      ...item,
      title: commercialName(p.title),
      price: p.price,
      amount: p.price * item.quantity,
    };
  });
  const subtotal = lines.reduce((s, x) => s + x.amount, 0);
  let discount = 0;
  if (coupon) {
    if (
      !coupon.active ||
      now < coupon.starts ||
      now >= coupon.expires ||
      subtotal < coupon.minimum
    )
      throw new BusinessError("El cupón no es válido para esta compra.");
    const eligible = lines
      .filter((x) => !coupon.eligible.length || coupon.eligible.includes(x.id))
      .reduce((s, x) => s + x.amount, 0);
    if (!eligible)
      throw new BusinessError("El cupón no aplica a estos productos.");
    discount = Math.min(
      eligible,
      coupon.type === "percent"
        ? Math.floor((eligible * coupon.value) / 100)
        : coupon.value,
    );
  }
  // National shipping is added only from a verified persisted quote.
  const shipping = 0;
  return {
    lines,
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}
export type Totals = ReturnType<typeof totals>;
export type PaymentState =
  "pending" | "paid" | "rejected" | "refunded" | "expired" | "review";
export type Logistics =
  | "pending_contact"
  | "scheduled"
  | "ready"
  | "label_created"
  | "shipped"
  | "delivered"
  | "incident";
export function paymentTransition(
  old: PaymentState,
  next: PaymentState,
): PaymentState {
  if (
    old === next ||
    old === "refunded" ||
    (old === "paid" && next !== "refunded" && next !== "review")
  )
    return old;
  if (["expired", "rejected"].includes(old) && next === "paid") return "review";
  if (old === "review" && next !== "refunded") return old;
  return next;
}
export function logisticsTransition(
  old: Logistics,
  next: Logistics,
  delivery: string,
  payment: PaymentState,
  hasTracking: boolean,
) {
  if (payment !== "paid")
    throw new BusinessError("Primero debe confirmarse el pago.", 409);
  const allowed: Record<string, string[]> =
    delivery === "local"
      ? {
          pending_contact: ["scheduled", "incident"],
          scheduled: ["ready", "incident"],
          ready: ["delivered", "incident"],
          incident: ["scheduled", "ready"],
        }
      : {
          pending_contact: ["label_created", "incident"],
          label_created: ["shipped", "incident"],
          shipped: ["delivered", "incident"],
          incident: ["shipped"],
        };
  if (!allowed[old]?.includes(next))
    throw new BusinessError("Transición logística no permitida.", 409);
  if (
    delivery === "national" &&
    ["label_created", "shipped", "delivered"].includes(next) &&
    !hasTracking
  )
    throw new BusinessError("Falta una guía verificada.");
  return next;
}
export const leadSchema = z.object({
  store: text,
  name: text,
  email: z.email().transform((v) => v.toLowerCase()),
  phone,
  city: text,
  state: text,
  website: z.union([z.literal(""), z.string().max(300)]).default(""),
  comments: z.string().max(2000).default(""),
  privacy: z.literal(true),
  websiteTrap: z.string().max(0).default(""),
  turnstile: z.string().optional(),
});
