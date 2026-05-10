import { z } from "zod";
import { type LlmProvider, LlmProviderError, type LlmRequest, withTimeout } from "./provider.js";

const ChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string()
      })
    })
  ).min(1)
});

type QwenVllmProviderOptions = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class QwenVllmProvider implements LlmProvider {
  public readonly id = "qwen-vllm";
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: QwenVllmProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateObject<T>(request: LlmRequest, schema: z.ZodSchema<T>): Promise<T> {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    const messages = [
      ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
      { role: "user", content: request.userPrompt }
    ];

    const body = {
      model: this.options.model,
      messages,
      temperature: request.temperature ?? 0,
      response_format: { type: "json_object" }
    };

    const response = await withTimeout(
      this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }),
      this.timeoutMs
    );

    if (!response.ok) {
      throw new LlmProviderError(`Qwen/vLLM request failed with status ${response.status}`);
    }

    const raw = await response.json();
    const parsed = ChatCompletionSchema.parse(raw);
    const text = parsed.choices[0].message.content;

    let asJson: unknown;
    try {
      asJson = JSON.parse(text);
    } catch {
      throw new LlmProviderError("Qwen/vLLM returned non-JSON content");
    }

    return schema.parse(asJson);
  }
}

