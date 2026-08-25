import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "./offlineRouteQueue";

describe("offline SQLite operation queue", () => {
  it("runs one database operation at a time", async () => {
    const enqueue = createSerialTaskQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = enqueue(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = enqueue(() => { events.push("second"); });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues after an operation fails", async () => {
    const enqueue = createSerialTaskQueue();
    const failed = enqueue(() => { throw new Error("expected test failure"); });
    const next = enqueue(() => "continued");

    await expect(failed).rejects.toThrow("expected test failure");
    await expect(next).resolves.toBe("continued");
  });
});
