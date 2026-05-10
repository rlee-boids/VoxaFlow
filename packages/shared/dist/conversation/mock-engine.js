function getRequiredFields(verticalConfig, intent) {
    const fields = verticalConfig.fields;
    if (!fields || typeof fields !== "object") {
        return [];
    }
    const intentBlock = fields[intent];
    if (!intentBlock || typeof intentBlock !== "object") {
        return [];
    }
    const required = intentBlock.required;
    if (!Array.isArray(required)) {
        return [];
    }
    return required.filter((x) => typeof x === "string");
}
function extractFieldValue(field, text) {
    const normalized = text.trim();
    const patterns = [
        { key: "caller_name", regex: /(?:my name is|i am)\s+([a-z ,.'-]+)/i },
        { key: "caller_phone", regex: /(?:phone|number)\s*(?:is|:)\s*([+\d()\-.\s]{7,})/i },
        { key: "passenger_name", regex: /(?:passenger(?: name)? is)\s+([a-z ,.'-]+)/i },
        { key: "pickup_address", regex: /(?:pickup|pick up)\s*(?:address)?\s*(?:is|:)?\s*([^,]+(?:,[^,]+){0,2})/i },
        { key: "dropoff_address", regex: /(?:dropoff|drop off)\s*(?:address)?\s*(?:is|:)?\s*([^,]+(?:,[^,]+){0,2})/i },
        { key: "appointment_datetime", regex: /(?:appointment|date|time)\s*(?:is|:)?\s*([a-z0-9:,\-\s/]+(?:am|pm)?)/i },
        { key: "mobility_needs", regex: /(?:wheelchair|stretcher|walker|mobility)\s*(.*)/i },
        { key: "round_trip", regex: /\b(round trip|one way)\b/i },
        { key: "patient_name", regex: /(?:patient(?: name)? is)\s+([a-z ,.'-]+)/i },
        { key: "service_type", regex: /(?:need|request)\s+(home care|caregiver|transportation|ride)/i }
    ];
    const rule = patterns.find((p) => p.key === field);
    if (!rule) {
        return undefined;
    }
    const match = normalized.match(rule.regex);
    if (!match?.[1]) {
        return undefined;
    }
    return match[1].trim();
}
export function evaluateConversationState(input) {
    const requiredFields = getRequiredFields(input.verticalConfig, input.intent);
    const collectedFields = { ...(input.existingFields ?? {}) };
    const transcript = input.transcriptTurns.join("\n");
    for (const field of requiredFields) {
        if (collectedFields[field]) {
            continue;
        }
        const value = extractFieldValue(field, transcript);
        if (value) {
            collectedFields[field] = value;
        }
    }
    const missingRequiredFields = requiredFields.filter((field) => !collectedFields[field]);
    return {
        intent: input.intent,
        collectedFields,
        missingRequiredFields,
        isComplete: missingRequiredFields.length === 0
    };
}
//# sourceMappingURL=mock-engine.js.map