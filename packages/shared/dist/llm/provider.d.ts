import { z } from "zod";
export type LlmRequest = {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
};
export interface LlmProvider {
    id: string;
    generateObject<T>(request: LlmRequest, schema: z.ZodSchema<T>): Promise<T>;
}
export declare class LlmProviderError extends Error {
    constructor(message: string);
}
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>;
export declare function generateWithFallback<T>(args: {
    primary: LlmProvider;
    fallback?: LlmProvider;
    request: LlmRequest;
    schema: z.ZodSchema<T>;
}): Promise<T>;
