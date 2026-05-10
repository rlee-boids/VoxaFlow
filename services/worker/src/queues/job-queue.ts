export type JobType =
  | "summary"
  | "planner"
  | "execution"
  | "notification"
  | "export";

export type JobEnvelope = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

export type JobResult = {
  status: "success" | "failed";
  output?: Record<string, unknown>;
  error?: string;
};

export type JobHandler = (job: JobEnvelope) => Promise<JobResult>;

export class InMemoryJobQueue {
  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly queue: JobEnvelope[] = [];
  private readonly completed: JobEnvelope[] = [];
  private readonly deadLetter: JobEnvelope[] = [];

  register(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  enqueue(job: Omit<JobEnvelope, "attempts">) {
    this.queue.push({ ...job, attempts: 0 });
  }

  async processNext(): Promise<JobResult | null> {
    const job = this.queue.shift();
    if (!job) return null;

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
    } else {
      this.deadLetter.push(job);
    }

    return result;
  }

  async drain(): Promise<void> {
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

