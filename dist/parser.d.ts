/**
 * OKF concept parser - handles frontmatter and markdown parsing
 */
import type { Concept, ConceptFrontmatter, ConceptLink } from "./types.js";
/**
 * Parse a concept document from raw markdown text
 */
export declare function parseConcept(filePath: string, conceptId: string, content: string): Concept;
/**
 * Parse YAML frontmatter from markdown content
 * Returns frontmatter object and remaining body
 */
export declare function parseFrontmatter(content: string): {
    frontmatter: ConceptFrontmatter;
    body: string;
};
/**
 * Extract markdown links from body content
 * Handles both absolute (bundle-relative) and relative links
 */
export declare function extractLinks(body: string, currentConceptId: string): ConceptLink[];
/**
 * Derive a title from a filename if not provided in frontmatter
 */
export declare function deriveTitleFromFilename(filePath: string): string;
//# sourceMappingURL=parser.d.ts.map