import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateConversationState } from "./mock-engine.js";
describe("mock conversation engine", () => {
    test("collects transportation required fields from fixture", () => {
        const fixturePath = resolve(import.meta.dirname, "../../../../tests/fixtures/calls/transportation_new_ride.json");
        const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
        const state = evaluateConversationState({
            intent: "transportation_new_ride_request",
            transcriptTurns: fixture.transcriptTurns,
            verticalConfig: {
                vertical: { id: "transportation" },
                fields: {
                    transportation_new_ride_request: {
                        required: [
                            "caller_name",
                            "caller_phone",
                            "passenger_name",
                            "pickup_address",
                            "dropoff_address",
                            "appointment_datetime",
                            "mobility_needs",
                            "round_trip"
                        ]
                    }
                }
            }
        });
        expect(state.collectedFields.caller_name).toBeTruthy();
        expect(state.collectedFields.caller_phone).toContain("555");
        expect(state.collectedFields.pickup_address).toBeTruthy();
        expect(state.collectedFields.dropoff_address).toBeTruthy();
        expect(state.isComplete).toBe(true);
    });
    test("collects home care fields and reports missing fields deterministically", () => {
        const fixturePath = resolve(import.meta.dirname, "../../../../tests/fixtures/calls/homecare_new_client.json");
        const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
        const state = evaluateConversationState({
            intent: "homecare_new_client_request",
            transcriptTurns: fixture.transcriptTurns,
            verticalConfig: {
                vertical: { id: "home_care" },
                fields: {
                    homecare_new_client_request: {
                        required: ["caller_name", "caller_phone", "patient_name", "service_type", "address"]
                    }
                }
            }
        });
        expect(state.collectedFields.caller_name).toBeTruthy();
        expect(state.collectedFields.patient_name).toBeTruthy();
        expect(state.missingRequiredFields).toContain("address");
        expect(state.isComplete).toBe(false);
    });
});
//# sourceMappingURL=mock-engine.test.js.map