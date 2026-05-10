import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { InMemoryStore } from "./store.js";

const APP_NAME = "VoxaFlow";

const CreateCallSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  fromNumber: z.string().optional(),
  toNumber: z.string().optional()
});

const CreateEventSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

const CreateIntakeSchema = z.object({
  callSessionId: z.string().min(1),
  intent: z.string().min(1),
  status: z.string().default("open"),
  fields: z.record(z.string(), z.unknown()).default({})
});

const CreateTaskSchema = z.object({
  callSessionId: z.string().optional(),
  type: z.string().min(1),
  status: z.string().default("pending"),
  title: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

const CreateApprovalSchema = z.object({
  callSessionId: z.string().optional(),
  requestedAction: z.string().min(1),
  riskLevel: z.string().min(1),
  reason: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  payload: z.record(z.string(), z.unknown()).default({})
});

type TwilioNumberMapping = {
  tenantId: string;
  clientId: string;
};

type AuthContext = {
  subject: string;
  role: "admin" | "staff" | "viewer";
  tenantIds: string[];
};

type Metrics = {
  requestsTotal: number;
  authDeniedTotal: number;
  twilioInboundTotal: number;
  internalEventsTotal: number;
};

function normalizeTwilioStreamUrl(rawMediaUrl: string | undefined, rawPublicBaseUrl: string | undefined): string {
  const media = (rawMediaUrl ?? "").trim();
  if (media) {
    const parsed = new URL(media);
    if (parsed.protocol !== "wss:") {
      throw new Error("TWILIO_MEDIA_STREAM_URL must use wss://");
    }
    return parsed.toString();
  }

  const base = (rawPublicBaseUrl ?? "").trim();
  if (!base) {
    throw new Error("TWILIO_PUBLIC_BASE_URL or TWILIO_MEDIA_STREAM_URL is required");
  }
  const parsedBase = new URL(base);
  if (parsedBase.protocol !== "https:") {
    throw new Error("TWILIO_PUBLIC_BASE_URL must use https://");
  }
  parsedBase.pathname = `${parsedBase.pathname.replace(/\/$/, "")}/twilio-media`;
  parsedBase.search = "";
  parsedBase.hash = "";
  parsedBase.protocol = "wss:";
  return parsedBase.toString();
}

function parseTwilioNumberMap(): Record<string, TwilioNumberMapping> {
  const raw = process.env.TWILIO_NUMBER_TENANT_CLIENT_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TwilioNumberMapping>;
    return parsed;
  } catch {
    return {};
  }
}

function resolveTenantClientFromInboundNumber(toNumber: string | undefined): TwilioNumberMapping | null {
  if (!toNumber) return null;
  const map = parseTwilioNumberMap();
  return map[toNumber] ?? null;
}

function parseAuthTokenMap(): Record<string, AuthContext> {
  const raw = process.env.AUTH_TOKENS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, AuthContext>;
    return parsed;
  } catch {
    return {};
  }
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function buildApp() {
  const app = Fastify({ logger: true });
  const store = new InMemoryStore();
  const metrics: Metrics = {
    requestsTotal: 0,
    authDeniedTotal: 0,
    twilioInboundTotal: 0,
    internalEventsTotal: 0
  };

  app.register(formbody);
  app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 200),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    allowList: ["127.0.0.1"]
  });

  app.addHook("onRequest", async () => {
    metrics.requestsTotal += 1;
  });

  const authRequired = process.env.AUTH_REQUIRED === "true";
  const authTokenMap = parseAuthTokenMap();
  const requireAuthForPaths = [/^\/tenants\//, /^\/internal\//];

  function ensureTenantAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    tenantId: string
  ): boolean {
    if (!authRequired) return true;
    const auth = (request as unknown as { auth?: AuthContext }).auth;
    if (!auth) {
      metrics.authDeniedTotal += 1;
      void reply.code(401).send({ error: "unauthorized" });
      return false;
    }
    if (auth.role === "admin" || auth.tenantIds.includes(tenantId)) return true;
    metrics.authDeniedTotal += 1;
    void reply.code(403).send({ error: "forbidden" });
    return false;
  }

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0];
    const needsAuth = requireAuthForPaths.some((pattern) => pattern.test(path));
    if (!authRequired || !needsAuth) return;

    const token = extractBearerToken(request.headers.authorization);
    const context = token ? authTokenMap[token] : null;
    if (!context) {
      metrics.authDeniedTotal += 1;
      return reply.code(401).send({ error: "unauthorized" });
    }
    (request as unknown as { auth?: AuthContext }).auth = context;
  });

  app.get("/healthz", async () => ({
    status: "ok",
    service: "backend-api",
    app: APP_NAME
  }));

  app.get("/internal/llm/qwen-health", async (_request, reply) => {
    const baseUrl = (process.env.QWEN_VLLM_BASE_URL ?? "http://qwen-vllm:8000").replace(/\/$/, "");
    const healthUrl = `${baseUrl}/healthz`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        return reply.code(503).send({
          status: "unavailable",
          provider: "qwen-vllm",
          url: healthUrl,
          httpStatus: res.status
        });
      }
      const body = (await res.json()) as Record<string, unknown>;
      return {
        status: "ok",
        provider: "qwen-vllm",
        url: healthUrl,
        response: body
      };
    } catch (error) {
      return reply.code(503).send({
        status: "unavailable",
        provider: "qwen-vllm",
        url: healthUrl,
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }
  });

  app.get("/metrics", async () => ({
    service: "backend-api",
    ...metrics
  }));

  app.get("/metrics/prometheus", async (_request, reply) => {
    const lines = [
      "# HELP voxaflow_backend_requests_total Total HTTP requests received.",
      "# TYPE voxaflow_backend_requests_total counter",
      `voxaflow_backend_requests_total ${metrics.requestsTotal}`,
      "# HELP voxaflow_backend_auth_denied_total Total denied auth decisions.",
      "# TYPE voxaflow_backend_auth_denied_total counter",
      `voxaflow_backend_auth_denied_total ${metrics.authDeniedTotal}`,
      "# HELP voxaflow_backend_twilio_inbound_total Total Twilio inbound webhook hits.",
      "# TYPE voxaflow_backend_twilio_inbound_total counter",
      `voxaflow_backend_twilio_inbound_total ${metrics.twilioInboundTotal}`,
      "# HELP voxaflow_backend_internal_events_total Total internal call events posted.",
      "# TYPE voxaflow_backend_internal_events_total counter",
      `voxaflow_backend_internal_events_total ${metrics.internalEventsTotal}`
    ];
    return reply.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
  });

  app.post("/twilio/inbound-call", async (request, reply) => {
    metrics.twilioInboundTotal += 1;
    const reqBody = request.body as Record<string, unknown>;
    const signature = request.headers["x-twilio-signature"];
    const validateSignature = process.env.TWILIO_VALIDATE_SIGNATURE === "true";
    if (validateSignature && !signature) {
      return reply.code(401).send({ error: "missing_twilio_signature" });
    }

    // Placeholder: full signature verification wiring is intentionally deferred.
    const signatureValidation = validateSignature ? "placeholder_not_verified" : "skipped";

    const toNumber = typeof reqBody?.To === "string" ? reqBody.To : undefined;
    const fromNumber = typeof reqBody?.From === "string" ? reqBody.From : undefined;
    const accountSid = typeof reqBody?.AccountSid === "string" ? reqBody.AccountSid : undefined;
    const callSid = typeof reqBody?.CallSid === "string" ? reqBody.CallSid : undefined;
    const mapping = resolveTenantClientFromInboundNumber(toNumber);
    const resolvedTenantId = mapping?.tenantId ?? process.env.TWILIO_DEFAULT_TENANT_ID ?? "tenant_unmapped";
    const resolvedClientId = mapping?.clientId ?? process.env.TWILIO_DEFAULT_CLIENT_ID ?? "client_unmapped";

    const createdCall = store.createCall({
      tenantId: resolvedTenantId,
      clientId: resolvedClientId,
      status: "twilio_inbound",
      fromNumber,
      toNumber
    });
    store.addCallEvent(createdCall.id, "twilio_inbound_webhook", {
      accountSid,
      callSid,
      signatureValidation,
      mappingFound: Boolean(mapping)
    });

    let streamUrl: string;
    try {
      streamUrl = normalizeTwilioStreamUrl(
        process.env.TWILIO_MEDIA_STREAM_URL,
        process.env.TWILIO_PUBLIC_BASE_URL
      );
    } catch (error) {
      request.log.error({ error }, "invalid twilio stream url configuration");
      return reply.code(500).send({ error: "twilio_stream_url_invalid" });
    }
    const greeting =
      process.env.TWILIO_GREETING_TEXT ??
      "";
    const sayBlock = greeting ? `<Say voice="man">${greeting}</Say>` : "";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${sayBlock}<Connect><Stream url="${streamUrl}"><Parameter name="callSessionId" value="${createdCall.id}" /></Stream></Connect></Response>`;
    return reply.type("text/xml").send(twiml);
  });

  app.post("/internal/calls", async (request, reply) => {
    const parsed = CreateCallSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const call = store.createCall({
      tenantId: parsed.data.tenantId,
      clientId: parsed.data.clientId,
      status: "active",
      fromNumber: parsed.data.fromNumber,
      toNumber: parsed.data.toNumber
    });
    return reply.code(201).send(call);
  });

  app.get("/internal/calls/:callId", async (request, reply) => {
    const callId = (request.params as { callId: string }).callId;
    const call = store.getCall(callId);
    if (!call) return reply.code(404).send({ error: "call_not_found" });
    return call;
  });

  app.post("/internal/calls/:callId/events", async (request, reply) => {
    metrics.internalEventsTotal += 1;
    const callId = (request.params as { callId: string }).callId;
    const parsed = CreateEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const call = store.addCallEvent(callId, parsed.data.type, parsed.data.payload);
    if (!call) return reply.code(404).send({ error: "call_not_found" });
    return call;
  });

  app.get("/tenants/:tenantId/calls", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    return store.listCallsByTenant(tenantId);
  });

  app.post("/tenants/:tenantId/intakes", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    const parsed = CreateIntakeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const intake = store.createIntake({ tenantId, ...parsed.data });
    return reply.code(201).send(intake);
  });

  app.get("/tenants/:tenantId/intakes", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    return store.listIntakesByTenant(tenantId);
  });

  app.post("/tenants/:tenantId/tasks", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    const parsed = CreateTaskSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const task = store.createTask({ tenantId, ...parsed.data });
    return reply.code(201).send(task);
  });

  app.get("/tenants/:tenantId/tasks", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    return store.listTasksByTenant(tenantId);
  });

  app.post("/tenants/:tenantId/approvals", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    const parsed = CreateApprovalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const approval = store.createApproval({ tenantId, ...parsed.data });
    return reply.code(201).send(approval);
  });

  app.get("/tenants/:tenantId/approvals", async (request, reply) => {
    const tenantId = (request.params as { tenantId: string }).tenantId;
    if (!ensureTenantAccess(request, reply, tenantId)) return;
    return store.listApprovalsByTenant(tenantId);
  });

  return app;
}
