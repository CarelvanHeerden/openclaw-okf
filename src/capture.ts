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
import { AUTO_CAPTURE_SIGNALS, OKF_KEYWORD_TRIGGERS } from "./types.js";

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
export function detectKeywordTrigger(userMessage: string): {
  triggered: boolean;
  matchedTrigger?: string;
} {
  const lower = userMessage.toLowerCase();
  
  for (const trigger of OKF_KEYWORD_TRIGGERS) {
    if (lower.includes(trigger)) {
      return { triggered: true, matchedTrigger: trigger };
    }
  }
  
  return { triggered: false };
}

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
export function analyzeForAutoCapture(
  userMessage: string,
  assistantResponse: string,
  config: OkfConfig,
): CaptureAnalysis {
  // Gate 1: Feature flag
  if (!config.autoCapture) {
    return {
      shouldCapture: false,
      reason: "autoCapture is disabled",
      isKeywordTriggered: false,
    };
  }
  
  // Gate 2: Minimum response length
  if (assistantResponse.length < config.autoCaptureMinChars) {
    return {
      shouldCapture: false,
      reason: `Response too short (${assistantResponse.length} < ${config.autoCaptureMinChars} chars)`,
      isKeywordTriggered: false,
    };
  }
  
  // Gate 3: Check for garbage signals (model reasoning artifacts)
  if (containsGarbageSignals(assistantResponse)) {
    return {
      shouldCapture: false,
      reason: "Response contains model reasoning artifacts, not documentable knowledge",
      isKeywordTriggered: false,
    };
  }
  
  // Gate 4: User message must contain at least one user signal
  const userSignalMatch = AUTO_CAPTURE_SIGNALS.userSignals.some((pattern) =>
    pattern.test(userMessage)
  );
  
  if (!userSignalMatch) {
    return {
      shouldCapture: false,
      reason: "No documentable intent detected in user message",
      isKeywordTriggered: false,
    };
  }
  
  // Gate 5: Assistant response must contain at least one assistant signal
  const assistantSignalMatch = AUTO_CAPTURE_SIGNALS.assistantSignals.some(
    (pattern) => pattern.test(assistantResponse)
  );
  
  if (!assistantSignalMatch) {
    return {
      shouldCapture: false,
      reason: "No documentable content detected in assistant response",
      isKeywordTriggered: false,
    };
  }
  
  // Both signals matched — determine knowledge type
  const knowledgeType = detectKnowledgeType(userMessage, assistantResponse);
  
  // Gate 6: Knowledge type must be in the allowed list
  if (!config.autoCaptureTypes.includes(knowledgeType)) {
    return {
      shouldCapture: false,
      reason: `Knowledge type "${knowledgeType}" not in autoCaptureTypes`,
      isKeywordTriggered: false,
    };
  }
  
  // Build suggestion
  const suggestion = buildCaptureSuggestion(
    knowledgeType,
    userMessage,
    assistantResponse,
  );
  
  return {
    shouldCapture: true,
    reason: `Detected ${knowledgeType} knowledge with matching user and assistant signals`,
    knowledgeType,
    suggestedPath: suggestion.path,
    suggestedTitle: suggestion.title,
    suggestedType: suggestion.type,
    isKeywordTriggered: false,
  };
}

/**
 * Detect what type of knowledge a conversation contains.
 */
function detectKnowledgeType(
  userMessage: string,
  assistantResponse: string,
): string {
  const combined = `${userMessage} ${assistantResponse}`.toLowerCase();
  
  // Priority order matters — more specific types first
  if (/\b(?:playbook|runbook|procedure|step[s]?\s*(?:to|for|:))\b/i.test(combined)) {
    return "playbook";
  }
  
  if (/\b(?:decided?|decision|chose|trade-?off)\b/i.test(combined) &&
      /\b(?:because|since|due to|over|instead)\b/i.test(combined)) {
    return "decision";
  }
  
  if (/\b(?:architecture|design|pattern|schema|data model)\b/i.test(combined)) {
    return "architecture";
  }
  
  if (/\b(?:deploy|service|api|endpoint|server)\b/i.test(combined) &&
      /\b(?:new|created?|launched|configured)\b/i.test(combined)) {
    return "service";
  }
  
  if (/\b(?:integrat|connect|sync|pipeline|workflow)\b/i.test(combined)) {
    return "integration";
  }
  
  return "decision"; // Default fallback
}

/**
 * Check if a response contains signals of model reasoning artifacts
 * that should NOT be captured as knowledge.
 */
function containsGarbageSignals(response: string): boolean {
  const garbagePatterns = [
    // Model hedging and uncertainty
    /\bI('m| am) not (?:sure|certain)\b/i,
    /\bI think (?:maybe|perhaps)\b/i,
    /\bLet me (?:think|consider|reconsider)\b/i,
    
    // Internal reasoning leakage
    /\b(?:thinking|reasoning) (?:step|through|about)\b/i,
    /\bOn (?:second|further) thought\b/i,
    
    // Error recovery / apologizing
    /\bI (?:apologize|was wrong|made a mistake)\b/i,
    /\bLet me (?:correct|fix|redo) that\b/i,
    
    // Tool status messages (not knowledge)
    /^(?:HEARTBEAT_OK|NO_REPLY)\s*$/,
    
    // Pure status updates without substance
    /^(?:Done|OK|Got it|Sure|Will do)\s*[.!]?\s*$/,
  ];
  
  return garbagePatterns.some((pattern) => pattern.test(response));
}

/**
 * Build a capture suggestion (path, title, type) from conversation content.
 */
function buildCaptureSuggestion(
  knowledgeType: string,
  userMessage: string,
  _assistantResponse: string,
): { path: string; title: string; type: string } {
  const typeMap: Record<string, { dir: string; okfType: string }> = {
    decision: { dir: "decisions", okfType: "Decision" },
    playbook: { dir: "playbooks", okfType: "Playbook" },
    architecture: { dir: "architecture", okfType: "Architecture" },
    service: { dir: "infrastructure", okfType: "Service" },
    integration: { dir: "workflows", okfType: "Integration" },
  };
  
  const { dir, okfType } = typeMap[knowledgeType] || typeMap.decision;
  
  // Extract a slug from the user message (first meaningful phrase)
  const slug = extractSlug(userMessage);
  const date = new Date().toISOString().slice(0, 10);
  
  return {
    path: `${dir}/${slug}-${date}`,
    title: extractTitle(userMessage),
    type: okfType,
  };
}

/**
 * Extract a URL-safe slug from a message.
 */
function extractSlug(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .slice(0, 50) || "untitled";
}

/**
 * Extract a human-readable title from a message.
 */
function extractTitle(message: string): string {
  // Take the first sentence or first 80 chars
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() || message;
  return firstSentence.length > 80
    ? firstSentence.slice(0, 77) + "..."
    : firstSentence;
}
