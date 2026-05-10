import { buildWorkerQueue } from "./worker-app.js";

const APP_NAME = "VoxaFlow";
const logLevel = process.env.LOG_LEVEL ?? "info";
const queue = buildWorkerQueue();

console.log(`[${APP_NAME}] worker started (log level: ${logLevel})`);

// Seed one deterministic placeholder job so runtime behavior is visible in logs.
queue.enqueue({
  id: "job_bootstrap_summary",
  type: "summary",
  payload: { callSessionId: "bootstrap_call" },
  maxAttempts: 3
});

setInterval(async () => {
  const result = await queue.processNext();
  if (result) {
    console.log(`[${APP_NAME}] processed job`, result);
  }
}, 1000);
