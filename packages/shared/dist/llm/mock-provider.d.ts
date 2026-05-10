import { z } from "zod";
import { type LlmProvider, type LlmRequest } from "./provider.js";
export declare class MockLlmProvider implements LlmProvider {
    private readonly mockResponse;
    readonly id = "mock-llm";
    constructor(mockResponse: unknown);
    generateObject<T>(_request: LlmRequest, schema: z.ZodSchema<T>): Promise<T>;
}
