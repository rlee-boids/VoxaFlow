import { z } from "zod";
export declare const TenantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    status: z.ZodString;
    defaultVertical: z.ZodOptional<z.ZodString>;
    plan: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ClientSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    businessName: z.ZodString;
    vertical: z.ZodString;
    timezone: z.ZodString;
    settings: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const VerticalConfigSchema: z.ZodObject<{
    vertical: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>;
    intents: z.ZodOptional<z.ZodArray<z.ZodString>>;
    scripts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    fields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    approvalRules: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$loose>;
export declare const CallSessionSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    clientId: z.ZodString;
    status: z.ZodString;
    fromNumber: z.ZodOptional<z.ZodString>;
    toNumber: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodString;
    endedAt: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const CallEventSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodString;
    type: z.ZodString;
    payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const IntakeRecordSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodString;
    vertical: z.ZodString;
    intent: z.ZodString;
    status: z.ZodString;
    fields: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    summary: z.ZodOptional<z.ZodString>;
    requiresHumanReview: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodOptional<z.ZodString>;
    intakeRecordId: z.ZodOptional<z.ZodString>;
    type: z.ZodString;
    status: z.ZodString;
    priority: z.ZodDefault<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const ApprovalSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodOptional<z.ZodString>;
    requestedAction: z.ZodString;
    riskLevel: z.ZodString;
    reason: z.ZodString;
    payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        approved: "approved";
        rejected: "rejected";
    }>>;
}, z.core.$strip>;
export declare const SafetyDecisionSchema: z.ZodObject<{
    tenantId: z.ZodString;
    callSessionId: z.ZodOptional<z.ZodString>;
    allowedActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    blockedActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    approvalRequiredActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    emergencyDetected: z.ZodDefault<z.ZodBoolean>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ExecutionActionSchema: z.ZodObject<{
    action: z.ZodString;
    payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    requiresApproval: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ExecutionPlanSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodOptional<z.ZodString>;
    intent: z.ZodString;
    actions: z.ZodArray<z.ZodObject<{
        action: z.ZodString;
        payload: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        requiresApproval: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const AuditLogSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    actorType: z.ZodString;
    actorId: z.ZodOptional<z.ZodString>;
    action: z.ZodString;
    targetType: z.ZodString;
    targetId: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const WorkflowRunSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    callSessionId: z.ZodOptional<z.ZodString>;
    provider: z.ZodString;
    workflowName: z.ZodString;
    status: z.ZodString;
    input: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    output: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    error: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
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
