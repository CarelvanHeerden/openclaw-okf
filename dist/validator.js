/**
 * OKF bundle validator - validates conformance to OKF v0.1 specification
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./parser.js";
/**
 * Reserved filenames per OKF spec §3.1
 */
const RESERVED_FILENAMES = ["index.md", "log.md"];
/**
 * Validate an OKF bundle for conformance to v0.1 spec
 */
export async function validateBundle(bundlePath, index, specificPath) {
    const errors = [];
    const warnings = [];
    if (specificPath) {
        // Validate a specific concept
        const concept = index.concepts.get(specificPath);
        if (!concept) {
            errors.push({
                conceptId: specificPath,
                message: `Concept not found: ${specificPath}`,
                type: "parse-error",
            });
        }
        else {
            await validateConcept(concept.filePath, specificPath, errors, warnings);
        }
    }
    else {
        // Validate entire bundle
        // Check root index.md has okf_version
        await validateRootIndex(bundlePath, errors, warnings);
        // Check that reserved filenames aren't used as concepts
        for (const concept of index.concepts.values()) {
            const filename = concept.id.split("/").pop();
            if (filename === "index" || filename === "log") {
                errors.push({
                    conceptId: concept.id,
                    filePath: concept.filePath,
                    message: `Concept ID uses reserved name: ${filename}`,
                    type: "reserved-filename",
                });
            }
        }
        await validateBundleRecursive(bundlePath, bundlePath, index, errors, warnings);
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
/**
 * Recursively validate a directory
 */
async function validateBundleRecursive(bundleRoot, currentDir, index, errors, warnings) {
    let entries;
    try {
        const items = await readdir(currentDir, { withFileTypes: true });
        entries = items.map((item) => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            isFile: item.isFile(),
        }));
    }
    catch (error) {
        return;
    }
    for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory) {
            await validateBundleRecursive(bundleRoot, fullPath, index, errors, warnings);
        }
        else if (entry.isFile && entry.name.endsWith(".md")) {
            // Check for reserved filename misuse
            if (RESERVED_FILENAMES.includes(entry.name)) {
                // Reserved files should not have frontmatter (except okf_version in root index.md)
                await validateReservedFile(fullPath, entry.name, warnings);
            }
            else {
                // Regular concept file
                const relativePath = fullPath
                    .substring(bundleRoot.length + 1)
                    .replace(/\.md$/, "");
                await validateConcept(fullPath, relativePath, errors, warnings);
            }
        }
    }
    // Validate cross-links
    for (const concept of index.concepts.values()) {
        for (const linkedId of concept.linksTo) {
            if (!index.concepts.has(linkedId)) {
                warnings.push({
                    conceptId: concept.id,
                    filePath: concept.filePath,
                    message: `Broken link to: ${linkedId}`,
                    type: "broken-link",
                });
            }
        }
    }
}
/**
 * Validate a single concept file
 */
async function validateConcept(filePath, conceptId, errors, warnings) {
    let content;
    try {
        content = await readFile(filePath, "utf-8");
    }
    catch (error) {
        errors.push({
            filePath,
            conceptId,
            message: `Failed to read file: ${error}`,
            type: "parse-error",
        });
        return;
    }
    // Parse frontmatter
    try {
        const { frontmatter } = parseFrontmatter(content);
        // Required: type field
        if (!frontmatter.type || typeof frontmatter.type !== "string") {
            errors.push({
                filePath,
                conceptId,
                message: "Missing required field: type",
                type: "missing-type",
            });
        }
        // Recommended fields
        if (!frontmatter.title) {
            warnings.push({
                filePath,
                conceptId,
                message: "Missing recommended field: title",
                type: "missing-recommended",
            });
        }
        if (!frontmatter.description) {
            warnings.push({
                filePath,
                conceptId,
                message: "Missing recommended field: description",
                type: "missing-recommended",
            });
        }
        // Validate timestamp format if present
        if (frontmatter.timestamp && typeof frontmatter.timestamp === "string") {
            const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
            if (!iso8601Regex.test(frontmatter.timestamp)) {
                warnings.push({
                    filePath,
                    conceptId,
                    message: `Invalid ISO 8601 timestamp: ${frontmatter.timestamp}`,
                    type: "invalid-timestamp",
                });
            }
        }
    }
    catch (error) {
        errors.push({
            filePath,
            conceptId,
            message: `Invalid frontmatter: ${error}`,
            type: "invalid-frontmatter",
        });
    }
}
/**
 * Validate root index.md has okf_version
 */
async function validateRootIndex(bundlePath, errors, warnings) {
    const rootIndexPath = join(bundlePath, "index.md");
    try {
        const content = await readFile(rootIndexPath, "utf-8");
        if (content.trim().startsWith("---")) {
            try {
                const { frontmatter } = parseFrontmatter(content);
                if (!frontmatter.okf_version) {
                    errors.push({
                        filePath: rootIndexPath,
                        message: "Root index.md must have okf_version field in frontmatter",
                        type: "missing-okf-version",
                    });
                }
            }
            catch (error) {
                // Ignore parse errors, they'll be caught elsewhere
            }
        }
        else {
            errors.push({
                filePath: rootIndexPath,
                message: "Root index.md must have frontmatter with okf_version",
                type: "missing-okf-version",
            });
        }
    }
    catch (error) {
        warnings.push({
            filePath: rootIndexPath,
            message: "Root index.md not found",
            type: "missing-root-index",
        });
    }
}
/**
 * Validate a reserved file (index.md or log.md)
 */
async function validateReservedFile(filePath, filename, warnings) {
    let content;
    try {
        content = await readFile(filePath, "utf-8");
    }
    catch (error) {
        return;
    }
    // Reserved files should not have frontmatter (with exception for okf_version)
    if (content.trim().startsWith("---")) {
        warnings.push({
            filePath,
            message: `Reserved file ${filename} should not contain frontmatter`,
            type: "reserved-filename",
        });
    }
}
//# sourceMappingURL=validator.js.map