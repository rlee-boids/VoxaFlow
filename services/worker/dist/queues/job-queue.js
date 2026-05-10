export class InMemoryJobQueue {
    handlers = new Map();
    queue = [];
    completed = [];
    deadLetter = [];
    register(type, handler) {
        this.handlers.set(type, handler);
    }
    enqueue(job) {
        this.queue.push({ ...job, attempts: 0 });
    }
    async processNext() {
        const job = this.queue.shift();
        if (!job)
            return null;
        const handler = this.handlers.get(job.type);
        if (!handler) {
            this.deadLetter.push(job);
            return { status: "failed", error: `no_handler_registered:${job.type}` };
        }
        job.attempts += 1;
        const result = await handler(job);
        if (result.status === "success") {
            this.completed.push(job);
            return result;
        }
        if (job.attempts < job.maxAttempts) {
            this.queue.push(job);
        }
        else {
            this.deadLetter.push(job);
        }
        return result;
    }
    async drain() {
        while (this.queue.length > 0) {
            await this.processNext();
        }
    }
    snapshot() {
        return {
            queued: this.queue.length,
            completed: this.completed.length,
            deadLetter: this.deadLetter.length
        };
    }
}
//# sourceMappingURL=job-queue.js.map