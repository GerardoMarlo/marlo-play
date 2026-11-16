import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { executeD1, runContentCommand, targets } from "../scripts/content-sync.mjs";
import { defaultContent } from "../src/content.ts";

const schema = "CREATE TABLE content(id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)))";
const editorial = {
  intro: defaultContent.intro,
  about: defaultContent.about,
  headline: defaultContent.headline,
  heroText: defaultContent.heroText,
};
const protectedContent = {
  announcement: "Aviso vigente",
  featuredProductId: "edicion",
  shipping: "Solo ZMG",
  shippingFlatRate: 9900,
  localEnabled: false,
  nationalEnabled: true,
  preordersEnabled: true,
  aboutImage: "https://example.com/foto.png",
  contactEmail: "test@example.com",
  privacy: "Aviso aprobado",
  terms: "Términos aprobados",
  returns: "Política aprobada",
  faq: [["¿Envío?", "Sólo en México.\nTarifa: $99"]],
  futureField: { nested: ["texto", { active: true }, [1, null, false]] },
};
let sqlite, query, confirm, log;

function put(id, value) {
  sqlite.prepare("INSERT OR REPLACE INTO content VALUES (?, ?)").run(id, JSON.stringify(value));
}

function get(id) {
  return JSON.parse(sqlite.prepare("SELECT data FROM content WHERE id = ?").get(id).data);
}

function run(mode, options = {}) {
  return runContentCommand({ mode, environment: "local", query, confirm, log, ...options });
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  put("site", { ...editorial, ...protectedContent });
  query = vi.fn(async (sql) => sqlite.prepare(sql).all());
  confirm = vi.fn(async (phrase) => phrase);
  log = vi.fn();
});

afterEach(() => sqlite.close());

it("muestra solo las diferencias y no escribe ni pregunta en diff", async () => {
  put("site", { ...get("site"), intro: "Anterior", about: undefined });
  const before = get("site");
  await run("diff", { environment: "production" });
  const output = log.mock.calls.flat().join("\n");
  expect(output).toContain("Anterior");
  expect(output).toContain(defaultContent.intro);
  expect(output).toContain("(ausente en D1)");
  expect(output).toContain("2 campo(s) con cambios");
  expect(output).not.toContain(defaultContent.headline);
  expect(output).not.toContain(protectedContent.contactEmail);
  expect(confirm).not.toHaveBeenCalled();
  expect(query.mock.calls).toEqual([["SELECT data FROM content WHERE id = 'site'"]]);
  expect(get("site")).toEqual(before);
});

it("actualiza solo los campos autorizados y conserva FAQ, otros datos JSON y otros registros", async () => {
  const intro = "¡Ñandú! 🐦\r\n'comillas' \"dobles\" \\ ` $() &; DROP TABLE content; --";
  const otherRow = { packaging: [1, 2, 3] };
  put("shipping:packaging", otherRow);
  const source = {
    ...defaultContent,
    intro,
    about: "Texto nuevo\nEn México.",
    shipping: "Cambiado",
    shippingFlatRate: 1,
    faq: [["¿Otro texto?", "Otro valor"]],
  };

  await run("sync", { source });
  expect(confirm).toHaveBeenCalledExactlyOnceWith("SYNC LOCAL");
  expect(get("site")).toEqual({ ...editorial, ...protectedContent, intro, about: source.about });
  expect(get("shipping:packaging")).toEqual(otherRow);
  expect(query).toHaveBeenCalledTimes(3);
  expect(query.mock.calls[1][0]).toContain("'$.intro'");
  expect(query.mock.calls[1][0]).toContain("'$.about'");
  expect(query.mock.calls[1][0]).not.toContain("'$.headline'");
  expect(query.mock.calls[2]).toEqual(query.mock.calls[0]);
  expect(log.mock.calls.flat().join("\n")).toContain("2 campo(s) actualizados y verificados");

  query.mockClear();
  confirm.mockClear();
  await run("sync", { source });
  expect(query).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

it.each(["diff", "sync"])("detiene %s cuando falta site", async (mode) => {
  sqlite.exec("DELETE FROM content");
  await expect(run(mode, { environment: "production" })).rejects.toThrow("Falta el registro site");
  expect(confirm).not.toHaveBeenCalled();
  expect(query).toHaveBeenCalledTimes(1);
});

it("rechaza un registro site que no sea un objeto", async () => {
  put("site", []);
  await expect(run("sync")).rejects.toThrow("debe contener un objeto JSON");
  expect(query).toHaveBeenCalledTimes(1);
});

it("aborta si se modifica cualquier dato del registro durante la confirmación", async () => {
  put("site", { ...get("site"), intro: "Anterior", headline: "Anterior" });
  confirm.mockImplementationOnce(async (phrase) => {
    put("site", { ...get("site"), localEnabled: true });
    return phrase;
  });
  await expect(run("sync")).rejects.toThrow("cambió desde la vista previa");
  expect(get("site")).toMatchObject({ intro: "Anterior", headline: "Anterior", localEnabled: true });
  expect(query).toHaveBeenCalledTimes(2);
});

it.each(["SYNC LOCAL", "sync production", "SYNC PRODUCTION ", "", null])(
  "rechaza la confirmación de producción %j",
  async (answer) => {
    put("site", { ...get("site"), intro: "Anterior" });
    confirm.mockResolvedValueOnce(answer);
    await run("sync", { environment: "production" });
    expect(confirm).toHaveBeenCalledExactlyOnceWith("SYNC PRODUCTION");
    expect(query).toHaveBeenCalledTimes(1);
    expect(get("site").intro).toBe("Anterior");
  },
);

it("acepta la frase de producción exacta usando una base aislada", async () => {
  put("site", { ...get("site"), intro: "Anterior" });
  await run("sync", { environment: "production" });
  expect(confirm).toHaveBeenCalledExactlyOnceWith("SYNC PRODUCTION");
  expect(get("site").intro).toBe(defaultContent.intro);
  expect(targets.production).toMatchObject({
    config: "wrangler.production.jsonc", database: "marlo-editorial", flag: "--remote",
  });
});

it("propaga un fallo de escritura y no declara éxito parcial", async () => {
  put("site", { ...get("site"), intro: "Anterior", about: "Anterior" });
  sqlite.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON content BEGIN SELECT RAISE(ABORT, 'error'); END");
  await expect(run("sync")).rejects.toThrow("Ejecuta diff");
  expect(get("site")).toMatchObject({ intro: "Anterior", about: "Anterior" });
  expect(query).toHaveBeenCalledTimes(2);
  expect(log.mock.calls.flat().join("\n")).not.toContain("actualizados y verificados");
});

it("informa cuando falla la lectura posterior a una escritura aceptada", async () => {
  put("site", { ...get("site"), intro: "Anterior" });
  const execute = async (sql) => sqlite.prepare(sql).all();
  query.mockImplementationOnce(execute).mockImplementationOnce(execute).mockRejectedValueOnce(new Error("Sin conexión"));
  await expect(run("sync")).rejects.toThrow("aceptó la escritura, pero la verificación falló");
  expect(get("site").intro).toBe(defaultContent.intro);
});

it("ejecuta diff y sync con Wrangler contra un D1 local temporal", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "marlo-content-test-"));
  try {
    await copyFile(new URL("../wrangler.jsonc", import.meta.url), join(cwd, "wrangler.jsonc"));
    const localQuery = (sql) => executeD1(targets.local, sql, cwd);
    await localQuery(schema);
    await localQuery(`INSERT INTO content VALUES ('site', '{"faq":[["¿Pregunta?","Sí"]],"localEnabled":false}')`);
    await run("diff", { query: localQuery });
    await run("sync", { query: localQuery });
    const [row] = await localQuery("SELECT data FROM content WHERE id = 'site'");
    expect(JSON.parse(row.data)).toEqual({
      ...editorial,
      faq: [["¿Pregunta?", "Sí"]],
      localEnabled: false,
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 60_000);
