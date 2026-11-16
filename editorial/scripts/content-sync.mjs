import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify, styleText } from "node:util";
import { defaultContent } from "../src/content.ts";

// These fields are public copy with no shipping, checkout or policy semantics.
const fields = ["intro", "about", "headline", "heroText"];
const selectSite = "SELECT data FROM content WHERE id = 'site'";
const runFile = promisify(execFile);
const wrangler = createRequire(import.meta.url).resolve("wrangler");
const editorialDir = fileURLToPath(new URL("../", import.meta.url));

export const targets = {
  local: {
    config: "wrangler.jsonc",
    database: "marlo-editorial-local",
    flag: "--local",
    phrase: "SYNC LOCAL",
  },
  production: {
    config: "wrangler.production.jsonc",
    database: "marlo-editorial",
    flag: "--remote",
    phrase: "SYNC PRODUCTION",
  },
};

export async function executeD1(target, sql, cwd = editorialDir) {
  const args = [
    wrangler, "d1", "execute", target.database, target.flag,
    "--config", target.config, "--env=", "--json", "--command", sql,
  ];
  // Pass one statement directly to Wrangler. A remote --file would use D1's
  // database import path. Leave room for Windows' executable and argument quoting.
  if (process.platform === "win32" && args.join(" ").length > 30_000) {
    throw new Error("La consulta supera el tamaño admitido en Windows. Ejecuta el comando desde Linux o macOS.");
  }
  let payload;
  try {
    const { stdout } = await runFile(process.execPath, args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        WRANGLER_LOG: "log",
        WRANGLER_WRITE_LOGS: "false",
        WRANGLER_SEND_METRICS: "false",
      },
    });
    payload = JSON.parse(stdout);
  } catch {
    // Wrangler output and child-process errors can contain query or account data.
    throw new Error(`Wrangler no pudo ejecutar la consulta en ${target.database}. Revisa la configuración, el acceso a D1 y la conexión.`);
  }
  if (!Array.isArray(payload) || payload.length !== 1 ||
      payload[0]?.success !== true || !Array.isArray(payload[0].results)) {
    throw new Error("Wrangler devolvió un resultado de D1 inesperado.");
  }
  return payload[0].results;
}

async function readSite(query) {
  const rows = await query(selectSite);
  if (rows.length === 0) {
    throw new Error("Falta el registro site en la tabla content. La sincronización requiere un registro existente.");
  }
  const raw = rows[0].data;
  let content;
  try {
    content = JSON.parse(raw);
  } catch {
    throw new Error("El registro site contiene JSON inválido.");
  }
  if (rows.length !== 1 || typeof raw !== "string" || !content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("El registro site debe contener un objeto JSON.");
  }
  return { raw, content };
}

function sqlText(text) {
  // Hex encodes the exact UTF-8 bytes, including quotes and line endings.
  return `CAST(X'${Buffer.from(text, "utf8").toString("hex")}' AS TEXT)`;
}

function display(value) {
  if (value === undefined) return "(ausente en D1)";
  if (typeof value !== "string") return "(valor no textual en D1)";
  return JSON.stringify(value);
}

export async function runContentCommand({
  mode, environment, query, confirm, log = console.log, source = defaultContent,
}) {
  const target = targets[environment];
  log(`MARLO GAMES · ${mode.toUpperCase()}`);
  log(`Entorno ${environment} · D1 ${target.database}\n`);

  const snapshot = await readSite(query);
  const changes = fields.flatMap((field) => {
    const next = source[field];
    if (typeof next !== "string" || next.length > 12_000) {
      throw new Error(`defaultContent.${field} debe ser un texto de hasta 12 000 caracteres.`);
    }
    const previous = Object.hasOwn(snapshot.content, field) ? snapshot.content[field] : undefined;
    return previous === next ? [] : [{ field, previous, next }];
  });

  for (const { field, previous, next } of changes) {
    log(styleText("bold", field));
    log(styleText("red", `− ${display(previous)}`));
    log(styleText("green", `+ ${display(next)}\n`));
  }
  log(`${changes.length} campo(s) con cambios · ${fields.length - changes.length} sin cambios`);
  if (mode !== "sync" || changes.length === 0) {
    log("No se aplicaron cambios.");
    return;
  }
  if ((await confirm(target.phrase)) !== target.phrase) {
    log("Confirmación cancelada. No se aplicaron cambios.");
    return;
  }

  const edits = changes.map(({ field, next }) => `'$.${field}', json(${sqlText(JSON.stringify(next))})`);
  let updated;
  try {
    updated = await query(
      `UPDATE content SET data = json_set(data, ${edits.join(", ")}) ` +
      `WHERE id = 'site' AND data = ${sqlText(snapshot.raw)} COLLATE BINARY RETURNING id`,
    );
  } catch (error) {
    throw new Error(`${error.message} Ejecuta diff para comprobar el estado antes de volver a intentar.`);
  }
  if (updated.length === 0) {
    throw new Error("El registro site cambió desde la vista previa. Vuelve a ejecutar el comando para revisar los valores actuales.");
  }
  if (updated.length !== 1 || updated[0].id !== "site") {
    throw new Error("D1 devolvió un resultado de escritura inesperado. Ejecuta diff para revisar el estado actual.");
  }

  try {
    const saved = await readSite(query);
    const unverified = changes.filter(({ field, next }) => saved.content[field] !== next);
    if (unverified.length) {
      throw new Error(`Valores distintos después de guardar: ${unverified.map(({ field }) => field).join(", ")}.`);
    }
  } catch (error) {
    throw new Error(`D1 aceptó la escritura, pero la verificación falló. ${error.message} Ejecuta diff para revisar el estado actual.`);
  }
  log(`${changes.length} campo(s) actualizados y verificados · ${changes.map(({ field }) => field).join(", ")}`);
}

function confirmInTerminal(phrase) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("La sincronización requiere una terminal interactiva.");
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    terminal.once("close", () => resolve(null));
    terminal.question(`Escribe ${phrase} para aplicar los cambios: `, (answer) => {
      resolve(answer);
      terminal.close();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, environment, ...extra] = process.argv.slice(2);
  try {
    if (!["diff", "sync"].includes(mode) || !Object.hasOwn(targets, environment) || extra.length) {
      throw new Error("Usa uno de los comandos npm content:diff o content:sync del README.");
    }
    await runContentCommand({
      mode,
      environment,
      query: (sql) => executeD1(targets[environment], sql),
      confirm: confirmInTerminal,
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
