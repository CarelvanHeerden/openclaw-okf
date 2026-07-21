/**
 * OKF concept parser - handles frontmatter and markdown parsing
 */
/**
 * Parse a concept document from raw markdown text
 */
export function parseConcept(filePath, conceptId, content) {
    const { frontmatter, body } = parseFrontmatter(content);
    const links = extractLinks(body, conceptId);
    return {
        id: conceptId,
        filePath,
        frontmatter,
        body,
        links,
    };
}
/**
 * Parse YAML frontmatter from markdown content
 * Returns frontmatter object and remaining body
 */
export function parseFrontmatter(content) {
    const lines = content.split("\n");
    // Check for frontmatter delimiter at start
    if (lines[0]?.trim() !== "---") {
        throw new Error("Missing frontmatter: document must start with ---");
    }
    // Find closing delimiter
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === "---") {
            endIndex = i;
            break;
        }
    }
    if (endIndex === -1) {
        throw new Error("Missing frontmatter closing delimiter ---");
    }
    // Extract frontmatter YAML
    const yamlLines = lines.slice(1, endIndex);
    const yamlText = yamlLines.join("\n");
    // Parse YAML (simple key: value parser)
    const frontmatter = parseSimpleYaml(yamlText);
    // Validate required fields
    if (!frontmatter.type || typeof frontmatter.type !== "string") {
        throw new Error("Frontmatter missing required field: type");
    }
    // Extract body (everything after closing ---)
    const body = lines.slice(endIndex + 1).join("\n").trim();
    return { frontmatter, body };
}
/**
 * Simple YAML parser for OKF frontmatter
 * Handles: key: value, key: [item1, item2], and nested values
 */
function parseSimpleYaml(yamlText) {
    const result = { type: "" };
    const lines = yamlText.split("\n");
    let currentKey = null;
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        // Match key: value or key: [array]
        const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
        if (match) {
            const [, key, value] = match;
            currentKey = key;
            if (value.trim() === "") {
                // Empty value
                result[key] = null;
            }
            else if (value.trim().startsWith("[")) {
                // Array value
                const arrayMatch = value.match(/^\[(.*)\]$/);
                if (arrayMatch) {
                    const items = arrayMatch[1]
                        .split(",")
                        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
                        .filter((item) => item.length > 0);
                    result[key] = items;
                }
                else {
                    result[key] = value.trim();
                }
            }
            else {
                // Scalar value - remove surrounding quotes if present
                let cleanValue = value.trim();
                // Only strip quotes if they're at both start and end
                if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
                    (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
                    cleanValue = cleanValue.slice(1, -1);
                }
                else {
                    // Unquoted scalar: per YAML, " #" starts an inline comment
                    const commentIndex = cleanValue.search(/\s#/);
                    if (commentIndex !== -1) {
                        cleanValue = cleanValue.slice(0, commentIndex).trim();
                    }
                }
                result[key] = cleanValue;
            }
        }
        else if (currentKey && trimmed.startsWith("- ")) {
            // Array item continuation
            const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
            if (Array.isArray(result[currentKey])) {
                result[currentKey].push(item);
            }
            else {
                result[currentKey] = [item];
            }
        }
    }
    return result;
}
/**
 * Extract markdown links from body content
 * Handles both absolute (bundle-relative) and relative links
 */
export function extractLinks(body, currentConceptId) {
    const links = [];
    // Match markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(body)) !== null) {
        const text = match[1];
        let url = match[2];
        // Skip external URLs (http/https)
        if (url.startsWith("http://") || url.startsWith("https://")) {
            continue;
        }
        // Skip anchors and special URLs (mailto:, tel:, protocol-based)
        if (url.startsWith("#") || url.includes("://") || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
            continue;
        }
        // Strip anchor fragments so [x](/tables/users.md#schema) resolves to tables/users
        const hashIndex = url.indexOf("#");
        if (hashIndex !== -1) {
            url = url.slice(0, hashIndex);
        }
        if (url === "") {
            continue;
        }
        // Determine if absolute (bundle-relative) or relative
        const isAbsolute = url.startsWith("/");
        // Resolve to concept ID
        let targetId;
        if (isAbsolute) {
            // Absolute: remove leading slash and .md extension
            targetId = url.slice(1).replace(/\.md$/, "");
        }
        else {
            // Relative: resolve against current concept's directory
            const currentDir = currentConceptId.includes("/")
                ? currentConceptId.substring(0, currentConceptId.lastIndexOf("/"))
                : "";
            // Simple path resolution (doesn't handle .. fully, but good enough)
            const parts = url.split("/");
            const dirParts = currentDir ? currentDir.split("/") : [];
            for (const part of parts) {
                if (part === "..") {
                    dirParts.pop();
                }
                else if (part !== "." && part !== "") {
                    dirParts.push(part);
                }
            }
            targetId = dirParts.join("/").replace(/\.md$/, "");
        }
        links.push({ text, targetId, isAbsolute });
    }
    return links;
}
/**
 * Derive a title from a filename if not provided in frontmatter
 */
export function deriveTitleFromFilename(filePath) {
    const filename = filePath.split("/").pop() || filePath;
    const nameWithoutExt = filename.replace(/\.md$/, "");
    // Convert snake_case or kebab-case to Title Case
    return nameWithoutExt
        .split(/[-_]/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
//# sourceMappingURL=parser.js.map