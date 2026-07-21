/**
 * OKF agent tools - allow agents to search, read, write, and validate concepts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, normalize, relative, isAbsolute } from "node:path";
import { Type } from "@sinclair/typebox";
import { search as indexSearch } from "./indexer.js";
import { parseConcept } from "./parser.js";
import { validateBundle } from "./validator.js";
/**
 * Allowlist-based path validation for concept writes.
 * Resolves the path against the bundle root and ensures it stays within bounds.
 * Exported for direct unit testing.
 */
export function validateConceptPath(bundlePath, userPath) {
    // Decode any URL encoding
    let decoded;
    try {
        decoded = decodeURIComponent(userPath);
    }
    catch {
        return { valid: false, error: "Invalid path encoding" };
    }
    // Check for null bytes
    if (decoded.includes("\0")) {
        return { valid: false, error: "Path contains null bytes" };
    }
    // Check for backslashes (Windows path separators)
    if (decoded.includes("\\")) {
        return { valid: false, error: "Use forward slashes only" };
    }
    // Normalize and resolve against bundle root
    const normalized = normalize(decoded);
    const fullPath = resolve(bundlePath, `${normalized}.md`);
    // Ensure the resolved path is still within the bundle
    const rel = relative(bundlePath, fullPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        return { valid: false, error: "Path escapes bundle directory" };
    }
    // Only allow alphanumeric, hyphens, underscores, forward slashes, dots in path segments
    if (!/^[a-zA-Z0-9_\-/.]+$/.test(decoded)) {
        return { valid: false, error: "Path contains invalid characters (use alphanumeric, hyphens, underscores, slashes)" };
    }
    // Check reserved filenames
    const filename = normalized.split("/").pop() || "";
    const reserved = ["index", "log", "index.md", "log.md"];
    if (reserved.includes(filename)) {
        return { valid: false, error: "Cannot use reserved filename (index or log)" };
    }
    return { valid: true };
}
/**
 * Render a string as a safe single-line YAML scalar.
 * Newlines are collapsed (frontmatter values are single-line in OKF), and the
 * value is double-quoted whenever it contains characters that could be
 * misparsed or injected as additional frontmatter.
 * Exported for direct unit testing.
 */
export function yamlScalar(value) {
    const flat = value.replace(/\s*\r?\n\s*/g, " ").trim();
    // Quote when the value could be misparsed by a YAML reader:
    // structural chars, comment markers, quotes, or indicator prefixes.
    if (flat === "" ||
        /[:#\[\]{}"'`,&*!?|>%@\\]/.test(flat) ||
        /^[-?\s]/.test(flat) ||
        /\s$/.test(flat)) {
        return `"${flat.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return flat;
}
/**
 * Sanitize a tag while preserving its content as far as possible.
 * Only characters that cannot be represented in a quoted YAML flow-sequence
 * entry are stripped: brackets (sequence delimiters), quotes, and newlines.
 * Commas are PRESERVED — a tag containing a comma is rendered as a quoted
 * block-list entry (see renderTags) so it round-trips intact.
 * Exported for direct unit testing.
 */
export function sanitizeTag(tag) {
    return tag.replace(/[\[\]\r\n"']/g, " ").replace(/\s+/g, " ").trim();
}
/**
 * Render a `tags:` frontmatter line (or block) from a list of raw tags.
 * Tags are sanitized, then rendered inline (`tags: [a, b]`) for the common
 * case. If ANY tag contains a comma — which the inline flow-sequence parser
 * would mis-split — the whole list is rendered as a quoted block list so
 * every tag round-trips exactly:
 *   tags:
 *     - "a, b"
 *     - c
 * Returns [] when there are no non-empty tags (caller emits no tags line).
 * Exported for direct unit testing.
 */
export function renderTags(tags) {
    const clean = tags.map(sanitizeTag).filter((t) => t.length > 0);
    if (clean.length === 0) {
        return [];
    }
    const needsBlock = clean.some((t) => t.includes(","));
    if (!needsBlock) {
        return [`tags: [${clean.join(", ")}]`];
    }
    return ["tags:", ...clean.map((t) => `  - "${t.replace(/"/g, "")}"`)];
}
/**
 * Validate write params and render the full markdown document.
 * Shared by okf_write and okf_write_batch.
 */
function buildConceptDocument(params, bundlePath) {
    const { path, type, title, description, body, tags, resource } = params;
    if (!path || typeof path !== "string" || path.trim() === "") {
        return { ok: false, error: "'path' field is required and cannot be empty" };
    }
    if (!type || typeof type !== "string" || type.trim() === "") {
        return { ok: false, error: "'type' field is required and cannot be empty" };
    }
    if (!title || typeof title !== "string" || title.trim() === "") {
        return { ok: false, error: "'title' field is required and cannot be empty" };
    }
    if (!body || typeof body !== "string" || body.trim() === "") {
        return { ok: false, error: "'body' field is required and cannot be empty" };
    }
    const pathValidation = validateConceptPath(bundlePath, path);
    if (!pathValidation.valid) {
        return { ok: false, error: pathValidation.error };
    }
    const frontmatterLines = [
        "---",
        `type: ${yamlScalar(type)}`,
        `title: ${yamlScalar(title)}`,
    ];
    if (description) {
        frontmatterLines.push(`description: ${yamlScalar(description)}`);
    }
    if (resource) {
        frontmatterLines.push(`resource: ${yamlScalar(resource)}`);
    }
    if (tags && tags.length > 0) {
        frontmatterLines.push(...renderTags(tags));
    }
    frontmatterLines.push(`timestamp: ${new Date().toISOString()}`);
    frontmatterLines.push("---");
    return {
        ok: true,
        content: [...frontmatterLines, "", body.trim(), ""].join("\n"),
    };
}
/**
 * Tool: okf_search - Search for concepts by text, type, or tags
 */
export const okfSearchTool = {
    name: "okf_search",
    description: "Search the OKF knowledge bundle for concepts matching a query. Use this for reference documentation, playbooks, architecture decisions, and procedures. For facts about people, companies, or recent events, use memory_recall instead. Returns concept summaries with relevance scores.",
    parameters: Type.Object({
        query: Type.String({ description: "Search query text" }),
        type: Type.Optional(Type.String({ description: "Filter by concept type (e.g., 'API Endpoint')" })),
        tags: Type.Optional(Type.Array(Type.String(), {
            description: "Filter by tags (concepts must have at least one matching tag)",
        })),
        limit: Type.Optional(Type.Number({
            description: "Maximum number of results to return",
            default: 10,
            minimum: 1,
            maximum: 50,
        })),
    }),
    async execute(_id, params, context) {
        const { index } = context;
        const { query, type, tags, limit = 10 } = params;
        // Validate query
        if (!query || query.trim() === "") {
            return {
                content: [
                    { type: "text", text: "Error: Search query cannot be empty" },
                ],
            };
        }
        const results = indexSearch(index, query, type, tags);
        const topResults = results.slice(0, limit);
        if (topResults.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No concepts found matching query: "${query}"`,
                    },
                ],
            };
        }
        // Format results
        const lines = [
            `Found ${topResults.length} concept(s) matching "${query}":`,
            "",
        ];
        for (const result of topResults) {
            const concept = index.concepts.get(result.conceptId);
            if (!concept)
                continue;
            lines.push(`**${concept.title}** (\`${concept.id}\`)`);
            lines.push(`  Type: ${concept.type}`);
            if (concept.description) {
                lines.push(`  ${concept.description}`);
            }
            if (concept.tags.length > 0) {
                lines.push(`  Tags: ${concept.tags.join(", ")}`);
            }
            lines.push(`  Relevance: ${result.score.toFixed(2)}`);
            lines.push("");
        }
        lines.push("Use `okf_read` with a concept ID to view the full content.");
        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    },
};
/**
 * Tool: okf_read - Read a concept by ID and optionally follow links
 */
export const okfReadTool = {
    name: "okf_read",
    description: "Read the full content of an OKF concept by its ID. Optionally include linked concepts.",
    parameters: Type.Object({
        conceptId: Type.String({
            description: "Concept ID (e.g., 'tables/users' or 'api/endpoints/auth')",
        }),
        includeLinks: Type.Optional(Type.Boolean({ description: "Include summaries of linked concepts", default: false })),
    }),
    async execute(_id, params, context) {
        const { index, bundlePath } = context;
        const { conceptId, includeLinks = false } = params;
        const concept = index.concepts.get(conceptId);
        if (!concept) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Concept not found: ${conceptId}\n\nUse okf_search or okf_list to find available concepts.`,
                    },
                ],
            };
        }
        // Read full content from file
        let fullContent;
        try {
            fullContent = await readFile(concept.filePath, "utf-8");
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error reading concept file: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
        const lines = [
            `# ${concept.title}`,
            "",
            `**Type:** ${concept.type}`,
            `**ID:** \`${concept.id}\``,
        ];
        if (concept.description) {
            lines.push(`**Description:** ${concept.description}`);
        }
        if (concept.resource) {
            lines.push(`**Resource:** ${concept.resource}`);
        }
        if (concept.tags.length > 0) {
            lines.push(`**Tags:** ${concept.tags.join(", ")}`);
        }
        if (concept.timestamp) {
            lines.push(`**Last Updated:** ${concept.timestamp}`);
        }
        lines.push("");
        lines.push("---");
        lines.push("");
        // Parse to get just the body
        const parsed = parseConcept(concept.filePath, conceptId, fullContent);
        lines.push(parsed.body);
        // Include linked concepts if requested
        if (includeLinks && (concept.linksTo.length > 0 || concept.linkedFrom.length > 0)) {
            lines.push("");
            lines.push("---");
            lines.push("");
            lines.push("## Linked Concepts");
            lines.push("");
            if (concept.linksTo.length > 0) {
                lines.push("**Links to:**");
                for (const linkedId of concept.linksTo) {
                    const linked = index.concepts.get(linkedId);
                    if (linked) {
                        lines.push(`- ${linked.title} (\`${linkedId}\`) - ${linked.type}`);
                    }
                    else {
                        lines.push(`- \`${linkedId}\` (not found)`);
                    }
                }
                lines.push("");
            }
            if (concept.linkedFrom.length > 0) {
                lines.push("**Referenced by:**");
                for (const linkedId of concept.linkedFrom) {
                    const linked = index.concepts.get(linkedId);
                    if (linked) {
                        lines.push(`- ${linked.title} (\`${linkedId}\`) - ${linked.type}`);
                    }
                }
            }
        }
        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    },
};
/**
 * Tool: okf_write - Create or update a concept
 */
export const okfWriteTool = {
    name: "okf_write",
    description: "Create or update an OKF concept document. Use this for adding reference documentation, playbooks, or architectural knowledge. For storing facts about interactions or events, use memory_store instead. The concept will be written to the bundle and indexed. Cross-link related concepts using markdown links in the body (e.g., [users table](/tables/users.md)).",
    parameters: Type.Object({
        path: Type.String({
            description: "Concept path relative to bundle root (e.g., 'tables/users' or 'api/auth'). Do not include .md extension.",
        }),
        type: Type.String({
            description: "Concept type (e.g., 'API Endpoint', 'BigQuery Table', 'Playbook')",
        }),
        title: Type.String({ description: "Human-readable title" }),
        description: Type.Optional(Type.String({ description: "One-line summary" })),
        body: Type.String({
            description: "Markdown body content. Use bundle-relative markdown links (e.g., [title](/dir/concept.md)) to cross-link related concepts.",
        }),
        tags: Type.Optional(Type.Array(Type.String(), { description: "Optional tags" })),
        resource: Type.Optional(Type.String({ description: "Optional canonical resource URI" })),
    }),
    async execute(_id, params, context) {
        const { bundlePath, reindexCallback } = context;
        const doc = buildConceptDocument(params, bundlePath);
        if (!doc.ok) {
            return {
                content: [{ type: "text", text: `Error: ${doc.error}` }],
            };
        }
        const filePath = join(bundlePath, `${params.path}.md`);
        try {
            // Ensure parent directory exists
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, doc.content, "utf-8");
            // Trigger reindex
            reindexCallback();
            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully wrote concept to: ${params.path}.md\n\nConcept ID: \`${params.path}\`\nFile path: ${filePath}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error writing concept: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
            };
        }
    },
};
/**
 * Tool: okf_write_batch - Write multiple concepts in one atomic operation
 */
export const okfWriteBatchTool = {
    name: "okf_write_batch",
    description: "Write multiple OKF concepts in a single atomic operation. Triggers one reindex after all writes complete.",
    parameters: Type.Object({
        concepts: Type.Array(Type.Object({
            path: Type.String(),
            type: Type.String(),
            title: Type.String(),
            description: Type.Optional(Type.String()),
            body: Type.String(),
            tags: Type.Optional(Type.Array(Type.String())),
            resource: Type.Optional(Type.String()),
        }), { minItems: 1, maxItems: 50 }),
    }),
    async execute(_id, params, context) {
        const { bundlePath, reindexCallback } = context;
        const { concepts } = params;
        // Validate top-level input
        if (!Array.isArray(concepts) || concepts.length === 0) {
            return {
                content: [{ type: "text", text: "Error: 'concepts' must be a non-empty array" }],
            };
        }
        const results = [];
        for (const concept of concepts) {
            const doc = buildConceptDocument(concept, bundlePath);
            if (!doc.ok) {
                results.push({ path: concept.path ?? "<missing>", success: false, error: doc.error });
                continue;
            }
            const filePath = join(bundlePath, `${concept.path}.md`);
            try {
                await mkdir(dirname(filePath), { recursive: true });
                await writeFile(filePath, doc.content, "utf-8");
                results.push({ path: concept.path, success: true });
            }
            catch (error) {
                results.push({
                    path: concept.path,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        // Trigger a single reindex after all writes
        reindexCallback();
        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;
        const lines = [
            `Batch write complete: ${successCount} succeeded, ${failCount} failed.`,
            "",
        ];
        for (const r of results) {
            if (r.success) {
                lines.push(`✅ ${r.path}.md`);
            }
            else {
                lines.push(`❌ ${r.path}: ${r.error}`);
            }
        }
        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    },
};
/**
 * Tool: okf_list - List concepts in a directory
 */
export const okfListTool = {
    name: "okf_list",
    description: "List OKF concepts in the bundle. Can filter by directory and/or type.",
    parameters: Type.Object({
        directory: Type.Optional(Type.String({
            description: "Optional directory path to list (e.g., 'tables' or 'api/endpoints')",
        })),
        type: Type.Optional(Type.String({ description: "Optional type filter" })),
    }),
    async execute(_id, params, context) {
        const { index } = context;
        const { directory, type } = params;
        let concepts = Array.from(index.concepts.values());
        // Filter by directory
        if (directory) {
            const prefix = directory.endsWith("/") ? directory : `${directory}/`;
            concepts = concepts.filter((c) => c.id.startsWith(prefix) || c.id === directory);
        }
        // Filter by type
        if (type) {
            concepts = concepts.filter((c) => c.type === type);
        }
        if (concepts.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: directory
                            ? `No concepts found in directory: ${directory}`
                            : "No concepts found in bundle.",
                    },
                ],
            };
        }
        const lines = [
            `Found ${concepts.length} concept(s):`,
            "",
        ];
        // Group by type
        const byType = new Map();
        for (const concept of concepts) {
            if (!byType.has(concept.type)) {
                byType.set(concept.type, []);
            }
            byType.get(concept.type).push(concept);
        }
        for (const [typeName, conceptsOfType] of byType.entries()) {
            lines.push(`## ${typeName} (${conceptsOfType.length})`);
            lines.push("");
            for (const concept of conceptsOfType.sort((a, b) => a.id.localeCompare(b.id))) {
                lines.push(`- **${concept.title}** (\`${concept.id}\`)`);
                if (concept.description) {
                    lines.push(`  ${concept.description}`);
                }
            }
            lines.push("");
        }
        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    },
};
/**
 * Tool: okf_validate - Validate bundle conformance to OKF spec
 */
export const okfValidateTool = {
    name: "okf_validate",
    description: "Validate that the OKF bundle conforms to the OKF v0.1 specification. Reports errors and warnings.",
    parameters: Type.Object({
        path: Type.Optional(Type.String({
            description: "Optional specific concept path to validate (validates entire bundle if omitted)",
        })),
    }),
    async execute(_id, params, context) {
        const { bundlePath, index } = context;
        const { path } = params;
        const result = await validateBundle(bundlePath, index, path);
        const lines = [];
        if (result.valid) {
            lines.push("✅ Bundle validation passed!");
            lines.push("");
            lines.push(`Validated ${index.concepts.size} concept(s).`);
        }
        else {
            lines.push("❌ Bundle validation failed!");
            lines.push("");
        }
        if (result.errors.length > 0) {
            lines.push(`## Errors (${result.errors.length})`);
            lines.push("");
            for (const error of result.errors) {
                lines.push(`- **${error.type}**: ${error.message}`);
                if (error.conceptId) {
                    lines.push(`  Concept: \`${error.conceptId}\``);
                }
                if (error.filePath) {
                    lines.push(`  File: ${error.filePath}`);
                }
            }
            lines.push("");
        }
        if (result.warnings.length > 0) {
            lines.push(`## Warnings (${result.warnings.length})`);
            lines.push("");
            for (const warning of result.warnings) {
                lines.push(`- **${warning.type}**: ${warning.message}`);
                if (warning.conceptId) {
                    lines.push(`  Concept: \`${warning.conceptId}\``);
                }
            }
            lines.push("");
        }
        if (result.valid && result.warnings.length === 0) {
            lines.push("");
            lines.push("No issues found. Bundle is fully OKF v0.1 compliant.");
        }
        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    },
};
//# sourceMappingURL=tools.js.map