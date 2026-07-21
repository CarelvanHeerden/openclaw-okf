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
        // Check root index.md for the optional okf_version declaration
        await validateRootIndex(bundlePath, warnings);
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
        // Validate cross-links once for the whole bundle (broken links are
        // warnings per spec §5.3 — a missing target may be not-yet-written).
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
                // Reserved files should not have frontmatter. Per spec §11, the ONLY
                // exception is the bundle-root index.md, where an okf_version
                // frontmatter block is permitted.
                const isRootIndex = entry.name === "index.md" && currentDir === bundleRoot;
                if (!isRootIndex) {
                    await validateReservedFile(fullPath, entry.name, warnings);
                }
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
 * Validate root index.md. Per OKF spec §11, declaring okf_version in the
 * bundle-root index.md frontmatter is OPTIONAL (MAY), so its absence is a
 * warning at most — never an error. A root index.md without any frontmatter
 * is fully conformant (§6/§9); we only warn when frontmatter exists but
 * omits okf_version, and gently recommend declaring a version otherwise.
 */
async function validateRootIndex(bundlePath, warnings) {
    const rootIndexPath = join(bundlePath, "index.md");
    try {
        const content = await readFile(rootIndexPath, "utf-8");
        if (content.trim().startsWith("---")) {
            let hasOkfVersion = false;
            try {
                const { frontmatter } = parseFrontmatter(content);
                hasOkfVersion = Boolean(frontmatter.okf_version);
            }
            catch {
                // Root index frontmatter has no required fields (only okf_version is
                // permitted), so parse strictness for concept files doesn't apply.
                // Fall back to a direct scan for the okf_version key.
                hasOkfVersion = /^okf_version\s*:/m.test(content);
            }
            if (!hasOkfVersion) {
                warnings.push({
                    filePath: rootIndexPath,
                    message: "Root index.md frontmatter should declare okf_version (e.g., okf_version: \"0.1\")",
                    type: "missing-okf-version",
                });
            }
        }
        else {
            warnings.push({
                filePath: rootIndexPath,
                message: "Consider declaring the OKF version in root index.md frontmatter (okf_version: \"0.1\")",
                type: "missing-okf-version",
            });
        }
    }
    catch {
        warnings.push({
            filePath: rootIndexPath,
            message: "Root index.md not found",
            type: "missing-root-index",
        });
    }
}
/**
 * Validate a non-root reserved file (index.md or log.md).
 * Per spec §6, index files contain no frontmatter; the bundle-root index.md
 * exception is handled by the caller and validateRootIndex.
 */
async function validateReservedFile(filePath, filename, warnings) {
    let content;
    try {
        content = await readFile(filePath, "utf-8");
    }
    catch (error) {
        return;
    }
    if (content.trim().startsWith("---")) {
        warnings.push({
            filePath,
            message: `Reserved file ${filename} should not contain frontmatter (only the bundle-root index.md may declare okf_version)`,
            type: "reserved-file-frontmatter",
        });
    }
}
//# sourceMappingURL=validator.js.map