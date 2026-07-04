/**
 * OKF (Open Knowledge Format) type definitions
 * Based on OKF v0.1 spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */
/**
 * Keyword trigger patterns for OKF write operations.
 * These are detected in user messages to trigger concept creation.
 */
export const OKF_KEYWORD_TRIGGERS = [
    // Explicit OKF triggers
    "add to okf",
    "add to knowledge base",
    "document this in okf",
    "save to okf",
    "create okf concept",
    "write to knowledge base",
    // Natural language triggers for documentation
    "document this",
    "document this decision",
    "create a playbook",
    "write a playbook",
    "add a playbook",
    "this is a decision:",
    "architecture decision:",
    "new service:",
    "new workflow:",
];
/**
 * Patterns that indicate a conversation contains documentable knowledge.
 * Used by auto-capture to filter out noise. Must match at least one pattern
 * in BOTH the user message AND the assistant response.
 */
export const AUTO_CAPTURE_SIGNALS = {
    /** Signals in the user's message that suggest documentable intent */
    userSignals: [
        /\b(?:decided?|decision)\b.*\b(?:to|that|on)\b/i,
        /\b(?:architecture|design)\b.*\b(?:change|update|new|pattern)\b/i,
        /\b(?:deploy|deployed|deploying)\b.*\b(?:new|updated?)\b/i,
        /\b(?:created?|built|implemented)\b.*\b(?:workflow|service|api|system)\b/i,
        /\b(?:playbook|runbook|procedure)\b.*\b(?:for|to|when)\b/i,
        /\b(?:credential|token|key)\b.*\b(?:rotat|creat|chang|updat)\b/i,
    ],
    /** Signals in the assistant response that suggest documentable content */
    assistantSignals: [
        /\b(?:architecture|design pattern|trade-?off)\b/i,
        /\b(?:step [0-9]|steps?:)\b/i,
        /\b(?:deployed|configured|created|implemented)\b/i,
        /\b(?:workflow|pipeline|service|endpoint)\b/i,
        /\b(?:decision|chose|selected|picked)\b.*\b(?:because|since|due to)\b/i,
    ],
};
//# sourceMappingURL=types.js.map