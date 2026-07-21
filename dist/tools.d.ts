/**
 * OKF agent tools - allow agents to search, read, write, and validate concepts
 */
import type { BundleIndex } from "./types.js";
/**
 * Allowlist-based path validation for concept writes.
 * Resolves the path against the bundle root and ensures it stays within bounds.
 * Exported for direct unit testing.
 */
export declare function validateConceptPath(bundlePath: string, userPath: string): {
    valid: boolean;
    error?: string;
};
/**
 * Render a string as a safe single-line YAML scalar.
 * Newlines are collapsed (frontmatter values are single-line in OKF), and the
 * value is double-quoted whenever it contains characters that could be
 * misparsed or injected as additional frontmatter.
 * Exported for direct unit testing.
 */
export declare function yamlScalar(value: string): string;
/**
 * Parameters accepted by the concept write tools.
 */
interface ConceptWriteParams {
    path: string;
    type: string;
    title: string;
    description?: string;
    body: string;
    tags?: string[];
    resource?: string;
}
/**
 * Tool: okf_search - Search for concepts by text, type, or tags
 */
export declare const okfSearchTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        query: import("@sinclair/typebox").TString;
        type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        tags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    }>;
    execute(_id: string, params: {
        query: string;
        type?: string;
        tags?: string[];
        limit?: number;
    }, context: {
        index: BundleIndex;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/**
 * Tool: okf_read - Read a concept by ID and optionally follow links
 */
export declare const okfReadTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        conceptId: import("@sinclair/typebox").TString;
        includeLinks: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    }>;
    execute(_id: string, params: {
        conceptId: string;
        includeLinks?: boolean;
    }, context: {
        index: BundleIndex;
        bundlePath: string;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/**
 * Tool: okf_write - Create or update a concept
 */
export declare const okfWriteTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        path: import("@sinclair/typebox").TString;
        type: import("@sinclair/typebox").TString;
        title: import("@sinclair/typebox").TString;
        description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        body: import("@sinclair/typebox").TString;
        tags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        resource: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    }>;
    execute(_id: string, params: ConceptWriteParams, context: {
        bundlePath: string;
        reindexCallback: () => void;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/**
 * Tool: okf_write_batch - Write multiple concepts in one atomic operation
 */
export declare const okfWriteBatchTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        concepts: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
            path: import("@sinclair/typebox").TString;
            type: import("@sinclair/typebox").TString;
            title: import("@sinclair/typebox").TString;
            description: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
            body: import("@sinclair/typebox").TString;
            tags: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
            resource: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        }>>;
    }>;
    execute(_id: string, params: {
        concepts: ConceptWriteParams[];
    }, context: {
        bundlePath: string;
        reindexCallback: () => void;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/**
 * Tool: okf_list - List concepts in a directory
 */
export declare const okfListTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        directory: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
        type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    }>;
    execute(_id: string, params: {
        directory?: string;
        type?: string;
    }, context: {
        index: BundleIndex;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
/**
 * Tool: okf_validate - Validate bundle conformance to OKF spec
 */
export declare const okfValidateTool: {
    name: string;
    description: string;
    parameters: import("@sinclair/typebox").TObject<{
        path: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    }>;
    execute(_id: string, params: {
        path?: string;
    }, context: {
        bundlePath: string;
        index: BundleIndex;
    }): Promise<{
        content: {
            type: "text";
            text: string;
        }[];
    }>;
};
export {};
//# sourceMappingURL=tools.d.ts.map