import { z } from "zod";

const IdSchema = z.string().min(1);
const IsoDateSchema = z.string().min(1);

export const TenantSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  status: z.string().min(1),
  defaultVertical: z.string().min(1).optional(),
  plan: z.string().min(1).optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema.optional()
});

export const ClientSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  businessName: z.string().min(1),
  vertical: z.string().min(1),
  timezone: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateSchema.optional(),
  updatedAt: IsoDateSchema.optional()
});

export const VerticalConfigSchema = z.object({
  vertical: z.object({
    id: z.string().min(1),
    displayName: z.string().optional()
  }).passthrough(),
  intents: z.array(z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  approvalRules: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const CallSessionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  clientId: IdSchema,
  status: z.string(),
  fromNumber: z.string().optional(),
  toNumber: z.string().optional(),
  startedAt: IsoDateSchema,
  endedAt: IsoDateSchema.optional(),
  summary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const CallEventSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema,
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateSchema
});

export const IntakeRecordSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema,
  vertical: z.string(),
  intent: z.string(),
  status: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
  summary: z.string().optional(),
  requiresHumanReview: z.boolean().default(false)
});

export const TaskSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema.optional(),
  intakeRecordId: IdSchema.optional(),
  type: z.string(),
  status: z.string(),
  priority: z.string().default("normal"),
  title: z.string(),
  description: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const ApprovalSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema.optional(),
  requestedAction: z.string(),
  riskLevel: z.string(),
  reason: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["pending", "approved", "rejected"]).default("pending")
});

export const SafetyDecisionSchema = z.object({
  tenantId: IdSchema,
  callSessionId: IdSchema.optional(),
  allowedActions: z.array(z.string()).default([]),
  blockedActions: z.array(z.string()).default([]),
  approvalRequiredActions: z.array(z.string()).default([]),
  emergencyDetected: z.boolean().default(false),
  reason: z.string().optional()
});

export const ExecutionActionSchema = z.object({
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  requiresApproval: z.boolean().default(false)
});

export const ExecutionPlanSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema.optional(),
  intent: z.string(),
  actions: z.array(ExecutionActionSchema),
  summary: z.string().optional()
});

export const AuditLogSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  actorType: z.string(),
  actorId: z.string().optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateSchema
});

export const WorkflowRunSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  callSessionId: IdSchema.optional(),
  provider: z.string(),
  workflowName: z.string(),
  status: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  error: z.string().optional(),
  startedAt: IsoDateSchema,
  completedAt: IsoDateSchema.optional()
});

export type Tenant = z.infer<typeof TenantSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type VerticalConfig = z.infer<typeof VerticalConfigSchema>;
export type CallSession = z.infer<typeof CallSessionSchema>;
export type CallEvent = z.infer<typeof CallEventSchema>;
export type IntakeRecord = z.infer<typeof IntakeRecordSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type SafetyDecision = z.infer<typeof SafetyDecisionSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
