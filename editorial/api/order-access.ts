import { BusinessError } from "../src/domain";
import { hash, rateLimit } from "./security";
import { mailStatement } from "./emails";
import type { Env, OrderRow } from "./types";

const lifetime = 2 * 3600000;
export async function sessionOrder(r: Request, e: Env) {
  const token = (r.headers.get("Cookie") || "")
    .split(/;\s*/)
    .find((c) => c.startsWith("marlo_order="))
    ?.slice(12);
  if (!token || token.length > 200) return null;
  return e.DB.prepare(
    "SELECT o.* FROM orders o JOIN order_sessions s ON s.order_id=o.id WHERE s.token_hash=? AND s.expires>?",
  )
    .bind(await hash(token), Date.now())
    .first<OrderRow>();
}
export async function issueSession(e: Env, o: OrderRow, response: Response) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await e.DB.prepare("INSERT INTO order_sessions VALUES(?,?,?)")
    .bind(await hash(token), o.id, Date.now() + lifetime)
    .run();
  response.headers.append(
    "Set-Cookie",
    `marlo_order=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200${new URL(e.PUBLIC_ORIGIN).protocol === "https:" ? "; Secure" : ""}`,
  );
  return response;
}
export async function authorizeOrder(r: Request, e: Env, o: OrderRow) {
  if ((await sessionOrder(r, e))?.id !== o.id)
    throw new BusinessError(
      "Verifica tu correo para consultar este pedido.",
      403,
    );
}
export async function requestCode(r: Request, e: Env, b: any) {
  await rateLimit(r, e, "order-lookup", 5);
  await rateLimit(new Request(r.url), e, "order-lookup-global", 60);
  const number = String(b.orderNumber || "")
    .trim()
    .toUpperCase();
  const email = String(b.email || "")
    .trim()
    .toLowerCase();
  if (number.length > 100 || email.length > 254)
    throw new BusinessError("Revisa el número de pedido o guía y el correo.");
  // Per-mailbox cap is independent of whether this order exists.
  const identityRequest = new Request(r.url, {
    headers: { "CF-Connecting-IP": await hash(email) },
  });
  await rateLimit(identityRequest, e, "order-mailbox", 2);
  if (
    e.MODE !== "local" &&
    (e.EMAIL_ENABLED !== "true" || !e.RESEND_API_KEY || !e.EMAIL_FROM)
  )
    throw new BusinessError(
      "La verificación por correo no está disponible en este entorno. Intenta más tarde.",
      503,
    );
  const o = await e.DB.prepare(
    `SELECT * FROM orders o WHERE lower(email)=? AND (public_number=? OR EXISTS (SELECT 1 FROM shipment_tracking t WHERE t.order_id=o.id AND t.tracking_number=?) OR instr(',' || upper(replace(coalesce(o.tracking,''),' ','')) || ',', ',' || ? || ',')>0) LIMIT 2`,
  )
    .bind(email, number, number.replace(/\s/g, ""), number.replace(/\s/g, ""))
    .all<OrderRow>();
  const matched = o.results.length === 1 ? o.results[0] : undefined;
  const id = crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const code = String(bytes[0] % 1000000).padStart(6, "0");
  const statements = [
    e.DB.prepare(
      "INSERT INTO order_challenges(id,order_id,code_hash,expires) VALUES(?,?,?,?)",
    ).bind(
      id,
      matched?.id || null,
      await hash(id + ":" + code),
      Date.now() + 10 * 60000,
    ),
  ];
  if (matched)
    statements.push(
      mailStatement(e, "order-code:" + id, matched.email, "order_code", {
        code,
        orderNumber: matched.public_number,
        expires: Date.now() + 10 * 60000,
      }),
    );
  await e.DB.batch(statements);
  return {
    challengeId: id,
    message:
      "Si los datos coinciden, recibirás un código en tu correo. Revisa también la carpeta de spam.",
  };
}
export async function verifyCode(r: Request, e: Env, b: any) {
  await rateLimit(r, e, "order-code", 10);
  if (
    !/^[0-9a-f-]{36}$/.test(String(b.challengeId)) ||
    !/^\d{6}$/.test(String(b.code))
  )
    throw new BusinessError(
      "Código inválido o vencido. Solicita uno nuevo.",
      403,
    );
  const c = await e.DB.prepare(
    "UPDATE order_challenges SET attempts=attempts+1 WHERE id=? AND used=0 AND expires>? AND attempts<5 RETURNING *",
  )
    .bind(b.challengeId, Date.now())
    .first<any>();
  if (!c || !c.order_id || c.code_hash !== (await hash(c.id + ":" + b.code)))
    throw new BusinessError(
      "Código inválido o vencido. Solicita uno nuevo.",
      403,
    );
  const used = await e.DB.prepare(
    "UPDATE order_challenges SET used=1 WHERE id=? AND used=0 RETURNING id",
  )
    .bind(c.id)
    .first();
  if (!used)
    throw new BusinessError(
      "Código inválido o vencido. Solicita uno nuevo.",
      403,
    );
  return (await e.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(c.order_id)
    .first<OrderRow>())!;
}
