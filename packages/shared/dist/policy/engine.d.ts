import { type SafetyDecision, type VerticalConfig } from "../schemas/domain.js";
type PolicyInput = {
    tenantId: string;
    callSessionId?: string;
    intent?: string;
    transcriptText?: string;
    requestedActions: string[];
    verticalConfig?: VerticalConfig;
};
export declare function detectEmergencySignal(input: Pick<PolicyInput, "intent" | "transcriptText">): boolean;
export declare function evaluateSafetyPolicy(input: PolicyInput): SafetyDecision;
export {};
