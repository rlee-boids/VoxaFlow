export async function summaryJobHandler(job) {
    return {
        status: "success",
        output: {
            callSessionId: job.payload.callSessionId ?? null,
            summary: "placeholder call summary"
        }
    };
}
export async function plannerJobHandler(job) {
    return {
        status: "success",
        output: {
            planId: `plan_for_${String(job.payload.callSessionId ?? "unknown")}`,
            planned: true
        }
    };
}
export async function executionJobHandler(job) {
    const shouldFail = job.payload.shouldFail === true;
    if (shouldFail && job.attempts < job.maxAttempts) {
        return { status: "failed", error: "transient_execution_error" };
    }
    return {
        status: "success",
        output: {
            executionProvider: String(job.payload.provider ?? "mock"),
            status: "queued"
        }
    };
}
export async function notificationJobHandler(job) {
    return {
        status: "success",
        output: {
            channel: String(job.payload.channel ?? "sms"),
            sent: true
        }
    };
}
export async function exportJobHandler(job) {
    return {
        status: "success",
        output: {
            destination: String(job.payload.destination ?? "mock-export"),
            exported: true
        }
    };
}
//# sourceMappingURL=handlers.js.map