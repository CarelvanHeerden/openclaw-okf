/**
 * OKF auto-recall engine - injects relevant concepts into agent turns
 */
import { search, tokenize } from "./indexer.js";
/**
 * Auto-recall relevant concepts for a given prompt
 * Returns markdown text to inject into the agent context
 */
export async function recallConcepts(index, prompt, config) {
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
    // Relevance gating (added to stop low-confidence cross-domain concepts from
    // being surfaced just because they cleared top-N). The scorer in indexer.ts
    // produces score = sum(IDF of matched query tokens) / queryLength, which is
    // unbounded and query-length sensitive rather than a normalized 0..1 cosine.
    // We therefore gate on THREE signals, cheapest-first:
    //   1. minMatchedTokens   - require enough distinct query tokens to actually
    //                           overlap (a single common token is usually noise).
    //   2. minRecallScore     - an absolute floor on the normalized IDF score.
    //   3. recallRelevanceRatio - a scale-invariant gate: drop any concept scoring
    //                           far below the best match, so one strong hit does
    //                           not drag in weak neighbours.
    // When nothing clears the gates we inject NOTHING (return ""), which is the
    // correct default for an off-topic turn.
    const gated = applyRelevanceGates(searchResults, config);
    if (gated.length === 0) {
        return "";
    }
    // Take top N concepts based on config
    const topResults = gated.slice(0, config.maxRecallConcepts);
    // Build context from concepts + their linked neighbors (if graphDepth > 0)
    const conceptsToInclude = new Map();
    for (const result of topResults) {
        const concept = index.concepts.get(result.conceptId);
        if (!concept)
            continue;
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
    const lines = [
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
 * Apply relevance gates to raw search results.
 *
 * Exported for unit testing. Filters out low-confidence matches that would
 * otherwise be surfaced simply because they cleared the top-N slice.
 *
 * @param results  Search results, assumed sorted by score descending.
 * @param config   Plugin config carrying the gate thresholds.
 */
export function applyRelevanceGates(results, config) {
    if (results.length === 0) {
        return [];
    }
    // Resolve thresholds with backward-compatible defaults. Older configs that
    // predate these fields simply fall back to the defaults.
    const minMatchedTokens = typeof config.minMatchedTokens === "number" ? config.minMatchedTokens : 1;
    const minRecallScore = typeof config.minRecallScore === "number" ? config.minRecallScore : 0.5;
    const relevanceRatio = typeof config.recallRelevanceRatio === "number"
        ? config.recallRelevanceRatio
        : 0.35;
    // Establish the best score AFTER the token/score floors, so a weak top hit
    // does not set an artificially low ratio bar for everything below it.
    const floored = results.filter((r) => r.matchedTokens.length >= minMatchedTokens && r.score >= minRecallScore);
    if (floored.length === 0) {
        return [];
    }
    const topScore = floored[0].score;
    const ratioFloor = topScore * relevanceRatio;
    return floored.filter((r) => r.score >= ratioFloor);
}
/**
 * Extract important keywords from prompt
 * Simple heuristic: remove stopwords, keep meaningful terms
 */
function extractKeywords(prompt) {
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
function formatConceptSummary(concept) {
    const lines = [];
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
export function traverseGraph(index, startConceptId, maxDepth) {
    const visited = new Set();
    const queue = [
        { id: startConceptId, depth: 0 },
    ];
    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current.id) || current.depth > maxDepth) {
            continue;
        }
        visited.add(current.id);
        const concept = index.concepts.get(current.id);
        if (!concept)
            continue;
        // Add linked concepts to queue
        for (const linkedId of [...concept.linksTo, ...concept.linkedFrom]) {
            if (!visited.has(linkedId)) {
                queue.push({ id: linkedId, depth: current.depth + 1 });
            }
        }
    }
    return visited;
}
//# sourceMappingURL=recall.js.map