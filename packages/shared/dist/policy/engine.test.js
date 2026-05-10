import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateSafetyPolicy } from "./engine.js";
describe("policy engine", () => {
    test("blocks globally blocked actions and routes risky actions to approval", () => {
        const decision = evaluateSafetyPolicy({
            tenantId: "tenant_demo_transport",
            requestedActions: [
                "create_task",
                "medical_advice",
                "final_confirm_ride",
                "notify_staff"
            ],
            verticalConfig: {
                vertical: { id: "transportation" },
                approvalRules: {
                    blocked: ["refund_or_payment_action"],
                    requiresApproval: ["cancel_existing_ride"]
                }
            }
        });
        expect(decision.allowedActions).toEqual(["create_task", "notify_staff"]);
        expect(decision.blockedActions).toContain("medical_advice");
        expect(decision.approvalRequiredActions).toContain("final_confirm_ride");
        expect(decision.emergencyDetected).toBe(false);
    });
    test("detects emergency signals and restricts actions", () => {
        const decision = evaluateSafetyPolicy({
            tenantId: "tenant_demo_transport",
            transcriptText: "I have chest pain and trouble breathing please help now",
            requestedActions: ["create_task", "notify_staff", "emergency_escalation"],
            verticalConfig: {
                vertical: { id: "transportation" }
            }
        });
        expect(decision.emergencyDetected).toBe(true);
        expect(decision.allowedActions).toEqual(["notify_staff", "emergency_escalation"]);
        expect(decision.blockedActions).toContain("create_task");
    });
    test("supports fixture-driven emergency check", () => {
        const fixturePath = resolve(import.meta.dirname, "../../../../tests/fixtures/calls/emergency_chest_pain.json");
        const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
        const decision = evaluateSafetyPolicy({
            tenantId: "tenant_demo_transport",
            transcriptText: fixture.transcriptText ?? `${fixture.fixture ?? ""} caller reports chest pain and asks for help`,
            intent: fixture.fixture === "emergency_chest_pain" ? "emergency_escalation" : "unknown",
            requestedActions: ["notify_staff", "create_task", "emergency_escalation"]
        });
        expect(decision.emergencyDetected).toBe(true);
        expect(decision.allowedActions).toContain("emergency_escalation");
        expect(decision.blockedActions).toContain("create_task");
    });
});
//# sourceMappingURL=engine.test.js.map