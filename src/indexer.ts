/**
 * OKF bundle indexer - scans directory tree and builds searchable index
 */

import { readdir, readFile, stat, watch } from "node:fs/promises";
import { join, relative } from "node:path";
import type { BundleIndex, ConceptMeta, OkfConfig } from "./types.js";
import { parseConcept, deriveTitleFromFilename } from "./parser.js";

/**
 * Reserved filenames that are not concept documents
 */
const RESERVED_FILENAMES = ["index.md", "log.md"];

/**
 * Build index from an OKF bundle directory
 */
export async function buildIndex(
  bundlePath: string,
  config: OkfConfig
): Promise<BundleIndex> {
  const concepts = new Map<string, ConceptMeta>();
  const invertedIndex = new Map<string, Set<string>>();
  const errors: string[] = [];
  
  await scanDirectory(bundlePath, bundlePath, concepts, errors);
  
  // Build inverted index for FTS
  for (const [conceptId, meta] of concepts.entries()) {
    const tokens = tokenize(meta.searchText);
    for (const token of tokens) {
      if (!invertedIndex.has(token)) {
        invertedIndex.set(token, new Set());
      }
      invertedIndex.get(token)!.add(conceptId);
    }
  }
  
  // Build link graph (populate linkedFrom)
  for (const [conceptId, meta] of concepts.entries()) {
    for (const linkedId of meta.linksTo) {
      const linkedConcept = concepts.get(linkedId);
      if (linkedConcept) {
        linkedConcept.linkedFrom.push(conceptId);
      }
    }
  }
  
  const index = {
    concepts,
    invertedIndex,
    indexedAt: Date.now(),
    bundlePath,
  };
  
  // Log errors if any
  if (errors.length > 0) {
    console.warn(`OKF index built with ${errors.length} error(s):`, errors.slice(0, 5));
  }
  
  return index;
}

/**
 * Recursively scan a directory for concept files
 */
async function scanDirectory(
  bundleRoot: string,
  currentDir: string,
  concepts: Map<string, ConceptMeta>,
  errors: string[]
): Promise<void> {
  let entries: { name: string; isDirectory: boolean; isFile: boolean }[];
  
  try {
    const items = await readdir(currentDir, { withFileTypes: true });
    entries = items.map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      isFile: item.isFile(),
    }));
  } catch (error) {
    // Directory doesn't exist or not accessible
    return;
  }
  
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    
    if (entry.isDirectory) {
      // Recurse into subdirectories
      await scanDirectory(bundleRoot, fullPath, concepts, errors);
    } else if (entry.isFile && entry.name.endsWith(".md")) {
      // Skip reserved filenames
      if (RESERVED_FILENAMES.includes(entry.name)) {
        continue;
      }
      
      try {
        await indexConcept(bundleRoot, fullPath, concepts);
      } catch (error) {
        // Collect error but don't fail the entire index
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${fullPath}: ${errorMsg}`);
        console.error(`Failed to index ${fullPath}:`, error);
      }
    }
  }
}

/**
 * Index a single concept file
 */
async function indexConcept(
  bundleRoot: string,
  filePath: string,
  concepts: Map<string, ConceptMeta>
): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const stats = await stat(filePath);
  
  // Calculate concept ID (relative path from bundle root without .md)
  const relativePath = relative(bundleRoot, filePath);
  const conceptId = relativePath.replace(/\.md$/, "");
  
  // Parse the concept
  const concept = parseConcept(filePath, conceptId, content);
  
  // Derive title if not in frontmatter
  const title = concept.frontmatter.title || deriveTitleFromFilename(filePath);
  
  // Build search text (title + description + tags + body excerpt)
  const bodyExcerpt = concept.body.substring(0, 500).replace(/[#*`\[\]]/g, "");
  const searchText = [
    title,
    concept.frontmatter.description || "",
    ...(concept.frontmatter.tags || []),
    bodyExcerpt,
  ]
    .join(" ")
    .toLowerCase();
  
  // Create metadata entry
  const meta: ConceptMeta = {
    id: conceptId,
    filePath,
    type: concept.frontmatter.type,
    title,
    description: concept.frontmatter.description,
    resource: concept.frontmatter.resource,
    tags: concept.frontmatter.tags || [],
    timestamp: concept.frontmatter.timestamp,
    linksTo: concept.links.map((link) => link.targetId),
    linkedFrom: [], // Will be populated after full scan
    mtime: stats.mtimeMs,
    searchText,
  };
  
  concepts.set(conceptId, meta);
}

/**
 * Tokenize text for full-text search
 * Simple whitespace + punctuation split, lowercase
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_.,;:!?()\[\]{}'"]+/)
    .filter((token) => token.length > 0);
}

/**
 * Full-text search using inverted index
 * Returns concept IDs with TF-IDF-like scoring
 */
export function search(
  index: BundleIndex,
  query: string,
  typeFilter?: string,
  tagsFilter?: string[]
): Array<{ conceptId: string; score: number; matchedTokens: string[] }> {
  const queryTokens = tokenize(query);
  const results = new Map<string, { score: number; matchedTokens: Set<string> }>();
  
  // For each query token, find matching concepts
  for (const token of queryTokens) {
    const matchingConceptIds = index.invertedIndex.get(token);
    if (!matchingConceptIds) continue;
    
    // IDF-like scoring: rare tokens are more valuable
    const idf = Math.log(index.concepts.size / matchingConceptIds.size);
    
    for (const conceptId of matchingConceptIds) {
      if (!results.has(conceptId)) {
        results.set(conceptId, { score: 0, matchedTokens: new Set() });
      }
      
      const result = results.get(conceptId)!;
      result.score += idf;
      result.matchedTokens.add(token);
    }
  }
  
  // Normalize scores by query length
  const queryLength = queryTokens.length || 1;
  
  // Apply filters
  let filteredResults = Array.from(results.entries()).map(([conceptId, data]) => ({
    conceptId,
    score: data.score / queryLength,
    matchedTokens: Array.from(data.matchedTokens),
  }));
  
  if (typeFilter) {
    filteredResults = filteredResults.filter((result) => {
      const concept = index.concepts.get(result.conceptId);
      return concept?.type === typeFilter;
    });
  }
  
  if (tagsFilter && tagsFilter.length > 0) {
    filteredResults = filteredResults.filter((result) => {
      const concept = index.concepts.get(result.conceptId);
      if (!concept) return false;
      return tagsFilter.some((tag) => concept.tags.includes(tag));
    });
  }
  
  // Sort by score descending
  filteredResults.sort((a, b) => b.score - a.score);
  
  return filteredResults;
}

/**
 * Watch bundle directory for changes and trigger reindex callback
 */
export async function watchBundle(
  bundlePath: string,
  onChangeCallback: () => void
): Promise<() => void> {
  const abortController = new AbortController();
  
  try {
    const watcher = watch(bundlePath, {
      recursive: true,
      signal: abortController.signal,
    });
    
    (async () => {
      try {
        for await (const event of watcher) {
          // Trigger reindex on any change
          if (event.filename?.endsWith(".md")) {
            onChangeCallback();
          }
        }
      } catch (error) {
        // Watcher aborted or error
        if ((error as { name?: string }).name !== "AbortError") {
          console.error("Bundle watcher error:", error);
        }
      }
    })();
    
    // Return cleanup function
    return () => {
      abortController.abort();
    };
  } catch (error) {
    console.error("Failed to start bundle watcher:", error);
    // Return no-op cleanup if setup failed
    return () => {};
  }
}
