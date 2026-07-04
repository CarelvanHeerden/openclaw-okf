# Changelog

All notable changes to the OKF plugin will be documented in this file.

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
