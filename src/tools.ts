/**
 * OKF agent tools - allow agents to search, read, write, and validate concepts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, normalize, relative, isAbsolute } from "node:path";
import type { BundleIndex, Concept, OkfConfig, SearchResult } from "./types.js";
import { search as indexSearch } from "./indexer.js";
import { parseConcept } from "./parser.js";
import { validateBundle } from "./validator.js";

/**
 * Allowlist-based path validation for concept writes.
 * Resolves the path against the bundle root and ensures it stays within bounds.
 */
function validateConceptPath(
  bundlePath: string,
  userPath: string
): { valid: boolean; error?: string } {
  // Decode any URL encoding
  let decoded: string;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
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
 * Tool: okf_search - Search for concepts by text, type, or tags
 */
export const okfSearchTool = {
  name: "okf_search",
  description:
    "Search the OKF knowledge bundle for concepts matching a query. Use this for reference documentation, playbooks, architecture decisions, and procedures. For facts about people, companies, or recent events, use memory_recall instead. Returns concept summaries with relevance scores.",
  parameters: {
    type: "object" as const,
    properties: {
      query: { type: "string" as const, description: "Search query text" },
      type: { type: "string" as const, description: "Filter by concept type (e.g., 'API Endpoint')" },
      tags: { type: "array" as const, items: { type: "string" as const }, description: "Filter by tags (concepts must have at least one matching tag)" },
      limit: { type: "number" as const, description: "Maximum number of results to return", default: 10, minimum: 1, maximum: 50 },
    },
    required: ["query"] as const,
  },
  async execute(
    _id: string,
    params: {
      query: string;
      type?: string;
      tags?: string[];
      limit?: number;
    },
    context: { index: BundleIndex }
  ) {
    const { index } = context;
    const { query, type, tags, limit = 10 } = params;
    
    // Validate query
    if (!query || query.trim() === "") {
      return {
        content: [
          { type: "text" as const, text: "Error: Search query cannot be empty" },
        ],
      };
    }
    
    const results = indexSearch(index, query, type, tags);
    const topResults = results.slice(0, limit);
    
    if (topResults.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No concepts found matching query: "${query}"`,
          },
        ],
      };
    }
    
    // Format results
    const lines: string[] = [
      `Found ${topResults.length} concept(s) matching "${query}":`,
      "",
    ];
    
    for (const result of topResults) {
      const concept = index.concepts.get(result.conceptId);
      if (!concept) continue;
      
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
    
    lines.push(
      "Use `okf_read` with a concept ID to view the full content."
    );
    
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};

/**
 * Tool: okf_read - Read a concept by ID and optionally follow links
 */
export const okfReadTool = {
  name: "okf_read",
  description:
    "Read the full content of an OKF concept by its ID. Optionally include linked concepts.",
  parameters: {
    type: "object" as const,
    properties: {
      conceptId: { type: "string" as const, description: "Concept ID (e.g., 'tables/users' or 'api/endpoints/auth')" },
      includeLinks: { type: "boolean" as const, description: "Include summaries of linked concepts", default: false },
    },
    required: ["conceptId"] as const,
  },
  async execute(
    _id: string,
    params: { conceptId: string; includeLinks?: boolean },
    context: { index: BundleIndex; bundlePath: string }
  ) {
    const { index, bundlePath } = context;
    const { conceptId, includeLinks = false } = params;
    
    const concept = index.concepts.get(conceptId);
    
    if (!concept) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Concept not found: ${conceptId}\n\nUse okf_search or okf_list to find available concepts.`,
          },
        ],
      };
    }
    
    // Read full content from file
    let fullContent: string;
    try {
      fullContent = await readFile(concept.filePath, "utf-8");
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading concept file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
    
    const lines: string[] = [
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
          } else {
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
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};

/**
 * Tool: okf_write - Create or update a concept
 */
export const okfWriteTool = {
  name: "okf_write",
  description:
    "Create or update an OKF concept document. Use this for adding reference documentation, playbooks, or architectural knowledge. For storing facts about interactions or events, use memory_store instead. The concept will be written to the bundle and indexed.",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string" as const, description: "Concept path relative to bundle root (e.g., 'tables/users' or 'api/auth'). Do not include .md extension." },
      type: { type: "string" as const, description: "Concept type (e.g., 'API Endpoint', 'BigQuery Table', 'Playbook')" },
      title: { type: "string" as const, description: "Human-readable title" },
      description: { type: "string" as const, description: "One-line summary" },
      body: { type: "string" as const, description: "Markdown body content" },
      tags: { type: "array" as const, items: { type: "string" as const }, description: "Optional tags" },
      resource: { type: "string" as const, description: "Optional canonical resource URI" },
    },
    required: ["path", "type", "title", "body"] as const,
  },
  async execute(
    _id: string,
    params: {
      path: string;
      type: string;
      title: string;
      description?: string;
      body: string;
      tags?: string[];
      resource?: string;
    },
    context: { bundlePath: string; reindexCallback: () => void }
  ) {
    const { bundlePath, reindexCallback } = context;
    const { path, type, title, description, body, tags, resource } = params;
    
    // Validate required fields
    if (!path || typeof path !== 'string' || path.trim() === "") {
      return {
        content: [{ type: "text" as const, text: "Error: 'path' field is required and cannot be empty" }],
      };
    }
    if (!type || typeof type !== 'string' || type.trim() === "") {
      return {
        content: [{ type: "text" as const, text: "Error: 'type' field is required and cannot be empty" }],
      };
    }
    if (!title || typeof title !== 'string' || title.trim() === "") {
      return {
        content: [{ type: "text" as const, text: "Error: 'title' field is required and cannot be empty" }],
      };
    }
    if (!body || typeof body !== 'string' || body.trim() === "") {
      return {
        content: [{ type: "text" as const, text: "Error: 'body' field is required and cannot be empty" }],
      };
    }
    
    // Allowlist-based path validation
    const pathValidation = validateConceptPath(bundlePath, path);
    if (!pathValidation.valid) {
      return {
        content: [{ type: "text" as const, text: `Error: ${pathValidation.error}` }],
      };
    }
    
    // Construct frontmatter
    const frontmatterLines: string[] = ["---", `type: ${type}`, `title: ${title}`];
    
    if (description) {
      frontmatterLines.push(`description: ${description}`);
    }
    
    if (resource) {
      frontmatterLines.push(`resource: ${resource}`);
    }
    
    if (tags && tags.length > 0) {
      frontmatterLines.push(`tags: [${tags.join(", ")}]`);
    }
    
    frontmatterLines.push(`timestamp: ${new Date().toISOString()}`);
    frontmatterLines.push("---");
    
    const fullContent = [
      ...frontmatterLines,
      "",
      body.trim(),
      "",
    ].join("\n");
    
    // Write to file
    const filePath = join(bundlePath, `${path}.md`);
    
    try {
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });
      
      await writeFile(filePath, fullContent, "utf-8");
      
      // Trigger reindex
      reindexCallback();
      
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully wrote concept to: ${path}.md\n\nConcept ID: \`${path}\`\nFile path: ${filePath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
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
  description:
    "Write multiple OKF concepts in a single atomic operation. Triggers one reindex after all writes complete.",
  inputSchema: {
    type: "object" as const,
    properties: {
      concepts: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            path: { type: "string" as const },
            type: { type: "string" as const },
            title: { type: "string" as const },
            description: { type: "string" as const },
            body: { type: "string" as const },
            tags: { type: "array" as const, items: { type: "string" as const } },
          },
          required: ["path", "type", "title", "body"] as const,
        },
        minItems: 1,
        maxItems: 50,
      },
    },
    required: ["concepts"] as const,
  },
  // Expose parameters alias for consistency with other tools
  get parameters() {
    return this.inputSchema;
  },
  async execute(
    _id: string,
    params: {
      concepts: Array<{
        path: string;
        type: string;
        title: string;
        description?: string;
        body: string;
        tags?: string[];
        resource?: string;
      }>;
    },
    context: { bundlePath: string; reindexCallback: () => void }
  ) {
    const { bundlePath, reindexCallback } = context;
    const { concepts } = params;

    // Validate top-level input
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "Error: 'concepts' must be a non-empty array" }],
      };
    }

    const results: Array<{ path: string; success: boolean; error?: string }> = [];

    for (const concept of concepts) {
      const { path, type, title, description, body, tags, resource } = concept;

      // Validate required fields per concept
      if (!path || typeof path !== "string" || path.trim() === "") {
        results.push({ path: path ?? "<missing>", success: false, error: "'path' is required and cannot be empty" });
        continue;
      }
      if (!type || typeof type !== "string" || type.trim() === "") {
        results.push({ path, success: false, error: "'type' is required and cannot be empty" });
        continue;
      }
      if (!title || typeof title !== "string" || title.trim() === "") {
        results.push({ path, success: false, error: "'title' is required and cannot be empty" });
        continue;
      }
      if (!body || typeof body !== "string" || body.trim() === "") {
        results.push({ path, success: false, error: "'body' is required and cannot be empty" });
        continue;
      }

      // Allowlist-based path validation
      const pathValidation = validateConceptPath(bundlePath, path);
      if (!pathValidation.valid) {
        results.push({ path, success: false, error: pathValidation.error });
        continue;
      }

      // Construct frontmatter
      const frontmatterLines: string[] = ["---", `type: ${type}`, `title: ${title}`];

      if (description) {
        frontmatterLines.push(`description: ${description}`);
      }

      if (resource) {
        frontmatterLines.push(`resource: ${resource}`);
      }

      if (tags && tags.length > 0) {
        frontmatterLines.push(`tags: [${tags.join(", ")}]`);
      }

      frontmatterLines.push(`timestamp: ${new Date().toISOString()}`);
      frontmatterLines.push("---");

      const fullContent = [
        ...frontmatterLines,
        "",
        body.trim(),
        "",
      ].join("\n");

      const filePath = join(bundlePath, `${path}.md`);

      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, fullContent, "utf-8");
        results.push({ path, success: true });
      } catch (error) {
        results.push({
          path,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Trigger a single reindex after all writes
    reindexCallback();

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    const lines: string[] = [
      `Batch write complete: ${successCount} succeeded, ${failCount} failed.`,
      "",
    ];

    for (const r of results) {
      if (r.success) {
        lines.push(`✅ ${r.path}.md`);
      } else {
        lines.push(`❌ ${r.path}: ${r.error}`);
      }
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};

/**
 * Tool: okf_list - List concepts in a directory
 */
export const okfListTool = {
  name: "okf_list",
  description:
    "List OKF concepts in the bundle. Can filter by directory and/or type.",
  parameters: {
    type: "object" as const,
    properties: {
      directory: { type: "string" as const, description: "Optional directory path to list (e.g., 'tables' or 'api/endpoints')" },
      type: { type: "string" as const, description: "Optional type filter" },
    },
  },
  async execute(
    _id: string,
    params: { directory?: string; type?: string },
    context: { index: BundleIndex }
  ) {
    const { index } = context;
    const { directory, type } = params;
    
    let concepts = Array.from(index.concepts.values());
    
    // Filter by directory
    if (directory) {
      const prefix = directory.endsWith("/") ? directory : `${directory}/`;
      concepts = concepts.filter(
        (c) => c.id.startsWith(prefix) || c.id === directory
      );
    }
    
    // Filter by type
    if (type) {
      concepts = concepts.filter((c) => c.type === type);
    }
    
    if (concepts.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: directory
              ? `No concepts found in directory: ${directory}`
              : "No concepts found in bundle.",
          },
        ],
      };
    }
    
    const lines: string[] = [
      `Found ${concepts.length} concept(s):`,
      "",
    ];
    
    // Group by type
    const byType = new Map<string, typeof concepts>();
    for (const concept of concepts) {
      if (!byType.has(concept.type)) {
        byType.set(concept.type, []);
      }
      byType.get(concept.type)!.push(concept);
    }
    
    for (const [typeName, conceptsOfType] of byType.entries()) {
      lines.push(`## ${typeName} (${conceptsOfType.length})`);
      lines.push("");
      
      for (const concept of conceptsOfType.sort((a, b) =>
        a.id.localeCompare(b.id)
      )) {
        lines.push(`- **${concept.title}** (\`${concept.id}\`)`);
        if (concept.description) {
          lines.push(`  ${concept.description}`);
        }
      }
      
      lines.push("");
    }
    
    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};

/**
 * Tool: okf_validate - Validate bundle conformance to OKF spec
 */
export const okfValidateTool = {
  name: "okf_validate",
  description:
    "Validate that the OKF bundle conforms to the OKF v0.1 specification. Reports errors and warnings.",
  parameters: {
    type: "object" as const,
    properties: {
      path: { type: "string" as const, description: "Optional specific concept path to validate (validates entire bundle if omitted)" },
    },
  },
  async execute(
    _id: string,
    params: { path?: string },
    context: { bundlePath: string; index: BundleIndex }
  ) {
    const { bundlePath, index } = context;
    const { path } = params;
    
    const result = await validateBundle(bundlePath, index, path);
    
    const lines: string[] = [];
    
    if (result.valid) {
      lines.push("✅ Bundle validation passed!");
      lines.push("");
      lines.push(`Validated ${index.concepts.size} concept(s).`);
    } else {
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
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};
