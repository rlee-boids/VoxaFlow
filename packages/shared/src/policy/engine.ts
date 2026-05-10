import { SafetyDecisionSchema, type SafetyDecision, type VerticalConfig } from "../schemas/domain.js";

const DEFAULT_BLOCKED_ACTIONS = new Set<string>([
  "medical_advice",
  "legal_advice",
  "delete_records"
]);

const DEFAULT_APPROVAL_REQUIRED_ACTIONS = new Set<string>([
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

const EMERGENCY_ALLOWED_ACTIONS = new Set<string>([
  "emergency_escalation",
  "human_transfer_request",
  "notify_staff"
]);

type PolicyInput = {
  tenantId: string;
  callSessionId?: string;
  intent?: string;
  transcriptText?: string;
  requestedActions: string[];
  verticalConfig?: VerticalConfig;
};

type ApprovalRules = {
  blocked: string[];
  requiresApproval: string[];
};

function getApprovalRules(verticalConfig?: VerticalConfig): ApprovalRules {
  const raw =
    (verticalConfig?.approvalRules as Record<string, unknown> | undefined) ??
    ((verticalConfig as unknown as { approval_rules?: Record<string, unknown> })?.approval_rules ?? {});

  const blocked = Array.isArray(raw.blocked) ? raw.blocked.filter((x): x is string => typeof x === "string") : [];
  const requiresApproval = Array.isArray(raw.requires_approval)
    ? raw.requires_approval.filter((x): x is string => typeof x === "string")
    : Array.isArray(raw.requiresApproval)
      ? raw.requiresApproval.filter((x): x is string => typeof x === "string")
      : [];

  return { blocked, requiresApproval };
}

export function detectEmergencySignal(input: Pick<PolicyInput, "intent" | "transcriptText">): boolean {
  if ((input.intent ?? "").toLowerCase() === "emergency_escalation") {
    return true;
  }
  const normalized = (input.transcriptText ?? "").toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function evaluateSafetyPolicy(input: PolicyInput): SafetyDecision {
  const emergencyDetected = detectEmergencySignal(input);
  const { blocked, requiresApproval } = getApprovalRules(input.verticalConfig);

  const blockedSet = new Set<string>([...DEFAULT_BLOCKED_ACTIONS, ...blocked]);
  const approvalSet = new Set<string>([...DEFAULT_APPROVAL_REQUIRED_ACTIONS, ...requiresApproval]);

  const allowedActions: string[] = [];
  const blockedActions: string[] = [];
  const approvalRequiredActions: string[] = [];

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

