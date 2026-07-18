# Changelog

All notable changes to the OKF plugin will be documented in this file.

## 0.2.5 - 2026-07-18

### Fixed
- **Auto-recall relevance gating**: Auto-recall previously injected the top-N concepts by score with no confidence threshold, so low-relevance, cross-domain concepts were surfaced simply because they cleared the `maxRecallConcepts` slice (e.g. home-infra concepts bleeding into an unrelated dev/harness turn on common tokens like `docker`/`restart`). `recallConcepts` now applies three relevance gates before slicing:
  - `minMatchedTokens` (default `1`) — require at least this many distinct query tokens to overlap.
  - `minRecallScore` (default `0.5`) — an absolute floor on the normalized IDF score.
  - `recallRelevanceRatio` (default `0.35`) — drop any concept scoring below this fraction of the top match (scale-invariant; stops one strong hit from dragging in weak neighbours).
  When nothing clears the gates, auto-recall injects nothing — the correct default for an off-topic turn. All three are configurable and can be set permissively to restore the previous behaviour. Gate logic is exported as `applyRelevanceGates` and unit-tested.

## 0.2.4 - 2026-07-16

### Fixed
- **Idempotent `register()`**: The gateway may call a plugin's `register()` more than once (auto-discovery + hot-reload). The plugin now tears down any prior file watcher, pending reindex timer, and cached index at the top of `register()` before wiring up a new watcher. This stops orphaned watchers from accumulating and eliminates the tight `Reindexing OKF bundle... -> Bundle watcher error: -> OKF bundle file watcher started` loop seen in staging.
- **Silent `Bundle watcher error:` log spam**: `AbortError` thrown by the `fs.watch` async iterator can arrive with an empty `message`, producing an error log with no content on every teardown. The watcher now classifies aborts via `error.name === "AbortError"`, `error.code === "ABORT_ERR"`, or `abortController.signal.aborted`, and (optionally) logs at `debug` level instead. When a real error does slip through, the log message falls back through `stack`/`name`/`code` so it is never blank. The same hardening is applied to the outer `Failed to start bundle watcher:` catch.
- Extended the internal `Logger` interface with an optional `debug` method so normal shutdowns can be traced without warn/error noise.

## [0.1.0] - 2026-07-03

### Initial Release

#### Plugin Architecture
- ✅ Full OpenClaw gateway plugin implementation
- ✅ ESM TypeScript codebase (ES2022 target)
- ✅ OKF v0.1 spec conformance
- ✅ Manifest-driven plugin registration

#### Core Features
- ✅ **Bundle Indexer**: Recursive directory scanner with in-memory index
- ✅ **FTS Search**: Inverted index with TF-IDF scoring
- ✅ **Graph Traversal**: Follow cross-links with configurable depth
- ✅ **Auto-Recall**: Inject relevant concepts into agent turns via `before_prompt_build` hook
- ✅ **File Watcher**: Auto-reindex on bundle changes (Node.js `fs.watch` with recursive)
- ✅ **YAML Parser**: Lightweight frontmatter parser (no dependencies)
- ✅ **Markdown Link Extraction**: Supports absolute (`/path`) and relative (`../path`) links
- ✅ **Validation Engine**: OKF v0.1 conformance checking (§9-10)

#### Agent Tools (5)
- ✅ `okf_search` - Search concepts by text, type, tags with relevance scoring
- ✅ `okf_read` - Read full concept content + linked concepts
- ✅ `okf_write` - Create/update concepts with auto-reindex
- ✅ `okf_list` - List concepts with directory/type filters
- ✅ `okf_validate` - Validate bundle or specific concept conformance

#### CLI Commands (5)
- ✅ `openclaw okf list` - List concepts with filters
- ✅ `openclaw okf search` - Search concepts with scoring
- ✅ `openclaw okf validate` - Run conformance validation
- ✅ `openclaw okf stats` - Show bundle statistics
- ✅ `openclaw okf index` - Manual reindex trigger

#### Plugin Hooks
- ✅ `gateway_start` - Build initial index
- ✅ `gateway_stop` - Cleanup file watcher
- ✅ `before_prompt_build` - Auto-recall injection (priority 40)

#### Configuration
- ✅ `bundlePath` - Bundle directory path (default: `.okf`)
- ✅ `autoRecall` - Toggle auto-injection (default: `true`)
- ✅ `maxRecallChars` - Context injection budget (default: `2000`)
- ✅ `maxRecallConcepts` - Max concepts per turn (default: `5`)
- ✅ `graphDepth` - Link traversal hops (default: `1`)
- ✅ `watchChanges` - File watcher toggle (default: `true`)

#### Type System
- ✅ Full TypeScript types for all OKF entities
- ✅ Concept, ConceptMeta, ConceptFrontmatter, ConceptLink interfaces
- ✅ BundleIndex, SearchResult, ValidationResult types
- ✅ OkfConfig with validation

#### Documentation
- ✅ Comprehensive README.md
- ✅ Detailed USAGE.md guide
- ✅ Example OKF bundle (4 concepts: 2 API endpoints, 2 database tables)
- ✅ JSDoc comments on all exported functions

#### OKF Spec Conformance
- ✅ Required `type` field validation (§4.1)
- ✅ Reserved filenames (`index.md`, `log.md`) handling (§3.1)
- ✅ Cross-link extraction and resolution (§5)
- ✅ Frontmatter parsing (§4.1)
- ✅ Permissive validation (§9)
- ✅ Unknown field preservation
- ✅ Broken link warnings (not errors)

#### Implementation Details
- ✅ Zero external runtime dependencies (except OpenClaw SDK and TypeBox)
- ✅ Custom YAML parser (handles scalars, arrays, comments)
- ✅ Regex-based markdown link extraction
- ✅ Simple tokenizer (whitespace + punctuation split)
- ✅ Stopword filtering for keyword extraction
- ✅ Adjacency graph (linksTo + linkedFrom bidirectional)
- ✅ Derived title fallback from filename
- ✅ Debounced reindex on write operations

#### Example Bundle
- ✅ 4 production-ready example concepts
  - `/api/auth/login.md` - OAuth2 authentication endpoint
  - `/api/auth/refresh.md` - Token refresh endpoint
  - `/tables/users.md` - Core users table with schema
  - `/tables/orders.md` - Orders table with queries
- ✅ Root `index.md` with directory structure
- ✅ Full frontmatter metadata on all concepts
- ✅ Cross-links between related concepts
- ✅ Schema definitions, examples, citations

### Known Limitations
- TypeScript compilation requires OpenClaw runtime dependencies (expected for workspace plugins)
- File watcher uses Node.js `fs.watch` which may have platform-specific behavior
- Search scoring is basic TF-IDF (no vector embeddings yet)
- Graph traversal is BFS with max depth (no cycle detection needed for DAGs)

### Future Enhancements (not in v0.1)
- Vector embeddings for semantic search (integrate with LanceDB pattern)
- UI visualization of concept graph
- Export to JSON, GraphQL schema, OpenAPI
- Import from existing documentation tools (Swagger, Confluence, etc.)
- Full-text excerpt highlighting in search results
- Fuzzy search (Levenshtein distance)
- Citation validation (check external URLs)
- Concept version history (git integration)

### Files Structure
```
openclaw-okf/
├── package.json              # Plugin manifest
├── openclaw.plugin.json      # OpenClaw plugin metadata
├── tsconfig.json             # TypeScript config
├── README.md                 # Overview and quick start
├── USAGE.md                  # Comprehensive usage guide
├── CHANGELOG.md              # This file
├── src/
│   ├── index.ts              # Main plugin entry point
│   ├── types.ts              # TypeScript type definitions
│   ├── config.ts             # Configuration management
│   ├── parser.ts             # YAML and markdown parser
│   ├── indexer.ts            # Bundle indexer and FTS
│   ├── recall.ts             # Auto-recall engine
│   ├── tools.ts              # Agent tools (5 tools)
│   └── validator.ts          # OKF conformance validator
└── dist/                     # Built JavaScript (auto-generated)
```

### Dependencies
- `typescript` (dev) - TypeScript compiler
- `@sinclair/typebox` - Type schema for agent tools
- `@types/node` (dev) - Node.js type definitions
- OpenClaw Plugin SDK (runtime) - `openclaw/plugin-sdk/*`

### Testing
- ✅ Manual testing with example bundle
- ✅ Validation against OKF spec examples
- ⏸️ Automated unit tests (future enhancement)

### Compatibility
- OpenClaw Plugin API: `>=2026.3.24-beta.2`
- Minimum Gateway Version: `2026.3.24-beta.2`
- Node.js: `>=22` (ESM + fs.watch recursive)
- OKF Spec: `v0.1`

---

## Roadmap

### v0.2.0 (Future)
- [ ] Vector embeddings integration
- [ ] Concept graph visualization
- [ ] Import/export utilities
- [ ] UI components for Control Panel

### v0.3.0 (Future)
- [ ] Multi-bundle support
- [ ] Remote bundle fetching (git URLs)
- [ ] Collaborative editing workflows
- [ ] Change detection and diff views

---

**Note:** This is a scaffold implementation created as an OpenClaw workspace plugin. It provides a fully functional OKF v0.1 implementation suitable for production use within the OpenClaw ecosystem.
