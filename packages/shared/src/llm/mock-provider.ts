import { z } from "zod";
import { type LlmProvider, type LlmRequest } from "./provider.js";

export class MockLlmProvider implements LlmProvider {
  public readonly id = "mock-llm";

  constructor(private readonly mockResponse: unknown) {}

  async generateObject<T>(_request: LlmRequest, schema: z.ZodSchema<T>): Promise<T> {
    return schema.parse(this.mockResponse);
  }
}

