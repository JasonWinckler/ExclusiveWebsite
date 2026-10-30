import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function testDatabase(beforeMigration: boolean | string = false) {
  const sqlite = new DatabaseSync(":memory:");
  const directory = fileURLToPath(new URL("../../migrations/", import.meta.url));
  for (const name of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    const cutoff = beforeMigration === true ? "0027" : beforeMigration;
    if (typeof cutoff === "string" && name.slice(0, 4) >= cutoff) break;
    sqlite.exec(readFileSync(`${directory}/${name}`, "utf8"));
  }
  function prepare(sql: string) {
    let bindings: any[] = [];
    return {
      bind(...values: any[]) { bindings = values; return this; },
      async first(column?: string) {
        const row = sqlite.prepare(sql).get(...bindings) ?? null;
        return column && row ? row[column] : row;
      },
      async all() { return { results: sqlite.prepare(sql).all(...bindings), success: true, meta: {} }; },
      async run() {
        const result = sqlite.prepare(sql).run(...bindings);
        return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  const DB = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all().catch(() => statement.run()));
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, DB };
}
