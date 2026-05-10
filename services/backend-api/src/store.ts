import { randomUUID } from "node:crypto";

export type CallSessionRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  status: string;
  fromNumber?: string;
  toNumber?: string;
  createdAt: string;
  events: Array<{ type: string; payload: Record<string, unknown>; createdAt: string }>;
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

export class InMemoryStore {
  private readonly calls = new Map<string, CallSessionRecord>();
  private readonly intakes = new Map<string, IntakeRecord>();
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly approvals = new Map<string, ApprovalRecord>();

  createCall(input: Omit<CallSessionRecord, "id" | "createdAt" | "events">): CallSessionRecord {
    const call: CallSessionRecord = {
      id: `call_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      events: [],
      ...input
    };
    this.calls.set(call.id, call);
    return call;
  }

  addCallEvent(callId: string, type: string, payload: Record<string, unknown>) {
    const call = this.calls.get(callId);
    if (!call) return null;
    call.events.push({ type, payload, createdAt: new Date().toISOString() });
    return call;
  }

  getCall(callId: string) {
    return this.calls.get(callId) ?? null;
  }

  listCallsByTenant(tenantId: string) {
    return [...this.calls.values()].filter((c) => c.tenantId === tenantId);
  }

  createIntake(input: Omit<IntakeRecord, "id" | "createdAt">): IntakeRecord {
    const intake: IntakeRecord = {
      id: `intake_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    this.intakes.set(intake.id, intake);
    return intake;
  }

  listIntakesByTenant(tenantId: string) {
    return [...this.intakes.values()].filter((i) => i.tenantId === tenantId);
  }

  createTask(input: Omit<TaskRecord, "id" | "createdAt">): TaskRecord {
    const task: TaskRecord = {
      id: `task_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    this.tasks.set(task.id, task);
    return task;
  }

  listTasksByTenant(tenantId: string) {
    return [...this.tasks.values()].filter((t) => t.tenantId === tenantId);
  }

  createApproval(input: Omit<ApprovalRecord, "id" | "createdAt">): ApprovalRecord {
    const approval: ApprovalRecord = {
      id: `approval_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  listApprovalsByTenant(tenantId: string) {
    return [...this.approvals.values()].filter((a) => a.tenantId === tenantId);
  }
}

