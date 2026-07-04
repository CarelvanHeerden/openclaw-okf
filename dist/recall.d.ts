/**
 * OKF auto-recall engine - injects relevant concepts into agent turns
 */
import type { BundleIndex, OkfConfig } from "./types.js";
/**
 * Auto-recall relevant concepts for a given prompt
 * Returns markdown text to inject into the agent context
 */
export declare function recallConcepts(index: BundleIndex, prompt: string, config: OkfConfig): Promise<string>;
/**
 * Follow concept links to build a subgraph
 * Returns set of concept IDs reachable within N hops
 */
export declare function traverseGraph(index: BundleIndex, startConceptId: string, maxDepth: number): Set<string>;
//# sourceMappingURL=recall.d.ts.map