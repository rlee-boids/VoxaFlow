import { describe, expect, test } from "vitest";
import { buildExecutionPlan } from "./intent-planner.js";

describe("intent planner", () => {
  test("builds transportation plan with allowlisted actions", () => {
    const plan = buildExecutionPlan({
      tenantId: "tenant_demo_transport",
      callSessionId: "call_1",
      intent: "transportation_new_ride_request",
      collectedFields: { caller_name: "John Doe" },
      allowedActions: ["create_intake_record", "create_task", "notify_staff"]
    });

    const actionIds = plan.actions.map((a) => a.action);
    expect(actionIds).toEqual(["create_intake_record", "create_task", "notify_staff"]);
    expect(actionIds).not.toContain("send_basic_confirmation_sms");
  });

  test("falls back to unknown template", () => {
    const plan = buildExecutionPlan({
      tenantId: "tenant_demo_transport",
      intent: "unmapped_intent",
      collectedFields: {},
      allowedActions: ["create_task"]
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.action).toBe("create_task");
  });
});

