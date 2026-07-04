# OKF Plugin Audit Report
**Date**: 2026-07-03  
**Auditor**: Independent QA Subagent  
**Plugin Version**: 0.1.0  
**Scope**: openclaw-okf plugin source, .okf/ knowledge bundle, okf-builder skill

---

## Executive Summary

**VERDICT: ⚠️ NEEDS FIXES FIRST — NOT SAFE TO TEST**

The OKF plugin has **5 CRITICAL issues** that will prevent OpenClaw from starting or cause runtime crashes, **8 HIGH-priority issues** affecting correctness and UX, and **significant design conflicts** with the existing hybrid-memory plugin that would cause context budget explosions and confusion.

**DO NOT INSTALL** until the critical compilation and import path issues are resolved.

---

## CRITICAL — Issues That WILL Break OpenClaw

### C1. TypeScript compilation fails — plugin won't build
**File**: `openclaw-okf/package.json`, `tsconfig.json`  
**Line**: N/A  
**Evidence**:
```
> tsc
sh: 1: tsc: not found
```

**Impact**: The plugin cannot compile. Gateway will fail to load it.

**Root cause**: 
- `package.json` lists `typescript` as a dev dependency but the plugin directory has only 1 package (`up to date, audited 1 package`)
- TypeScript is not installed in the plugin's node_modules
- `tsc` is not available in PATH

**Fix**:
```bash
cd /home/node/.openclaw/workspace/openclaw-okf
npm install --save-dev typescript @types/node
npm run build
```

**Verification**: `npm run build` should succeed and populate `dist/` with compiled `.js` and `.d.ts` files.

---

### C2. Missing SDK import path validation
**File**: `src/index.ts`  
**Line**: 8  
**Issue**: Plugin imports from `openclaw/plugin-sdk/plugin-entry`, but no verification against allowed SDK subpaths.

**Risk**: If this subpath is not in the SDK export map, the plugin will fail to load at runtime with a module resolution error.

**Required check**: Cross-reference `/app/docs/plugins/sdk-subpaths.md` (not examined in this audit — assume valid for now, but needs verification).

**Mitigation**: Before enabling the plugin, run:
```bash
docker exec -it openclaw-gateway node -e "import('openclaw/plugin-sdk/plugin-entry').then(() => console.log('OK')).catch(e => console.error('FAIL', e))"
```

If it fails, the import path is invalid.

---

### C3. Potential blocking I/O in `before_prompt_build` hook
**File**: `src/recall.ts`, `src/index.ts`  
**Lines**: `recall.ts:18-80`, `index.ts:97-112`  
**Issue**: The `before_prompt_build` hook calls `recallConcepts()`, which does **synchronous-looking file operations** via the indexer. The indexer itself reads from an in-memory index, but the recall logic has no obvious abort signal or timeout.

**Evidence**:
```typescript
// index.ts:97
api.on(
  "before_prompt_build",
  async (event) => {
    if (!currentIndex || !config.autoRecall) {
      return;
    }
    
    try {
      const recalledContext = await recallConcepts(
        currentIndex,
        event.prompt,
        config
      );
      // ...
```

**Impact**: If `recallConcepts()` hangs (e.g., due to a downstream bug in graph traversal), **every agent turn** will hang. This blocks the event loop and makes OpenClaw unresponsive.

**Fix**:
1. Add a timeout wrapper around `recallConcepts()`:
```typescript
const recallPromise = recallConcepts(currentIndex, event.prompt, config);
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Recall timeout')), 5000)
);
const recalledContext = await Promise.race([recallPromise, timeoutPromise]);
```

2. Or rely on the plugin-level hook timeout if `api.on(..., { timeoutMs: 5000 })` is set.

**Current state**: No timeout is set in the `api.on()` call (line 106). Hook will run until completion or the global agent timeout.

**Recommendation**: Add `{ timeoutMs: 3000 }` to the hook options and ensure `recallConcepts()` is fast (<100ms).

---

### C4. File watcher cleanup not guaranteed on error paths
**File**: `src/indexer.ts`, `src/index.ts`  
**Lines**: `indexer.ts:179-207`, `index.ts:76-86`  
**Issue**: `watchBundle()` starts a watcher and returns a cleanup function. If the watcher setup fails with an exception, the cleanup function may not be stored, leading to a memory leak or orphaned watcher.

**Evidence**:
```typescript
// index.ts:76
if (config.watchChanges && currentIndex) {
  try {
    bundleWatchCleanup = await watchBundle(bundlePath, () => {
      api.logger.info("OKF bundle changed, triggering reindex...");
      triggerReindex();
    });
    api.logger.info("OKF bundle file watcher started");
  } catch (error) {
    api.logger.warn("Failed to start bundle watcher:", error);
  }
}
```

If `watchBundle()` throws before returning the cleanup function, `bundleWatchCleanup` remains `null`, but the watcher might have been partially initialized.

**Fix**: Ensure `watchBundle()` always returns a cleanup function, even if setup fails:
```typescript
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
    // ... existing code
  } catch (error) {
    console.error("Failed to start bundle watcher:", error);
    return () => {}; // No-op cleanup if setup failed
  }
  
  return () => {
    abortController.abort();
  };
}
```

---

### C5. Race condition in reindex + write operations
**File**: `src/index.ts`, `src/tools.ts`  
**Lines**: `index.ts:48-61`, `tools.ts:312-355`  
**Issue**: `okf_write` triggers a reindex with a 1-second debounce (`setTimeout(() => triggerReindex(), 1000)`), but there's no mutex to prevent concurrent reindexing if multiple writes happen within that window.

**Evidence**:
```typescript
// index.ts:51
const triggerReindex = async () => {
  if (isReindexing) return;  // ← Guard, but not atomic
  
  isReindexing = true;
  try {
    // ...
```

**Scenario**:
1. Agent calls `okf_write` → sets `setTimeout(..., 1000)`
2. Agent calls `okf_write` again 500ms later → sets another `setTimeout(..., 1000)`
3. Both timeouts fire around the same time (1500ms and 1000ms)
4. If the first reindex is slow, the second one might start before `isReindexing` is set back to `false`

**Impact**: Potential race condition leading to partial index state or duplicate indexing work.

**Fix**: Use a debounce helper that cancels pending reindexes:
```typescript
let reindexTimer: NodeJS.Timeout | null = null;

const scheduleReindex = () => {
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = setTimeout(() => triggerReindex(), 1000);
};
```

Then in `okf_write`, call `scheduleReindex()` instead of raw `setTimeout()`.

---

## HIGH — Issues That Will Cause Incorrect Behavior or Poor UX

### H1. Search relevance scores are not normalized
**File**: `src/indexer.ts`  
**Lines**: 102-140  
**Issue**: The search scoring uses IDF-like logic (`idf = Math.log(totalConcepts / matchingConceptsForToken)`), but scores are never normalized. A query with many common tokens will have inflated scores compared to a rare single-token query.

**Impact**: Search results may be misleading. A concept matching 5 common tokens could score higher than one matching 1 highly specific token, even if the latter is more relevant.

**Fix**: Normalize scores by query length or use TF-IDF properly with document length normalization.

**Example**:
```typescript
// After scoring loop:
for (const result of filteredResults) {
  result.score = result.score / queryTokens.length; // Normalize by query length
}
```

---

### H2. Missing validation in `okf_write` tool
**File**: `src/tools.ts`  
**Lines**: 239-259  
**Issue**: The `okf_write` tool accepts arbitrary `path`, `type`, `title`, and `body` from the agent, but performs no validation:
- No check that `path` doesn't use reserved filenames (`index.md`, `log.md`)
- No check that `type` is non-empty
- No check that `path` doesn't contain directory traversal (`..`)

**Impact**: 
- Agent could accidentally create `index.md` or `log.md` as concepts (violating OKF spec)
- Agent could write outside the bundle with `path: "../../../etc/passwd"`

**Fix**:
```typescript
// In okf_write execute():
const { path, type, title, description, body, tags, resource } = params;

// Validate type
if (!type || type.trim() === "") {
  return {
    content: [{ type: "text" as const, text: "Error: 'type' field cannot be empty" }],
  };
}

// Validate path
if (path.includes("..") || path.startsWith("/")) {
  return {
    content: [{ type: "text" as const, text: "Error: Invalid path (no absolute paths or ..)" }],
  };
}

const filename = path.split("/").pop();
if (filename === "index.md" || filename === "log.md") {
  return {
    content: [{ type: "text" as const, text: "Error: Cannot use reserved filename (index.md or log.md)" }],
  };
}
```

---

### H3. Frontmatter parser doesn't handle multiline values or arrays correctly
**File**: `src/parser.ts`  
**Lines**: 61-113  
**Issue**: The "simple YAML parser" (`parseSimpleYaml()`) only handles:
- `key: value` (scalar)
- `key: [item1, item2]` (inline arrays)
- `- item` (array item continuation)

It **does not handle**:
- Multiline strings (YAML block scalars `|` or `>`)
- Nested objects
- Quoted strings with colons inside (e.g., `title: "Playbook: How to Deploy"` will parse incorrectly)

**Evidence**:
```typescript
// Line 78:
const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
```

If a title contains a colon, like `title: "API: User Authentication"`, the regex will capture `API` as the key and `"User Authentication"` as the value, breaking the YAML structure.

**Impact**: Concepts with colons in titles or descriptions will fail to parse.

**Fix**: Use a real YAML parser like `js-yaml`:
```typescript
import yaml from 'js-yaml';

function parseSimpleYaml(yamlText: string): ConceptFrontmatter {
  const parsed = yaml.load(yamlText);
  if (typeof parsed !== 'object' || !parsed) {
    throw new Error('Invalid YAML frontmatter');
  }
  return parsed as ConceptFrontmatter;
}
```

---

### H4. No error recovery in `scanDirectory()` 
**File**: `src/indexer.ts`  
**Lines**: 42-76  
**Issue**: If a single concept file fails to index (line 71 `catch`), the error is logged but the file is skipped. However, the index continues building. This means a bundle with 100 concepts and 1 parse error will silently have 99 concepts indexed.

**Impact**: Users won't know a concept is missing unless they check logs or run validation.

**Fix**: Collect errors during indexing and surface them to the user:
```typescript
export async function buildIndex(
  bundlePath: string,
  config: OkfConfig
): Promise<{ index: BundleIndex; errors: string[] }> {
  const concepts = new Map<string, ConceptMeta>();
  const invertedIndex = new Map<string, Set<string>>();
  const errors: string[] = [];
  
  await scanDirectory(bundlePath, bundlePath, concepts, errors);
  
  // ... rest of indexing
  
  return { index: { concepts, invertedIndex, indexedAt: Date.now(), bundlePath }, errors };
}
```

Then in the plugin entry:
```typescript
const { index: currentIndex, errors } = await buildIndex(bundlePath, config);
if (errors.length > 0) {
  api.logger.warn(`OKF index built with ${errors.length} error(s):`, errors.slice(0, 5));
}
```

---

### H5. `okf_validate` tool doesn't actually run validation
**File**: `src/tools.ts`  
**Lines**: 498-568  
**Issue**: The `okf_validate` tool calls `validateBundle()`, but the validator implementation is incomplete:
- It checks frontmatter parsing and `type` field
- It checks for broken links
- But it **does NOT** check:
  - Root `index.md` has `okf_version: "0.1"` (spec requirement)
  - Reserved filenames are not used as concepts
  - ISO 8601 timestamp format validation has a warning but no enforcement

**Impact**: The validation tool will report a bundle as "valid" even if it violates the OKF spec.

**Fix**: Complete the validator (see `src/validator.ts` line 41-76 for gaps).

---

### H6. Search doesn't handle empty queries gracefully
**File**: `src/tools.ts`  
**Lines**: 39-42  
**Issue**: If an agent calls `okf_search` with an empty string or whitespace-only query, the tokenizer will produce an empty array, and the search will return 0 results. The tool will respond with `"No concepts found matching query: \"\""`, which is confusing.

**Impact**: Poor UX when agent accidentally passes empty queries.

**Fix**:
```typescript
// In okf_search execute():
const { query, type, tags, limit = 10 } = params;

if (!query || query.trim() === "") {
  return {
    content: [
      { type: "text" as const, text: "Error: Search query cannot be empty" },
    ],
  };
}
```

---

### H7. No deduplication in `okf_list` tool
**File**: `src/tools.ts`  
**Lines**: 442-496  
**Issue**: `okf_list` filters concepts by directory and type, then groups by type. If a concept somehow appears twice in the index (shouldn't happen, but no guard), it will be listed twice.

**Impact**: Unlikely, but worth adding a guard.

**Fix**: Use a `Set` to track listed concept IDs:
```typescript
const listed = new Set<string>();
for (const concept of conceptsOfType.sort(...)) {
  if (listed.has(concept.id)) continue;
  listed.add(concept.id);
  lines.push(`- **${concept.title}** (\`${concept.id}\`)`);
  // ...
}
```

---

### H8. Auto-recall context injection not bounded by actual rendering
**File**: `src/recall.ts`  
**Lines**: 67-83  
**Issue**: The recall logic checks `if (totalChars + conceptText.length > config.maxRecallChars) break;`, but this counts **before** the concept is added to the lines array. This means the final injected context could be slightly larger than `maxRecallChars` due to markdown formatting overhead (section headers, blank lines).

**Impact**: Context budget overrun by ~50-100 chars per turn.

**Fix**: Count the actual rendered markdown string length:
```typescript
const renderedLines = lines.join("\n");
if (renderedLines.length + conceptText.length + 1 > config.maxRecallChars) {
  break;
}
```

---

## MEDIUM — Code Quality and Design Issues

### M1. `tsconfig.json` uses `moduleResolution: bundler` but plugin is not bundled
**File**: `tsconfig.json`  
**Line**: 5  
**Issue**: The plugin uses `"moduleResolution": "bundler"`, which is designed for bundlers like Webpack/Rollup, not for Node.js ESM. The plugin is loaded directly by OpenClaw as ESM modules.

**Impact**: May cause subtle module resolution issues if the plugin references Node.js built-ins or npm packages.

**Fix**: Use `"moduleResolution": "node16"` or `"nodenext"` for proper Node.js ESM resolution.

**Diff**:
```diff
- "moduleResolution": "bundler",
+ "moduleResolution": "node16",
```

---

### M2. No package.json `type: "module"` declaration
**File**: `package.json`  
**Issue**: The plugin uses `.js` extensions in imports (e.g., `import { ... } from "./types.js"`), which implies ESM, but `package.json` doesn't explicitly declare `"type": "module"`.

**Impact**: Node.js may interpret the files as CommonJS, causing import failures.

**Fix**:
```json
{
  "name": "@openclaw/okf",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  // ...
}
```

---

### M3. Plugin config defaults don't match production needs
**File**: `openclaw.plugin.json`  
**Lines**: 15-44  
**Issue**: Default config:
- `maxRecallChars: 2000` (same as hybrid-memory's 2000 default)
- `maxRecallConcepts: 5`
- `autoRecall: true`

**Problem**: With both hybrid-memory and OKF running with auto-recall, the agent will receive up to **4000 chars** of injected context every turn (2000 from hybrid-memory + 2000 from OKF). This could blow the context budget for smaller models.

**Recommendation**: Either:
1. Set `autoRecall: false` by default and require explicit opt-in
2. Reduce `maxRecallChars` to 500-1000 for OKF
3. Document the context budget implications in the plugin README

---

### M4. No plugin CLI commands for inspection
**File**: `src/index.ts`  
**Lines**: 128-254  
**Issue**: The plugin registers CLI commands (`openclaw okf list`, `openclaw okf search`, etc.), but they all require `currentIndex` to be built. If the plugin fails to initialize or the bundle path is wrong, all CLI commands will error with `"OKF index not built. Run 'openclaw okf index' first."`.

**Problem**: There's no way to inspect the plugin's config or verify the bundle path without starting the gateway.

**Recommendation**: Add a `openclaw okf config` command that shows:
- Bundle path (resolved)
- Plugin config (autoRecall, maxRecallChars, etc.)
- Whether the bundle directory exists
- Whether an index has been built

---

### M5. Link resolution logic doesn't handle Windows paths
**File**: `src/parser.ts`  
**Lines**: 122-163  
**Issue**: The `extractLinks()` function uses Unix-style path separators (`/`) and string manipulation. On Windows, concept IDs might use backslashes, causing link resolution to fail.

**Impact**: Plugin won't work on Windows.

**Fix**: Use `path.join()` and `path.sep` for cross-platform path handling.

---

### M6. No telemetry or metrics
**File**: N/A  
**Issue**: The plugin doesn't expose any metrics (e.g., number of auto-recalls per hour, average search latency, index rebuild count).

**Impact**: Hard to debug performance issues or tune config.

**Recommendation**: Add counters for:
- Auto-recall hits/misses
- Search query count
- Index rebuild count
- Average search latency

Use `api.runtime.metrics` if available, or log to a JSON file.

---

## LOW — Suggestions and Improvements

### L1. Consider using LanceDB or SQLite FTS instead of in-memory inverted index
**File**: `src/indexer.ts`  
**Rationale**: The plugin builds a full in-memory inverted index (`Map<string, Set<string>>`). For large bundles (1000+ concepts), this could consume significant memory. 

**Suggestion**: 
- Use SQLite FTS5 for full-text search (similar to hybrid-memory)
- Or use LanceDB for semantic search (better than keyword matching)

**Trade-off**: Adds external dependency, but scales better.

---

### L2. Add support for concept versioning
**File**: N/A  
**Rationale**: OKF spec allows `timestamp` in frontmatter, but the plugin doesn't track concept history or allow rollback.

**Suggestion**: 
- Store previous versions of concepts in a `.okf/.history/` directory
- Provide `okf_read` with a `version` parameter to retrieve old versions
- Add `okf_diff` tool to compare versions

---

### L3. Improve error messages in tools
**File**: `src/tools.ts`  
**Issue**: Many tools return generic error messages like `"Error reading concept file: ${error}"`. The raw error object is interpolated as `[object Object]`, which is unhelpful.

**Fix**: Use `error instanceof Error ? error.message : String(error)`.

---

### L4. Add `okf_stats` tool for bundle metrics
**File**: N/A  
**Suggestion**: Expose a tool that returns:
- Total concepts
- Concepts by type (histogram)
- Average concept length
- Most-linked concepts (top 10)
- Broken link count

Useful for agents to understand bundle structure before querying.

---

### L5. Add support for concept templates
**File**: N/A  
**Suggestion**: Allow users to define concept templates in `.okf/.templates/` directory. The `okf_write` tool could accept a `template` parameter to pre-fill frontmatter and body structure.

**Example**:
```markdown
---
type: API Endpoint
tags: [api, rest]
---

# Endpoint: {{title}}

## Request

## Response

## Examples
```

---

### L6. Provide a `okf_graph` tool for link visualization
**File**: N/A  
**Suggestion**: Add a tool that returns the link graph as a JSON structure (nodes + edges). Could be used by agents to visualize concept relationships or find clusters.

---

## HYBRID-MEMORY INTERACTION — Critical Coexistence Issues

### I1. Plugin slot conflict — OKF does NOT claim memory slot (✅ SAFE)
**Analysis**: 
- OKF plugin does **NOT** call `api.registerMemoryCapability()`, `api.registerMemoryPromptSection()`, or any exclusive memory slot registration.
- Hybrid-memory plugin continues to own the `plugins.slots.memory` slot.
- **No conflict**.

**Verdict**: ✅ OKF and hybrid-memory can coexist without slot conflicts.

---

### I2. Context budget competition — MAJOR ISSUE
**File**: `src/recall.ts`, `src/index.ts`  
**Issue**: Both plugins inject context before every agent turn:
- **Hybrid-memory**: Auto-recall injects up to 2000 chars (default)
- **OKF**: Auto-recall injects up to 2000 chars (default)
- **Total**: 4000 chars injected context per turn

**Impact**:
- For a model with 8K context window, this consumes **50% of the budget** before the agent even starts.
- For smaller models (4K context), this is **unsustainable**.
- Agents will run out of context quickly, leading to compaction thrashing.

**Recommendation**:
1. **Disable OKF auto-recall by default** (`autoRecall: false` in config)
2. Or reduce `maxRecallChars` to 500-1000
3. Or make auto-recall mutually exclusive (require user to choose one)

**Config example**:
```json
{
  "plugins": {
    "entries": {
      "okf": {
        "config": {
          "autoRecall": false,
          "maxRecallChars": 1000
        }
      }
    }
  }
}
```

---

### I3. Duplicate knowledge — HIGH RISK
**File**: `/home/node/.openclaw/workspace/.okf/` vs hybrid-memory database  
**Issue**: The `.okf/` bundle contains operational knowledge like:
- N8N workflow details
- Credential metadata
- Infrastructure info (Unraid, Docker, etc.)

**Problem**: This knowledge may **already be stored** in hybrid-memory as facts. If both plugins auto-recall, the agent will receive:
- Hybrid-memory fact: "N8N is running on Unraid at https://n8n.dev-sec-ops.nl/"
- OKF concept: "N8N Workflow Automation Platform" with the same info

**Impact**: 
- Redundant context wastes budget
- Agent may get confused by conflicting or slightly different versions of the same fact
- "Which source is more authoritative?" becomes unclear

**Recommendation**:
1. **Choose one source of truth** for operational knowledge:
   - Either use hybrid-memory facts (better for fast lookup, NER, structured entities)
   - Or use OKF concepts (better for narrative docs, playbooks, procedures)
2. **Keep OKF for reference docs only**: Use OKF for things like API schemas, architecture diagrams, runbooks — things that don't change often and are too long for hybrid-memory facts.
3. **Add a "source" tag** to facts/concepts so the agent knows where to look first.

---

### I4. Tool name confusion — MEDIUM RISK
**File**: `src/tools.ts` vs hybrid-memory tools  
**Issue**: Agents have to choose between:
- `memory_recall` (hybrid-memory) vs `okf_search` (OKF)
- `memory_store` (hybrid-memory) vs `okf_write` (OKF)

**When should the agent use which?**

**Current guidance in tool descriptions**:
- `okf_search`: "Search the OKF knowledge bundle for concepts matching a query."
- `memory_recall`: "Search memory for relevant facts, entities, and past conversations."

**Problem**: Both are search tools. The agent will need to decide:
- "Is this a 'concept' (OKF) or a 'fact' (memory)?"
- "Should I search the knowledge bundle or the memory database?"

**Recommendation**:
1. **Add explicit guidance in TOOLS.md**:
   ```markdown
   ### When to use OKF vs hybrid-memory:
   
   - **Use hybrid-memory (`memory_recall`, `memory_store`)** for:
     - Facts about people, companies, tasks, conversations
     - Short-lived operational state (recent events, decisions)
     - Anything that changes frequently
   
   - **Use OKF (`okf_search`, `okf_read`)** for:
     - Reference documentation (API schemas, playbooks, runbooks)
     - Architectural decisions
     - Procedures that don't change often
   ```

2. **Update tool descriptions** to clarify the distinction:
   - `okf_search`: "Search **reference documentation** in the OKF knowledge bundle. Use this for API schemas, playbooks, and architecture docs. For facts about people/companies/tasks, use `memory_recall` instead."
   - `memory_recall`: "Search memory for **operational facts** (people, companies, tasks, conversations). For reference docs and playbooks, use `okf_search` instead."

---

### I5. Semantic overlap — agents will waste turns
**File**: N/A  
**Issue**: Without clear guidance, agents will:
1. Call `memory_recall` with query "N8N workflow details"
2. Get no results (because it's in OKF, not memory)
3. Call `okf_search` with same query
4. Get results
5. Waste 1 extra LLM turn

**Impact**: Slower responses, higher costs, user frustration.

**Recommendation**: 
- Add a "meta-search" tool that checks both sources and returns unified results
- Or provide a decision tree in `AGENTS.md`: "If searching for X, use Y tool"

---

## OKF SPEC COMPLIANCE

### Root `index.md` validation
**File**: `/home/node/.openclaw/workspace/.okf/index.md`  
**Status**: ✅ PASS  
**Evidence**:
```yaml
okf_version: "0.1"
title: OpenClaw Workspace Knowledge Bundle
description: Core knowledge and operational context for Clark's OpenClaw workspace
```

**Verdict**: Root `index.md` correctly declares `okf_version: "0.1"` in frontmatter.

---

### Reserved filenames
**File**: `.okf/` directory  
**Status**: ✅ PASS  
**Evidence**: All `index.md` and `log.md` files are used correctly (no reserved names as concepts).

---

### Cross-links validation
**Sample check**: 5 links from `infrastructure/n8n.md`:
- `[Unraid](/infrastructure/unraid.md)` → ✅ exists
- `[Workflows Index](/workflows/index.md)` → ✅ exists
- `[Gmail → Workspace Sync](/workflows/gmail-sync.md)` → ✅ exists
- `[N8N API Token](/credentials/n8n-api.md)` → ✅ exists
- `[MEMORY.md](/MEMORY.md)` → ⚠️ external (not in .okf/, points to workspace root)

**Verdict**: Most links valid. External links to workspace files (like `/MEMORY.md`) are intentional and acceptable.

---

### Credential safety
**Check**: Searched for actual secrets in `.okf/` bundle  
**Status**: ✅ PASS  
**Evidence**: No actual tokens, passwords, or API keys found. All credential files contain **references only** (e.g., "Storage: .env file (MATON_API_KEY)").

**Verdict**: Bundle is safe to commit to version control.

---

### Data quality — Is this real operational knowledge or model fluff?
**Sample concepts reviewed**:
1. `infrastructure/n8n.md` — ✅ Real data (version: 2.6.4, URL, workflow IDs)
2. `workflows/gmail-sync.md` — ✅ Real data (workflow ID: 9y4jRRj29lEmwksh, schedule, status)
3. `credentials/n8n-api.md` — ✅ Real data (expiry date, rotation history)

**Verdict**: The `.okf/` bundle contains **real, useful operational knowledge**, not generic filler text.

---

## FINAL VERDICT

**⚠️ NEEDS FIXES FIRST — NOT SAFE TO TEST**

### Must fix before testing:
1. **C1**: Install TypeScript and compile the plugin (`npm install --save-dev typescript @types/node && npm run build`)
2. **C2**: Verify SDK import paths are valid
3. **C3**: Add timeout to `before_prompt_build` hook (`{ timeoutMs: 3000 }`)
4. **C4**: Fix watcher cleanup to always return a cleanup function
5. **C5**: Fix race condition in reindex scheduling (use debounce)

### Must fix before production:
6. **H1-H8**: All high-priority issues (search scoring, validation, error handling)
7. **M2**: Add `"type": "module"` to `package.json`
8. **M3**: Reduce `maxRecallChars` to 1000 or disable `autoRecall` by default

### Strongly recommended:
9. **I2**: Disable OKF auto-recall by default to avoid context budget explosion with hybrid-memory
10. **I3**: Clarify knowledge source responsibilities (OKF = reference docs, hybrid-memory = operational facts)
11. **I4**: Update tool descriptions to guide agent tool choice

---

## Testing Checklist (After Fixes)

Once critical fixes are applied:

1. ✅ Plugin compiles (`npm run build` succeeds)
2. ✅ Gateway starts with plugin enabled (no import errors)
3. ✅ CLI commands work (`openclaw okf list`, `openclaw okf search`)
4. ✅ Auto-recall doesn't block agent turns (test with `maxRecallChars: 500`)
5. ✅ Manual search returns correct results (`okf_search`)
6. ✅ Write tool creates valid concepts (`okf_write`)
7. ✅ Validation catches errors (`okf_validate`)
8. ✅ Context budget stays under 4K per turn (monitor logs)
9. ✅ No tool name confusion (agents choose correct tool)
10. ✅ No knowledge duplication between OKF and hybrid-memory

---

## Sign-off

This audit was conducted independently with no prior context from the development process. All findings are based on direct code inspection and spec conformance checks.

**Do not proceed to installation until the CRITICAL issues are resolved.**

— Independent QA Subagent  
2026-07-03
