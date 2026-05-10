import { describe, expect, test } from "vitest";
import { ApprovalSchema, ExecutionPlanSchema, SafetyDecisionSchema, TenantSchema } from "./domain.js";
describe("domain schemas", () => {
    test("tenant schema parses valid payload", () => {
        const tenant = TenantSchema.parse({
            id: "tenant_1",
            name: "Demo Tenant",
            status: "active",
            createdAt: "2026-05-05T00:00:00Z"
        });
        expect(tenant.id).toBe("tenant_1");
    });
    test("safety decision defaults arrays", () => {
        const decision = SafetyDecisionSchema.parse({
            tenantId: "tenant_1"
        });
        expect(decision.allowedActions).toHaveLength(0);
        expect(decision.emergencyDetected).toBe(false);
    });
    test("execution plan requires actions", () => {
        const plan = ExecutionPlanSchema.parse({
            id: "plan_1",
            tenantId: "tenant_1",
            intent: "transportation_new_ride_request",
            actions: [{ action: "create_task" }]
        });
        expect(plan.actions[0]?.action).toBe("create_task");
    });
    test("approval defaults pending status", () => {
        const approval = ApprovalSchema.parse({
            id: "ap_1",
            tenantId: "tenant_1",
            requestedAction: "final_confirm_ride",
            riskLevel: "high",
            reason: "human required"
        });
        expect(approval.status).toBe("pending");
    });
});
//# sourceMappingURL=domain.test.js.map