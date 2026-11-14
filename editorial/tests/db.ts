import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export function database(orderAccess = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../migrations/schema/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../migrations/seed.local.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../migrations/schema/0003_commerce.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../migrations/schema/0005_marketing.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("../migrations/schema/0006_tracking.sql", import.meta.url),
      "utf8",
    ),
  );
  if (orderAccess) sqlite.exec(readFileSync(new URL("../migrations/schema/0007_order_access.sql", import.meta.url), "utf8"));
  if (orderAccess) sqlite.exec(readFileSync(new URL("../migrations/schema/0008_local_pickup.sql", import.meta.url), "utf8"));
  class Statement {
    constructor(
      public sql: string,
      public values: any[] = [],
    ) {}
    bind(...values: any[]) {
      return new Statement(this.sql, values);
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.values) || null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.values),
        success: true,
      };
    }
    async run() {
      const r = sqlite.prepare(this.sql).run(...this.values);
      return { meta: { changes: Number(r.changes) }, success: true };
    }
  }
  return {
    sqlite,
    db: {
      prepare: (sql: string) => new Statement(sql),
      async batch(statements: Statement[]) {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const s of statements) results.push(await s.run());
          sqlite.exec("COMMIT");
          return results;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      },
    } as unknown as D1Database,
  };
}
