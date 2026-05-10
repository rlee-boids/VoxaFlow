export type CallSessionRecord = {
    id: string;
    tenantId: string;
    clientId: string;
    status: string;
    fromNumber?: string;
    toNumber?: string;
    createdAt: string;
    events: Array<{
        type: string;
        payload: Record<string, unknown>;
        createdAt: string;
    }>;
};
export type IntakeRecord = {
    id: string;
    tenantId: string;
    callSessionId: string;
    intent: string;
    status: string;
    fields: Record<string, unknown>;
    createdAt: string;
};
export type TaskRecord = {
    id: string;
    tenantId: string;
    callSessionId?: string;
    type: string;
    status: string;
    title: string;
    payload: Record<string, unknown>;
    createdAt: string;
};
export type ApprovalRecord = {
    id: string;
    tenantId: string;
    callSessionId?: string;
    requestedAction: string;
    riskLevel: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    payload: Record<string, unknown>;
    createdAt: string;
};
export declare class InMemoryStore {
    private readonly calls;
    private readonly intakes;
    private readonly tasks;
    private readonly approvals;
    createCall(input: Omit<CallSessionRecord, "id" | "createdAt" | "events">): CallSessionRecord;
    addCallEvent(callId: string, type: string, payload: Record<string, unknown>): CallSessionRecord | null;
    getCall(callId: string): CallSessionRecord | null;
    listCallsByTenant(tenantId: string): CallSessionRecord[];
    createIntake(input: Omit<IntakeRecord, "id" | "createdAt">): IntakeRecord;
    listIntakesByTenant(tenantId: string): IntakeRecord[];
    createTask(input: Omit<TaskRecord, "id" | "createdAt">): TaskRecord;
    listTasksByTenant(tenantId: string): TaskRecord[];
    createApproval(input: Omit<ApprovalRecord, "id" | "createdAt">): ApprovalRecord;
    listApprovalsByTenant(tenantId: string): ApprovalRecord[];
}
