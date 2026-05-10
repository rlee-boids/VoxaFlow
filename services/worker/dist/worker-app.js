import { executionJobHandler, exportJobHandler, notificationJobHandler, plannerJobHandler, summaryJobHandler } from "./jobs/handlers.js";
import { InMemoryJobQueue } from "./queues/job-queue.js";
export function buildWorkerQueue() {
    const queue = new InMemoryJobQueue();
    queue.register("summary", summaryJobHandler);
    queue.register("planner", plannerJobHandler);
    queue.register("execution", executionJobHandler);
    queue.register("notification", notificationJobHandler);
    queue.register("export", exportJobHandler);
    return queue;
}
//# sourceMappingURL=worker-app.js.map