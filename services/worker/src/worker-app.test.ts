import { describe, expect, test } from "vitest";
import { buildWorkerQueue } from "./worker-app.js";

describe("worker queue", () => {
  test("processes summary/planner/notification/export jobs", async () => {
    const queue = buildWorkerQueue();
    queue.enqueue({ id: "j1", type: "summary", payload: { callSessionId: "c1" }, maxAttempts: 2 });
    queue.enqueue({ id: "j2", type: "planner", payload: { callSessionId: "c1" }, maxAttempts: 2 });
    queue.enqueue({ id: "j3", type: "notification", payload: { channel: "sms" }, maxAttempts: 2 });
    queue.enqueue({ id: "j4", type: "export", payload: { destination: "sheets" }, maxAttempts: 2 });

    await queue.drain();
    const snap = queue.snapshot();
    expect(snap.queued).toBe(0);
    expect(snap.completed).toBe(4);
    expect(snap.deadLetter).toBe(0);
  });

  test("retries transient execution failure then succeeds", async () => {
    const queue = buildWorkerQueue();
    queue.enqueue({
      id: "j5",
      type: "execution",
      payload: { shouldFail: true, provider: "mock" },
      maxAttempts: 3
    });

    await queue.drain();
    const snap = queue.snapshot();
    expect(snap.completed).toBe(1);
    expect(snap.deadLetter).toBe(0);
  });
});

