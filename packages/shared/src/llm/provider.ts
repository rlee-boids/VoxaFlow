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

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new LlmProviderError(`LLM request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function generateWithFallback<T>(args: {
  primary: LlmProvider;
  fallback?: LlmProvider;
  request: LlmRequest;
  schema: z.ZodSchema<T>;
}): Promise<T> {
  try {
    return await args.primary.generateObject(args.request, args.schema);
  } catch (error) {
    if (!args.fallback) {
      throw error;
    }
    return args.fallback.generateObject(args.request, args.schema);
  }
}

