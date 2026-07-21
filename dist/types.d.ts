/**
 * OKF (Open Knowledge Format) type definitions
 * Based on OKF v0.1 spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */
/**
 * YAML frontmatter metadata for an OKF concept
 */
export interface ConceptFrontmatter {
    /** Required: Type of the concept (e.g., "BigQuery Table", "API Endpoint", "Playbook") */
    type: string;
    /** Optional: Human-readable display name */
    title?: string;
    /** Optional: One-line summary */
    description?: string;
    /** Optional: Canonical URI for the underlying asset */
    resource?: string;
    /** Optional: Tags for cross-cutting categorization */
    tags?: string[];
    /** Optional: ISO 8601 datetime of last meaningful change */
    timestamp?: string;
    /** Allow additional producer-defined fields */
    [key: string]: unknown;
}
/**
 * A parsed OKF concept document
 */
export interface Concept {
    /** Concept ID (relative path from bundle root without .md extension) */
    id: string;
    /** Absolute file path */
    filePath: string;
    /** Parsed frontmatter metadata */
    frontmatter: ConceptFrontmatter;
    /** Markdown body content (after frontmatter) */
    body: string;
    /** Extracted cross-links to other concepts */
    links: ConceptLink[];
}
/**
 * A cross-link from one concept to another
 */
export interface ConceptLink {
    /** Link text */
    text: string;
    /** Target concept ID (resolved from markdown link) */
    targetId: string;
    /** Whether this is an absolute (bundle-relative) or relative link */
    isAbsolute: boolean;
}
/**
 * Metadata for a concept in the index
 */
export interface ConceptMeta {
    /** Concept ID */
    id: string;
    /** Absolute file path */
    filePath: string;
    /** Concept type from frontmatter */
    type: string;
    /** Title (from frontmatter or derived from filename) */
    title: string;
    /** Description from frontmatter */
    description?: string;
    /** Resource URI from frontmatter */
    resource?: string;
    /** Tags from frontmatter */
    tags: string[];
    /** Timestamp from frontmatter */
    timestamp?: string;
    /** IDs of concepts this concept links to */
    linksTo: string[];
    /** IDs of concepts that link to this concept */
    linkedFrom: string[];
    /** File modification time */
    mtime: number;
    /** Tokenized text for FTS (title + description + tags + body excerpt) */
    searchText: string;
}
/**
 * In-memory index of all concepts in a bundle
 */
export interface BundleIndex {
    /** Map of concept ID to metadata */
    concepts: Map<string, ConceptMeta>;
    /** Inverted index for full-text search: token -> Set of concept IDs */
    invertedIndex: Map<string, Set<string>>;
    /** When this index was last built */
    indexedAt: number;
    /** Bundle root path */
    bundlePath: string;
}
/**
 * Search result with relevance score
 */
export interface SearchResult {
    /** Concept ID of the matching concept */
    conceptId: string;
    /** Relevance score (higher is more relevant) */
    score: number;
    /** Matching tokens that contributed to this result */
    matchedTokens: string[];
}
/**
 * Plugin configuration
 */
export interface OkfConfig {
    /** Path to the OKF bundle directory (relative to workspace root) */
    bundlePath: string;
    /** Automatically recall relevant concepts before agent turns */
    autoRecall: boolean;
    /** Maximum characters to inject from recalled concepts */
    maxRecallChars: number;
    /** Maximum number of concepts to recall per turn */
    maxRecallConcepts: number;
    /**
     * Relevance gate: minimum normalized IDF score a concept must reach to be
     * auto-injected. The scorer produces sum(IDF)/queryLength, so this is an
     * absolute floor below which a match is considered noise. Default 0.5.
     */
    minRecallScore?: number;
    /**
     * Relevance gate: a concept is dropped if its score is below
     * recallRelevanceRatio * topScore. Scale-invariant gate that prevents one
     * strong match from dragging in weak, off-topic neighbours. Range 0..1.
     * Default 0.35.
     */
    recallRelevanceRatio?: number;
    /**
     * Relevance gate: minimum number of DISTINCT query tokens a concept must
     * match to be auto-injected. A single overlapping common token is usually
     * noise. Default 1.
     */
    minMatchedTokens?: number;
    /** Number of hops to traverse when following concept links */
    graphDepth: number;
    /** Watch bundle directory for changes and auto-reindex */
    watchChanges: boolean;
    /**
     * FEATURE FLAG: Auto-capture knowledge from agent turns.
     * When enabled, the plugin analyzes completed agent turns and automatically
     * creates OKF concepts for decisions, playbooks, architecture changes, and
     * new services/tools. Defaults to false — opt-in only.
     *
     * WARNING: Without careful filtering, this can produce low-quality concepts
     * from model reasoning artifacts. Only enable if you want automated knowledge
     * extraction and are willing to curate the results.
     */
    autoCapture: boolean;
    /**
     * Minimum assistant response length (chars) before auto-capture considers it.
     * Short responses are unlikely to contain documentable knowledge.
     */
    autoCaptureMinChars: number;
    /**
     * Types of knowledge to auto-capture. Only used when autoCapture is true.
     * Supported: "decision", "playbook", "architecture", "service", "integration"
     */
    autoCaptureTypes: string[];
    /**
     * FEATURE FLAG: Corpus supplement mode.
     * When enabled, registers the `okf_corpus_search` tool which exposes the
     * OKF search function in a memory_search-compatible format so that other
     * plugins (e.g., memory-hybrid) can call it as a corpus supplement.
     * Defaults to false — opt-in only.
     */
    corpusSupplement: boolean;
}
/**
 * Keyword trigger patterns for OKF write operations.
 * These are detected in user messages to trigger concept creation.
 */
export declare const OKF_KEYWORD_TRIGGERS: readonly ["add to okf", "add to knowledge base", "save to knowledge base", "document this in okf", "save to okf", "create okf concept", "write to knowledge base", "document this", "document this decision", "create a playbook", "write a playbook", "add a playbook", "this is a decision:", "architecture decision:", "new service:", "new workflow:"];
/**
 * Patterns that indicate a conversation contains documentable knowledge.
 * Used by auto-capture to filter out noise. Must match at least one pattern
 * in BOTH the user message AND the assistant response.
 */
export declare const AUTO_CAPTURE_SIGNALS: {
    /** Signals in the user's message that suggest documentable intent */
    readonly userSignals: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    /** Signals in the assistant response that suggest documentable content */
    readonly assistantSignals: readonly [RegExp, RegExp, RegExp, RegExp, RegExp];
};
/**
 * Validation result for a concept or bundle
 */
export interface ValidationResult {
    /** Whether the concept/bundle is valid */
    valid: boolean;
    /** List of errors found */
    errors: ValidationError[];
    /** List of warnings (non-fatal issues) */
    warnings: ValidationWarning[];
}
/**
 * A validation error (fatal)
 */
export interface ValidationError {
    /** File path where error occurred */
    filePath?: string;
    /** Concept ID where error occurred */
    conceptId?: string;
    /** Error message */
    message: string;
    /** Error type */
    type: "missing-type" | "invalid-frontmatter" | "parse-error" | "reserved-filename";
}
/**
 * A validation warning (non-fatal)
 */
export interface ValidationWarning {
    /** File path where warning occurred */
    filePath?: string;
    /** Concept ID where warning occurred */
    conceptId?: string;
    /** Warning message */
    message: string;
    /** Warning type */
    type: "missing-recommended" | "broken-link" | "invalid-timestamp" | "missing-okf-version" | "missing-root-index" | "reserved-file-frontmatter";
}
//# sourceMappingURL=types.d.ts.map