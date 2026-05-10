import { z } from "zod";
import { type LlmProvider, type LlmRequest } from "./provider.js";
type QwenVllmProviderOptions = {
    baseUrl: string;
    apiKey?: string;
    model: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
};
export declare class QwenVllmProvider implements LlmProvider {
    private readonly options;
    readonly id = "qwen-vllm";
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(options: QwenVllmProviderOptions);
    generateObject<T>(request: LlmRequest, schema: z.ZodSchema<T>): Promise<T>;
}
export {};
