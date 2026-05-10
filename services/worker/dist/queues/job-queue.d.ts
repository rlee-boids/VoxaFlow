export type JobType = "summary" | "planner" | "execution" | "notification" | "export";
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
export declare class InMemoryJobQueue {
    private readonly handlers;
    private readonly queue;
    private readonly completed;
    private readonly deadLetter;
    register(type: JobType, handler: JobHandler): void;
    enqueue(job: Omit<JobEnvelope, "attempts">): void;
    processNext(): Promise<JobResult | null>;
    drain(): Promise<void>;
    snapshot(): {
        queued: number;
        completed: number;
        deadLetter: number;
    };
}
