import { SafetyDecisionSchema } from "../schemas/domain.js";
const DEFAULT_BLOCKED_ACTIONS = new Set([
    "medical_advice",
    "legal_advice",
    "delete_records"
]);
const DEFAULT_APPROVAL_REQUIRED_ACTIONS = new Set([
    "final_confirm_ride",
    "cancel_existing_ride",
    "reschedule_existing_ride",
    "quote_exact_price"
]);
const EMERGENCY_KEYWORDS = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "trouble breathing",
    "stroke",
    "unconscious",
    "severe bleeding",
    "heart attack",
    "call 911"
];
const EMERGENCY_ALLOWED_ACTIONS = new Set([
    "emergency_escalation",
    "human_transfer_request",
    "notify_staff"
]);
function getApprovalRules(verticalConfig) {
    const raw = verticalConfig?.approvalRules ??
        (verticalConfig?.approval_rules ?? {});
    const blocked = Array.isArray(raw.blocked) ? raw.blocked.filter((x) => typeof x === "string") : [];
    const requiresApproval = Array.isArray(raw.requires_approval)
        ? raw.requires_approval.filter((x) => typeof x === "string")
        : Array.isArray(raw.requiresApproval)
            ? raw.requiresApproval.filter((x) => typeof x === "string")
            : [];
    return { blocked, requiresApproval };
}
export function detectEmergencySignal(input) {
    if ((input.intent ?? "").toLowerCase() === "emergency_escalation") {
        return true;
    }
    const normalized = (input.transcriptText ?? "").toLowerCase();
    return EMERGENCY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
export function evaluateSafetyPolicy(input) {
    const emergencyDetected = detectEmergencySignal(input);
    const { blocked, requiresApproval } = getApprovalRules(input.verticalConfig);
    const blockedSet = new Set([...DEFAULT_BLOCKED_ACTIONS, ...blocked]);
    const approvalSet = new Set([...DEFAULT_APPROVAL_REQUIRED_ACTIONS, ...requiresApproval]);
    const allowedActions = [];
    const blockedActions = [];
    const approvalRequiredActions = [];
    for (const action of input.requestedActions) {
        if (emergencyDetected && !EMERGENCY_ALLOWED_ACTIONS.has(action)) {
            blockedActions.push(action);
            continue;
        }
        if (blockedSet.has(action)) {
            blockedActions.push(action);
            continue;
        }
        if (approvalSet.has(action)) {
            approvalRequiredActions.push(action);
            continue;
        }
        allowedActions.push(action);
    }
    const reason = emergencyDetected
        ? "Emergency signal detected; restricted action set enforced."
        : undefined;
    return SafetyDecisionSchema.parse({
        tenantId: input.tenantId,
        callSessionId: input.callSessionId,
        allowedActions,
        blockedActions,
        approvalRequiredActions,
        emergencyDetected,
        reason
    });
}
//# sourceMappingURL=engine.js.map