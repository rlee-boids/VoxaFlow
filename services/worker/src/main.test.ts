import { describe, expect, test } from "vitest";
import { buildWorkerQueue } from "./worker-app.js";

describe("worker task2 scaffold", () => {
  test("worker placeholder exists", async () => {
    const queue = buildWorkerQueue();
    expect(queue.snapshot().queued).toBe(0);
  });
});
