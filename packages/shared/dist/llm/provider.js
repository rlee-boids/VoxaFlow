export class LlmProviderError extends Error {
    constructor(message) {
        super(message);
        this.name = "LlmProviderError";
    }
}
export async function withTimeout(promise, timeoutMs) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new LlmProviderError(`LLM request timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}
export async function generateWithFallback(args) {
    try {
        return await args.primary.generateObject(args.request, args.schema);
    }
    catch (error) {
        if (!args.fallback) {
            throw error;
        }
        return args.fallback.generateObject(args.request, args.schema);
    }
}
//# sourceMappingURL=provider.js.map