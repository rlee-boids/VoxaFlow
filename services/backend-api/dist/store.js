import { randomUUID } from "node:crypto";
export class InMemoryStore {
    calls = new Map();
    intakes = new Map();
    tasks = new Map();
    approvals = new Map();
    createCall(input) {
        const call = {
            id: `call_${randomUUID()}`,
            createdAt: new Date().toISOString(),
            events: [],
            ...input
        };
        this.calls.set(call.id, call);
        return call;
    }
    addCallEvent(callId, type, payload) {
        const call = this.calls.get(callId);
        if (!call)
            return null;
        call.events.push({ type, payload, createdAt: new Date().toISOString() });
        return call;
    }
    getCall(callId) {
        return this.calls.get(callId) ?? null;
    }
    listCallsByTenant(tenantId) {
        return [...this.calls.values()].filter((c) => c.tenantId === tenantId);
    }
    createIntake(input) {
        const intake = {
            id: `intake_${randomUUID()}`,
            createdAt: new Date().toISOString(),
            ...input
        };
        this.intakes.set(intake.id, intake);
        return intake;
    }
    listIntakesByTenant(tenantId) {
        return [...this.intakes.values()].filter((i) => i.tenantId === tenantId);
    }
    createTask(input) {
        const task = {
            id: `task_${randomUUID()}`,
            createdAt: new Date().toISOString(),
            ...input
        };
        this.tasks.set(task.id, task);
        return task;
    }
    listTasksByTenant(tenantId) {
        return [...this.tasks.values()].filter((t) => t.tenantId === tenantId);
    }
    createApproval(input) {
        const approval = {
            id: `approval_${randomUUID()}`,
            createdAt: new Date().toISOString(),
            ...input
        };
        this.approvals.set(approval.id, approval);
        return approval;
    }
    listApprovalsByTenant(tenantId) {
        return [...this.approvals.values()].filter((a) => a.tenantId === tenantId);
    }
}
//# sourceMappingURL=store.js.map