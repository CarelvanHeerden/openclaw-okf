/**
 * OKF auto-recall engine - injects relevant concepts into agent turns
 */

import type { BundleIndex, ConceptMeta, OkfConfig } from "./types.js";
import { search, tokenize } from "./indexer.js";

/**
 * Auto-recall relevant concepts for a given prompt
 * Returns markdown text to inject into the agent context
 */
export async function recallConcepts(
  index: BundleIndex,
  prompt: string,
  config: OkfConfig
): Promise<string> {
  if (!config.autoRecall) {
    return "";
  }
  
  // Extract keywords from prompt
  const keywords = extractKeywords(prompt);
  
  if (keywords.length === 0) {
    return "";
  }
  
  // Search for relevant concepts
  const searchResults = search(index, keywords.join(" "));
  
  if (searchResults.length === 0) {
    return "";
  }
  
  // Take top N concepts based on config
  const topResults = searchResults.slice(0, config.maxRecallConcepts);
  
  // Build context from concepts + their linked neighbors (if graphDepth > 0)
  const conceptsToInclude = new Map<string, ConceptMeta>();
  
  for (const result of topResults) {
    const concept = index.concepts.get(result.conceptId);
    if (!concept) continue;
    
    conceptsToInclude.set(concept.id, concept);
    
    // Add linked concepts (1-hop graph traversal)
    if (config.graphDepth >= 1) {
      for (const linkedId of [...concept.linksTo, ...concept.linkedFrom]) {
        if (conceptsToInclude.size >= config.maxRecallConcepts * 2) {
          break; // Limit total concepts to prevent explosion
        }
        
        const linkedConcept = index.concepts.get(linkedId);
        if (linkedConcept && !conceptsToInclude.has(linkedId)) {
          conceptsToInclude.set(linkedId, linkedConcept);
        }
      }
    }
  }
  
  // Format as markdown context
  const lines: string[] = [
    "## Relevant Knowledge (OKF)",
    "",
  ];
  
  for (const concept of conceptsToInclude.values()) {
    const conceptText = formatConceptSummary(concept);
    
    // Check if adding this concept would exceed char limit
    // Count actual rendered string length
    const renderedSoFar = lines.join("\n");
    if (renderedSoFar.length + conceptText.length + 1 > config.maxRecallChars) {
      break;
    }
    
    lines.push(conceptText);
    lines.push(""); // Empty line between concepts
  }
  
  return lines.join("\n");
}

/**
 * Extract important keywords from prompt
 * Simple heuristic: remove stopwords, keep meaningful terms
 */
function extractKeywords(prompt: string): string[] {
  const tokens = tokenize(prompt);
  
  // Simple English stopwords
  const stopwords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "will", "with", "what", "when", "where", "who", "how",
    "i", "you", "me", "my", "we", "us", "can", "could", "should", "would",
  ]);
  
  return tokens.filter((token) => !stopwords.has(token) && token.length > 2);
}

/**
 * Format a concept as a compact markdown summary
 */
function formatConceptSummary(concept: ConceptMeta): string {
  const lines: string[] = [];
  
  lines.push(`### ${concept.title} (${concept.type})`);
  
  if (concept.description) {
    lines.push(concept.description);
  }
  
  if (concept.resource) {
    lines.push(`Resource: ${concept.resource}`);
  }
  
  if (concept.tags.length > 0) {
    lines.push(`Tags: ${concept.tags.join(", ")}`);
  }
  
  // Add link info for graph context
  if (concept.linksTo.length > 0) {
    lines.push(`Links to: ${concept.linksTo.slice(0, 3).join(", ")}${concept.linksTo.length > 3 ? "..." : ""}`);
  }
  
  lines.push(`ID: \`${concept.id}\``);
  
  return lines.join("\n");
}

/**
 * Follow concept links to build a subgraph
 * Returns set of concept IDs reachable within N hops
 */
export function traverseGraph(
  index: BundleIndex,
  startConceptId: string,
  maxDepth: number
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [
    { id: startConceptId, depth: 0 },
  ];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (visited.has(current.id) || current.depth > maxDepth) {
      continue;
    }
    
    visited.add(current.id);
    
    const concept = index.concepts.get(current.id);
    if (!concept) continue;
    
    // Add linked concepts to queue
    for (const linkedId of [...concept.linksTo, ...concept.linkedFrom]) {
      if (!visited.has(linkedId)) {
        queue.push({ id: linkedId, depth: current.depth + 1 });
      }
    }
  }
  
  return visited;
}
