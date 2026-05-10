import type { VerticalConfig } from "../schemas/domain.js";
export type ConversationInput = {
    verticalConfig: VerticalConfig;
    intent: string;
    transcriptTurns: string[];
    existingFields?: Record<string, string>;
};
export type ConversationState = {
    intent: string;
    collectedFields: Record<string, string>;
    missingRequiredFields: string[];
    isComplete: boolean;
};
export declare function evaluateConversationState(input: ConversationInput): ConversationState;
