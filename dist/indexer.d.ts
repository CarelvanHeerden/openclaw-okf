/**
 * OKF bundle indexer - scans directory tree and builds searchable index
 */
import type { BundleIndex, OkfConfig } from "./types.js";
/**
 * Build index from an OKF bundle directory
 */
/** Minimal logger interface matching OpenClaw's plugin logger */
export interface Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
export declare function buildIndex(bundlePath: string, config: OkfConfig, logger?: Logger): Promise<BundleIndex>;
/**
 * Tokenize text for full-text search
 * Simple whitespace + punctuation split, lowercase
 */
export declare function tokenize(text: string): string[];
/**
 * Full-text search using inverted index
 * Returns concept IDs with TF-IDF-like scoring
 */
export declare function search(index: BundleIndex, query: string, typeFilter?: string, tagsFilter?: string[]): Array<{
    conceptId: string;
    score: number;
    matchedTokens: string[];
}>;
/**
 * Watch bundle directory for changes and trigger reindex callback
 */
export declare function watchBundle(bundlePath: string, onChangeCallback: () => void, logger?: Logger): Promise<() => void>;
//# sourceMappingURL=indexer.d.ts.map