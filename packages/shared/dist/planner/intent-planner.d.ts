import { type ExecutionPlan } from "../schemas/domain.js";
export type PlannerInput = {
    tenantId: string;
    callSessionId?: string;
    intent: string;
    collectedFields: Record<string, unknown>;
    allowedActions: string[];
};
export declare function buildExecutionPlan(input: PlannerInput): ExecutionPlan;
