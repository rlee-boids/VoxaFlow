import { randomUUID } from "node:crypto";
import { ExecutionPlanSchema } from "../schemas/domain.js";
const INTENT_ACTION_TEMPLATES = {
    transportation_new_ride_request: [
        "create_intake_record",
        "create_task",
        "notify_staff",
        "send_basic_confirmation_sms"
    ],
    transportation_cancel_request: [
        "create_intake_record",
        "create_task",
        "cancel_existing_ride",
        "notify_staff"
    ],
    homecare_new_client_request: [
        "create_intake_record",
        "create_task",
        "notify_staff"
    ],
    callback_request: ["create_task", "notify_staff"],
    unknown_unclear: ["create_task", "notify_staff"]
};
export function buildExecutionPlan(input) {
    const requestedActions = INTENT_ACTION_TEMPLATES[input.intent] ?? INTENT_ACTION_TEMPLATES.unknown_unclear ?? ["create_task"];
    const allowlist = new Set(input.allowedActions);
    const filteredActions = requestedActions.filter((action) => allowlist.has(action));
    const actions = filteredActions.map((action) => ({
        action,
        payload: {
            intent: input.intent,
            fields: input.collectedFields
        },
        requiresApproval: false
    }));
    return ExecutionPlanSchema.parse({
        id: `plan_${randomUUID()}`,
        tenantId: input.tenantId,
        callSessionId: input.callSessionId,
        intent: input.intent,
        actions,
        summary: `Execution plan for intent ${input.intent}`
    });
}
//# sourceMappingURL=intent-planner.js.map