import { describe, expect, it, vi } from "vitest";
import maintenanceWorker from "../src/workers/maintenance-jobs";
import type { MaintenanceEnv } from "../src/shared/types";
import { testDatabase } from "./helpers/database";

describe("maintenance rollout compatibility", () => {
  it("runs retained maintenance safely before migration 0027 while newsletters are paused", async () => {
    const { DB, sqlite } = testDatabase("0027");
    const identityFetch = vi.fn(() => { throw new Error("Unexpected email or identity operation"); });
    const env = {
      DB,
      NEWSLETTER_DELIVERY_ENABLED: "false",
      IDENTITY_PROJECTION: { fetch: identityFetch },
      SYSTEM_BACKUPS: { list: vi.fn(async () => ({ objects: [] })) },
    } as unknown as MaintenanceEnv;
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext;
    await maintenanceWorker.scheduled({} as ScheduledController, env, ctx);
    await Promise.all(pending);
    expect(identityFetch).not.toHaveBeenCalled();
    expect(sqlite.prepare("SELECT status FROM system_job_runs").all()).toEqual([
      { status: "SUCCEEDED" },
    ]);
    expect(sqlite.prepare("PRAGMA table_info(content_items)").all().some((column) => column.name === "content_scope")).toBe(false);
    sqlite.close();
  });
});
