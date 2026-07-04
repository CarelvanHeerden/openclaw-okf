/**
 * OKF agent tools - allow agents to search, read, write, and validate concepts
 */
import type { BundleIndex } from "./types.js";
/**
 * Tool: okf_search - Search for concepts by text, type, or tags
 */
export declare const okfSearchTool: {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: {
            query: {
                type: "string";
                description: string;
            };
            type: {
                type: "string";
                description: string;
            };
            tags: {
                type: "array";
                items: {
                    type: "string";
                };
                description: string;
            };
            limit: {
                type: "number";
                description: string;
                default: number;
                minimum: number;
                maximum: number;
            };
        };
        required: readonly ["query"];
    };
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
    parameters: {
        type: "object";
        properties: {
            conceptId: {
                type: "string";
                description: string;
            };
            includeLinks: {
                type: "boolean";
                description: string;
                default: boolean;
            };
        };
        required: readonly ["conceptId"];
    };
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
    parameters: {
        type: "object";
        properties: {
            path: {
                type: "string";
                description: string;
            };
            type: {
                type: "string";
                description: string;
            };
            title: {
                type: "string";
                description: string;
            };
            description: {
                type: "string";
                description: string;
            };
            body: {
                type: "string";
                description: string;
            };
            tags: {
                type: "array";
                items: {
                    type: "string";
                };
                description: string;
            };
            resource: {
                type: "string";
                description: string;
            };
        };
        required: readonly ["path", "type", "title", "body"];
    };
    execute(_id: string, params: {
        path: string;
        type: string;
        title: string;
        description?: string;
        body: string;
        tags?: string[];
        resource?: string;
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
 * Tool: okf_write_batch - Write multiple concepts in one atomic operation
 */
export declare const okfWriteBatchTool: {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            concepts: {
                type: "array";
                items: {
                    type: "object";
                    properties: {
                        path: {
                            type: "string";
                        };
                        type: {
                            type: "string";
                        };
                        title: {
                            type: "string";
                        };
                        description: {
                            type: "string";
                        };
                        body: {
                            type: "string";
                        };
                        tags: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                        };
                    };
                    required: readonly ["path", "type", "title", "body"];
                };
                minItems: number;
                maxItems: number;
            };
        };
        required: readonly ["concepts"];
    };
    readonly parameters: {
        type: "object";
        properties: {
            concepts: {
                type: "array";
                items: {
                    type: "object";
                    properties: {
                        path: {
                            type: "string";
                        };
                        type: {
                            type: "string";
                        };
                        title: {
                            type: "string";
                        };
                        description: {
                            type: "string";
                        };
                        body: {
                            type: "string";
                        };
                        tags: {
                            type: "array";
                            items: {
                                type: "string";
                            };
                        };
                    };
                    required: readonly ["path", "type", "title", "body"];
                };
                minItems: number;
                maxItems: number;
            };
        };
        required: readonly ["concepts"];
    };
    execute(_id: string, params: {
        concepts: Array<{
            path: string;
            type: string;
            title: string;
            description?: string;
            body: string;
            tags?: string[];
            resource?: string;
        }>;
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
    parameters: {
        type: "object";
        properties: {
            directory: {
                type: "string";
                description: string;
            };
            type: {
                type: "string";
                description: string;
            };
        };
    };
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
    parameters: {
        type: "object";
        properties: {
            path: {
                type: "string";
                description: string;
            };
        };
    };
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
//# sourceMappingURL=tools.d.ts.map