/**
 * OKF Auto-Capture Engine
 *
 * Analyzes completed agent turns and optionally creates OKF concepts
 * for significant knowledge (decisions, playbooks, architecture changes).
 *
 * FEATURE FLAG: Disabled by default (autoCapture: false).
 * This module is only active when explicitly enabled in config.
 *
 * Design principles:
 * - High threshold for capture: better to miss something than create garbage
 * - Both user message AND assistant response must contain signals
 * - Minimum response length filter (default 500 chars)
 * - Only captures specific knowledge types, not general conversation
 * - Never captures internal model reasoning, hedging, or filler
 */
import type { OkfConfig } from "./types.js";
/**
 * Result of analyzing a turn for capturable knowledge
 */
export interface CaptureAnalysis {
    /** Whether this turn contains knowledge worth capturing */
    shouldCapture: boolean;
    /** Why capture was triggered (or why it was skipped) */
    reason: string;
    /** Detected knowledge type */
    knowledgeType?: string;
    /** Suggested concept path */
    suggestedPath?: string;
    /** Suggested concept title */
    suggestedTitle?: string;
    /** Suggested concept type (OKF type field) */
    suggestedType?: string;
    /** Whether this was triggered by an explicit keyword */
    isKeywordTriggered: boolean;
}
/**
 * Check if a user message contains an explicit OKF keyword trigger.
 * These are Option 2 triggers — the user explicitly asks to document something.
 */
export declare function detectKeywordTrigger(userMessage: string): {
    triggered: boolean;
    matchedTrigger?: string;
};
/**
 * Analyze a completed agent turn for auto-capturable knowledge.
 * This is Option 3 — behind the autoCapture feature flag.
 *
 * Requires BOTH user and assistant signals to match (high threshold).
 * This prevents capturing:
 * - Model-generated filler or reasoning artifacts
 * - Simple Q&A exchanges
 * - Casual conversation
 * - Internal tool calls or status checks
 */
export declare function analyzeForAutoCapture(userMessage: string, assistantResponse: string, config: OkfConfig): CaptureAnalysis;
//# sourceMappingURL=capture.d.ts.map