#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const backendBaseUrl = process.env.BACKEND_API_BASE_URL_PUBLIC ?? "http://localhost:3000";
const tenantId = process.env.DEMO_TENANT_ID ?? "tenant_demo_transport";
const clientId = process.env.DEMO_CLIENT_ID ?? "client_demo_transport";
const fixtureName = process.env.DEMO_CALL_FIXTURE ?? "transportation_new_ride";

const fixturePath = resolve(process.cwd(), `tests/fixtures/calls/${fixtureName}.json`);

function extractFieldsFromTurns(turns) {
  const lines = turns.map((line) => line.trim()).filter(Boolean);
  const getFromLine = (regex) => {
    for (const line of lines) {
      const match = line.match(regex);
      if (match?.[1]) return match[1].trim().replace(/[.,]$/, "");
    }
    return undefined;
  };

  const getRoundTrip = () => {
    for (const line of lines) {
      const match = line.match(/\b(round trip|one way)\b/i);
      if (match?.[1]) return match[1].toLowerCase();
    }
    return undefined;
  };

  return {
    caller_name: getFromLine(/(?:my name is|i am)\s+([a-z][a-z .,'-]*?)(?:\s+and\b|$)/i),
    caller_phone: getFromLine(/(?:phone|number)\s*(?:is|:)\s*([+\d()\-.\s]{7,})/i),
    passenger_name: getFromLine(/(?:passenger(?: name)? is)\s+([a-z][a-z .,'-]*)/i),
    pickup_address: getFromLine(/(?:pickup|pick up)\s*(?:address)?\s*(?:is|:)?\s*(.+)$/i),
    dropoff_address: getFromLine(/(?:dropoff|drop off)\s*(?:address)?\s*(?:is|:)?\s*(.+)$/i),
    appointment_datetime: getFromLine(/(?:appointment|date|time)\s*(?:is|:)?\s*([a-z0-9:,\-\s/]+(?:am|pm)?)/i),
    mobility_needs: getFromLine(/(wheelchair.*|stretcher.*|walker.*|mobility.*)$/i),
    round_trip: getRoundTrip()
  };
}

function buildExecutionPlan(intent, fields) {
  const template = {
    transportation_new_ride_request: [
      "create_intake_record",
      "create_task",
      "notify_staff",
      "send_basic_confirmation_sms"
    ]
  };
  const actions = (template[intent] ?? ["create_task", "notify_staff"]).map((action) => ({
    action,
    payload: { intent, fields },
    requiresApproval: false
  }));

  return {
    id: `plan_${crypto.randomUUID()}`,
    intent,
    actions,
    summary: `Execution plan for ${intent}`
  };
}

async function requestJson(path, method, body) {
  const res = await fetch(`${backendBaseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const transcriptTurns = fixture.transcriptTurns ?? [
    "My name is John Carter and my phone number is 555-222-7788.",
    "Passenger name is Mary Carter.",
    "Pickup address is 123 Main St, Sacramento.",
    "Dropoff address is 900 Clinic Ave, Sacramento.",
    "Appointment is tomorrow at 2pm.",
    "Wheelchair mobility needs and this is round trip."
  ];

  const call = await requestJson("/internal/calls", "POST", {
    tenantId,
    clientId,
    fromNumber: "+15550000001",
    toNumber: "+15550000002"
  });

  for (const turn of transcriptTurns) {
    await requestJson(`/internal/calls/${call.id}/events`, "POST", {
      type: "transcript_turn",
      payload: { speaker: "caller", text: turn }
    });
  }

  const fields = extractFieldsFromTurns(transcriptTurns);
  const intent = "transportation_new_ride_request";

  const intake = await requestJson(`/tenants/${tenantId}/intakes`, "POST", {
    callSessionId: call.id,
    intent,
    status: "ready",
    fields
  });

  const plan = buildExecutionPlan(intent, fields);

  const task = await requestJson(`/tenants/${tenantId}/tasks`, "POST", {
    callSessionId: call.id,
    type: "transportation_intake",
    status: "pending",
    title: "Review transportation intake",
    payload: { planId: plan.id }
  });

  const approval = await requestJson(`/tenants/${tenantId}/approvals`, "POST", {
    callSessionId: call.id,
    requestedAction: "final_confirm_ride",
    riskLevel: "high",
    reason: "Final confirmation requires human approval",
    status: "pending",
    payload: { planId: plan.id }
  });

  const summary = {
    backendBaseUrl,
    fixture: fixtureName,
    callId: call.id,
    detectedIntent: intent,
    collectedFields: fields,
    executionPlan: plan,
    createdTaskId: task.id,
    createdApprovalId: approval.id
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[simulate_call] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
