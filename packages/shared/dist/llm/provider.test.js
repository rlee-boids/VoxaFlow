import { describe, expect, test } from "vitest";
import { z } from "zod";
import { MockLlmProvider } from "./mock-provider.js";
import { generateWithFallback, LlmProviderError, withTimeout } from "./provider.js";
import { QwenVllmProvider } from "./qwen-vllm-provider.js";
describe("llm providers", () => {
    test("mock provider validates schema", async () => {
        const provider = new MockLlmProvider({ answer: "ok" });
        const schema = z.object({ answer: z.string() });
        const out = await provider.generateObject({ userPrompt: "hello" }, schema);
        expect(out.answer).toBe("ok");
    });
    test("fallback provider is used on primary failure", async () => {
        const broken = {
            id: "broken",
            async generateObject() {
                throw new Error("primary failed");
            }
        };
        const fallback = new MockLlmProvider({ value: "from-fallback" });
        const schema = z.object({ value: z.string() });
        const out = await generateWithFallback({
            primary: broken,
            fallback,
            request: { userPrompt: "x" },
            schema
        });
        expect(out.value).toBe("from-fallback");
    });
    test("qwen provider parses openai-compatible json response", async () => {
        const schema = z.object({ intent: z.string() });
        const fakeFetch = async () => new Response(JSON.stringify({
            choices: [{ message: { content: "{\"intent\":\"transportation_new_ride_request\"}" } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
        const provider = new QwenVllmProvider({
            baseUrl: "http://qwen-vllm:8000",
            model: "Qwen/Qwen2.5-14B-Instruct",
            fetchImpl: fakeFetch
        });
        const out = await provider.generateObject({ userPrompt: "classify this call" }, schema);
        expect(out.intent).toBe("transportation_new_ride_request");
    });
    test("withTimeout fails deterministically", async () => {
        const never = new Promise(() => undefined);
        await expect(withTimeout(never, 10)).rejects.toBeInstanceOf(LlmProviderError);
    });
});
//# sourceMappingURL=provider.test.js.map