import { createRemoteJWKSet, jwtVerify } from "jose";
import { BusinessError } from "../src/domain";
import type { Env } from "./types";
export const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const isLocal = (r: Request, e: Env) =>
  e.MODE === "local" &&
  ["127.0.0.1", "localhost"].includes(new URL(r.url).hostname);
export function originGuard(r: Request, e: Env) {
  if (r.headers.get("Origin") !== e.PUBLIC_ORIGIN)
    throw new BusinessError("Origen no autorizado.", 403);
}
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function admin(r: Request, e: Env) {
  if (isLocal(r, e)) return "local-preview";
  if (!e.ACCESS_TEAM_DOMAIN || !e.ACCESS_AUD || !e.ADMIN_EMAILS)
    throw new BusinessError("Administración pendiente de configurar.", 503);
  const token = r.headers.get("Cf-Access-Jwt-Assertion");
  if (!token)
    throw new BusinessError("Inicia sesión con Cloudflare Access.", 401);
  try {
    const issuer = `https://${e.ACCESS_TEAM_DOMAIN}`;
    if (!keysets.has(issuer))
      keysets.set(
        issuer,
        createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs")),
      );
    const { payload } = await jwtVerify(token, keysets.get(issuer)!, {
      issuer,
      audience: e.ACCESS_AUD,
    });
    if (
      typeof payload.email !== "string" ||
      !e.ADMIN_EMAILS.split(",")
        .map((s) => s.trim().toLowerCase())
        .includes(payload.email.toLowerCase())
    )
      throw new BusinessError("Tu correo de Access no coincide con el administrador autorizado.", 403);
    return payload.email;
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    console.warn("access_verification_failed", {
      code: typeof (error as any)?.code === "string" ? (error as any).code : "verification_error",
    });
    throw new BusinessError("Acceso no autorizado.", 403);
  }
}
export async function rateLimit(r: Request, e: Env, scope: string, limit = 15) {
  const now = Date.now(),
    bucket = Math.floor(now / 60000),
    ip = r.headers.get("CF-Connecting-IP") || "local";
  const id = await hash(`${scope}:${ip}:${bucket}`);
  const result = await e.DB.prepare(
    "INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(id, now + 120000)
    .first<{ count: number }>().catch(error=>{
      console.error('rate_limit_storage_error', error instanceof Error ? error.message : 'unknown');
      throw error;
    });
  if ((result?.count || 0) > limit)
    throw new BusinessError(
      "Demasiados intentos. Espera un minuto y vuelve a intentar.",
      429,
    );
}
export async function antiBot(r: Request, e: Env, token?: string) {
  if (isLocal(r, e)) return;
  if (!e.TURNSTILE_SECRET || !token)
    throw new BusinessError("Completa la verificación de seguridad.", 400);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: e.TURNSTILE_SECRET,
        response: token,
        remoteip: r.headers.get("CF-Connecting-IP") || "",
      }),
    },
  );
  const data = (await response.json()) as {
    success: boolean;
    hostname: string;
  };
  if (!data.success || data.hostname !== new URL(e.PUBLIC_ORIGIN).hostname)
    throw new BusinessError("No se pudo verificar el formulario.");
}
