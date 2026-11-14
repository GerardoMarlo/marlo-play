export async function api<T = any>(
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await r.json();
  if (!r.ok)
    throw new Error(data.error || "No se pudo completar la solicitud.");
  return data;
}
