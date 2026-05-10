import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildApp } from "./app.js";
describe("backend-api routes", () => {
    const previousEnv = process.env;
    beforeEach(() => {
        process.env = { ...previousEnv };
    });
    afterEach(() => {
        process.env = previousEnv;
    });
    test("GET /healthz returns ok", async () => {
        const app = buildApp();
        const res = await app.inject({ method: "GET", url: "/healthz" });
        expect(res.statusCode).toBe(200);
        expect(res.json().status).toBe("ok");
        await app.close();
    });
    test("POST /twilio/inbound-call returns TwiML with stream URL", async () => {
        process.env.TWILIO_PUBLIC_BASE_URL = "https://voice.example.com";
        process.env.TWILIO_NUMBER_TENANT_CLIENT_MAP = JSON.stringify({
            "+15550001111": {
                tenantId: "tenant_demo_transport",
                clientId: "client_demo_transport"
            }
        });
        const app = buildApp();
        const res = await app.inject({
            method: "POST",
            url: "/twilio/inbound-call",
            payload: {
                To: "+15550001111",
                From: "+15551112222",
                AccountSid: "AC123",
                CallSid: "CA123"
            }
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/xml");
        expect(res.body).toContain("https://voice.example.com/twilio-media");
        expect(res.body).toContain("callSessionId");
        expect(res.body).toContain("<Say voice=\"alice\">");
        const calls = await app.inject({ method: "GET", url: "/tenants/tenant_demo_transport/calls" });
        expect(calls.statusCode).toBe(200);
        expect(calls.json()).toHaveLength(1);
        await app.close();
    });
    test("GET /internal/llm/qwen-health returns unavailable when endpoint cannot be reached", async () => {
        process.env.QWEN_VLLM_BASE_URL = "http://127.0.0.1:1";
        const app = buildApp();
        const res = await app.inject({ method: "GET", url: "/internal/llm/qwen-health" });
        expect(res.statusCode).toBe(503);
        expect(res.json().status).toBe("unavailable");
        await app.close();
    });
    test("GET /metrics exposes basic counters", async () => {
        const app = buildApp();
        await app.inject({ method: "GET", url: "/healthz" });
        await app.inject({ method: "POST", url: "/twilio/inbound-call", payload: {} });
        const res = await app.inject({ method: "GET", url: "/metrics" });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.requestsTotal).toBeGreaterThanOrEqual(3);
        expect(body.twilioInboundTotal).toBeGreaterThanOrEqual(1);
        await app.close();
    });
    test("GET /metrics/prometheus exposes prometheus counters", async () => {
        const app = buildApp();
        await app.inject({ method: "GET", url: "/healthz" });
        const res = await app.inject({ method: "GET", url: "/metrics/prometheus" });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/plain");
        expect(res.body).toContain("voxaflow_backend_requests_total");
        await app.close();
    });
    test("POST /twilio/inbound-call enforces signature header when enabled", async () => {
        process.env.TWILIO_VALIDATE_SIGNATURE = "true";
        const app = buildApp();
        const res = await app.inject({ method: "POST", url: "/twilio/inbound-call", payload: {} });
        expect(res.statusCode).toBe(401);
        await app.close();
    });
    test("internal call lifecycle + tenant list endpoints", async () => {
        const app = buildApp();
        const created = await app.inject({
            method: "POST",
            url: "/internal/calls",
            payload: {
                tenantId: "tenant_1",
                clientId: "client_1",
                fromNumber: "+15550100",
                toNumber: "+15550101"
            }
        });
        expect(created.statusCode).toBe(201);
        const call = created.json();
        const event = await app.inject({
            method: "POST",
            url: `/internal/calls/${call.id}/events`,
            payload: { type: "transcript_turn", payload: { text: "hello" } }
        });
        expect(event.statusCode).toBe(200);
        expect(event.json().events).toHaveLength(1);
        const list = await app.inject({ method: "GET", url: "/tenants/tenant_1/calls" });
        expect(list.statusCode).toBe(200);
        expect(list.json()).toHaveLength(1);
        await app.close();
    });
    test("tenant intake/task/approval endpoints create and list records", async () => {
        const app = buildApp();
        const intake = await app.inject({
            method: "POST",
            url: "/tenants/tenant_2/intakes",
            payload: { callSessionId: "call_x", intent: "callback_request", fields: { a: 1 } }
        });
        expect(intake.statusCode).toBe(201);
        const task = await app.inject({
            method: "POST",
            url: "/tenants/tenant_2/tasks",
            payload: { type: "callback", title: "Call back customer", payload: { urgency: "high" } }
        });
        expect(task.statusCode).toBe(201);
        const approval = await app.inject({
            method: "POST",
            url: "/tenants/tenant_2/approvals",
            payload: {
                requestedAction: "final_confirm_ride",
                riskLevel: "high",
                reason: "requires review",
                payload: { amount: 100 }
            }
        });
        expect(approval.statusCode).toBe(201);
        const intakesList = await app.inject({ method: "GET", url: "/tenants/tenant_2/intakes" });
        const tasksList = await app.inject({ method: "GET", url: "/tenants/tenant_2/tasks" });
        const approvalsList = await app.inject({ method: "GET", url: "/tenants/tenant_2/approvals" });
        expect(intakesList.json()).toHaveLength(1);
        expect(tasksList.json()).toHaveLength(1);
        expect(approvalsList.json()).toHaveLength(1);
        await app.close();
    });
    test("auth required enforces bearer token and tenant scoping", async () => {
        process.env.AUTH_REQUIRED = "true";
        process.env.AUTH_TOKENS_JSON = JSON.stringify({
            token_staff_t1: {
                subject: "user_1",
                role: "staff",
                tenantIds: ["tenant_t1"]
            }
        });
        const app = buildApp();
        const unauthorized = await app.inject({
            method: "GET",
            url: "/tenants/tenant_t1/tasks"
        });
        expect(unauthorized.statusCode).toBe(401);
        const forbidden = await app.inject({
            method: "GET",
            url: "/tenants/tenant_t2/tasks",
            headers: { authorization: "Bearer token_staff_t1" }
        });
        expect(forbidden.statusCode).toBe(403);
        const allowed = await app.inject({
            method: "GET",
            url: "/tenants/tenant_t1/tasks",
            headers: { authorization: "Bearer token_staff_t1" }
        });
        expect(allowed.statusCode).toBe(200);
        await app.close();
    });
});
//# sourceMappingURL=main.test.js.map