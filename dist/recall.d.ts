/**
 * OKF auto-recall engine - injects relevant concepts into agent turns
 */
import type { BundleIndex, OkfConfig, SearchResult } from "./types.js";
/**
 * Auto-recall relevant concepts for a given prompt
 * Returns markdown text to inject into the agent context
 */
export declare function recallConcepts(index: BundleIndex, prompt: string, config: OkfConfig): Promise<string>;
/**
 * Apply relevance gates to raw search results.
 *
 * Exported for unit testing. Filters out low-confidence matches that would
 * otherwise be surfaced simply because they cleared the top-N slice.
 *
 * @param results  Search results, assumed sorted by score descending.
 * @param config   Plugin config carrying the gate thresholds.
 */
export declare function applyRelevanceGates(results: SearchResult[], config: OkfConfig): SearchResult[];
/**
 * Follow concept links to build a subgraph
 * Returns set of concept IDs reachable within N hops
 */
export declare function traverseGraph(index: BundleIndex, startConceptId: string, maxDepth: number): Set<string>;
//# sourceMappingURL=recall.d.ts.map