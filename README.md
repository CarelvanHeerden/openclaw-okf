# openclaw-okf

> OKF (Open Knowledge Format) plugin for OpenClaw — structured knowledge bundles with auto-recall, graph traversal, and agent tools

## Overview

This plugin brings [Open Knowledge Format (OKF) v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) support to OpenClaw. OKF is an open, human- and agent-friendly format for representing knowledge as markdown files with YAML frontmatter in a directory tree.

**What this plugin does:**

- **Auto-recall**: Automatically injects relevant OKF concepts into agent turns based on the current prompt
- **Agent tools**: Provides `okf_search`, `okf_read`, `okf_write`, `okf_list`, and `okf_validate` tools for agents
- **Graph traversal**: Follows cross-links between concepts to build context graphs
- **Full-text search**: Fast in-memory search with TF-IDF scoring
- **File watching**: Automatically reindexes when bundle files change
- **CLI commands**: Manage and inspect OKF bundles from the command line

## Compatibility

| Requirement | Version |
|---|---|
| OpenClaw Gateway | `>=2026.3.24-beta.2` (tested on 2026.5.2, 2026.5.12, and 2026.6.10) |
| Node.js | `>=22` |
| Plugin API | `>=2026.3.24-beta.2` |

## Installation

This plugin is designed to be used as a workspace plugin. Place it in your OpenClaw workspace:

```bash
# From ClawHub (once review clears)
openclaw plugins install openclaw-okf

# From git (works immediately)
openclaw plugins install git:github.com/CarelvanHeerden/openclaw-okf

# Then restart the gateway
openclaw gateway restart
```

### Docker / Container Workaround

If you hit `EXDEV: cross-device link not permitted` during git install (common when `/tmp` and `~/.openclaw` are on different filesystems/volumes), use:

```bash
TMPDIR=/home/node/.openclaw/tmp openclaw plugins install git:github.com/CarelvanHeerden/openclaw-okf
```

This is an [upstream OpenClaw issue](https://github.com/openclaw/openclaw/issues) — the gateway's git installer uses `fs.rename` across mount boundaries.

Enable the plugin in your OpenClaw config:

```json5
{
  "plugins": {
    "entries": {
      "okf": {
        "enabled": true,
        "config": {
          "bundlePath": ".okf",
          "autoRecall": true,        // Auto-injects relevant concepts into turns (default: true)
          "maxRecallChars": 1000,
          "maxRecallConcepts": 5,
          "minRecallScore": 0.5,        // Relevance gate: absolute score floor (default: 0.5)
          "recallRelevanceRatio": 0.35, // Relevance gate: drop concepts below 35% of top hit
          "minMatchedTokens": 1,        // Relevance gate: min distinct query tokens matched
          "graphDepth": 1,
          "watchChanges": true,
          "autoCapture": false,       // Feature flag: auto-detect documentable knowledge
          "autoCaptureMinChars": 500,
          "autoCaptureTypes": ["decision", "playbook", "architecture", "service", "integration"]
        }
      }
    }
  }
}
```

Restart the gateway:

```bash
openclaw gateway restart
```

### Shared Bundles & Permissions

OKF bundles are plain directories of markdown files. The plugin respects filesystem permissions — there is no built-in authentication or write-control layer.

**Mount shared bundles read-only** for agents that should only read (not write) concepts:

```bash
docker run -v /shared/okf:/home/node/.openclaw/workspace/.okf:ro ...
```

This prevents any writes to the shared bundle from that container while still allowing `okf_search`, `okf_read`, `okf_list`, and `okf_validate`.

**Use a git-based PR workflow** for shared bundle writes:

1. Each agent (or team) forks or branches the shared bundle repository.
2. Agents use `okf_write` / `okf_write_batch` on their local copy.
3. Changes are reviewed and merged into the shared bundle via pull request.
4. Downstream agents pull the updated bundle on their next restart (or via `watchChanges`).

This pattern keeps the shared bundle auditable, prevents conflicting writes, and leverages existing code-review tooling without any plugin-side auth complexity.

**Example Docker Compose snippet:**

```yaml
services:
  openclaw:
    image: openclaw/gateway:latest
    volumes:
      # Agent's own writable workspace
      - ./workspace:/home/node/.openclaw/workspace
      # Shared OKF bundle — read-only for this agent
      - /shared/okf:/home/node/.openclaw/workspace/.okf:ro
```

## Configuration

| Option               | Type       | Default | Description                                                  |
|----------------------|------------|---------|--------------------------------------------------------------|
| `bundlePath`         | `string`   | `.okf`  | Path to OKF bundle directory (relative to workspace root)    |
| `autoRecall`         | `boolean`  | `true`  | Auto-inject relevant concepts before agent turns             |
| `maxRecallChars`     | `number`   | `1000`  | Maximum characters to inject from recalled concepts          |
| `maxRecallConcepts`  | `number`   | `5`     | Maximum number of concepts to recall per turn                |
| `minRecallScore`     | `number`   | `0.5`   | **Relevance gate**: absolute floor on the normalized match score. Below this, a concept is treated as noise and not injected. `0` disables. |
| `recallRelevanceRatio`| `number`  | `0.35`  | **Relevance gate**: drop any concept scoring below this fraction of the top match. Scale-invariant guard against weak neighbours. `0` disables. |
| `minMatchedTokens`   | `number`   | `1`     | **Relevance gate**: minimum number of distinct query tokens a concept must match. Set to `2` to require multi-token overlap. |
| `graphDepth`         | `number`   | `1`     | Number of hops to traverse when following concept links      |
| `watchChanges`       | `boolean`  | `true`  | Watch bundle directory for changes and auto-reindex          |
| `autoCapture`        | `boolean`  | `false` | **Feature flag**: auto-detect documentable knowledge in turns |
| `autoCaptureMinChars`| `number`   | `500`   | Min response length before auto-capture considers it         |
| `autoCaptureTypes`   | `string[]` | `[all]` | Knowledge types to capture: decision, playbook, architecture, service, integration |

## Knowledge Capture: Three Modes

OKF supports three complementary ways to capture knowledge:

### Mode 1: Agent-driven (always active)
The agent decides when something is worth documenting and calls `okf_write` directly. This is the primary mode. The agent considers whether conversation content should become a structured OKF concept based on its judgment.

### Mode 2: Keyword triggers (always active)
Users can explicitly request documentation with natural language:
- *"add to okf"* / *"save to okf"* / *"document this in okf"*
- *"add to knowledge base"* / *"save to knowledge base"* / *"write to knowledge base"*
- *"document this"* / *"document this decision"*
- *"create a playbook for..."* / *"this is a decision: ..."*
- *"new service: ..."* / *"new workflow: ..."*

When detected, the plugin injects a prompt hint telling the agent to use `okf_write`.

### Mode 3: Auto-capture (feature flag, off by default)
Set `autoCapture: true` to enable automatic knowledge detection. The plugin analyzes completed agent turns and suggests capture when:

1. The assistant response exceeds `autoCaptureMinChars` (default 500)
2. The response doesn't contain model reasoning artifacts (hedging, self-correction)
3. **Both** the user message AND assistant response contain documentable signals
4. The detected knowledge type is in `autoCaptureTypes`

**Why off by default?** Without careful filtering, auto-capture can create garbage concepts from model reasoning, filler text, or casual conversation. The high threshold (dual-signal matching + garbage filtering) mitigates this, but curated knowledge beats automated extraction.

### Hybrid Memory Coexistence

| Feature | OKF | Hybrid Memory |
|---------|-----|---------------|
| **What it stores** | Reference docs, playbooks, architecture decisions, procedures | Atomic facts, preferences, people, events |
| **Trigger** | Explicit ("document this") or agent judgment | "Remember this", auto-capture |
| **Structure** | Full documents with cross-links | Key-value facts |
| **Retrieval** | `okf_search` / `okf_read` | `memory_recall` |
| **Persistence** | Git-diffable markdown files | SQLite + LanceDB |

Both systems complement each other. OKF is your team's wiki; hybrid memory is your personal notebook.

## What is OKF?

OKF (Open Knowledge Format) is an open specification for representing knowledge as:

- **Markdown files** with **YAML frontmatter**
- Organized in a **directory tree** (the structure IS the knowledge graph)
- **Cross-linked** via standard markdown links
- **Human-readable** without tooling
- **Agent-consumable** without bespoke SDKs

### Example OKF concept

```markdown
---
type: API Endpoint
title: User Authentication API
description: OAuth2 authentication endpoint for user login
resource: https://api.example.com/v1/auth
tags: [auth, oauth, security]
timestamp: 2026-07-03T20:00:00Z
---

# Overview

This endpoint handles OAuth2 authentication for users. It issues access tokens
and refresh tokens upon successful authentication.

# Schema

**Request:**
```json
{
  "username": "string",
  "password": "string",
  "grant_type": "password"
}
```

**Response:**
```json
{
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 3600
}
```

# Related Endpoints

- [Token Refresh](/api/auth/refresh.md)
- [User Profile](/api/users/profile.md)

# Citations

[1] [OAuth2 RFC](https://tools.ietf.org/html/rfc6749)
```

## Agent Tools

Once enabled, agents can use these tools:

### `okf_search`

Search for concepts by text, type, or tags.

```typescript
okf_search({
  query: "authentication",
  type: "API Endpoint",
  tags: ["security"],
  limit: 10
})
```

### `okf_read`

Read the full content of a concept by ID.

```typescript
okf_read({
  conceptId: "api/auth/login",
  includeLinks: true
})
```

### `okf_write`

Create or update a concept.

```typescript
okf_write({
  path: "api/auth/logout",
  type: "API Endpoint",
  title: "User Logout",
  description: "Endpoint to invalidate user session",
  body: "# Overview\n\nThis endpoint logs out a user...",
  tags: ["auth", "security"]
})
```

### `okf_list`

List concepts in a directory.

```typescript
okf_list({
  directory: "api",
  type: "API Endpoint"
})
```

### `okf_validate`

Validate bundle conformance to OKF v0.1 spec.

```typescript
okf_validate({
  path: "api/auth/login" // optional - validates entire bundle if omitted
})
```

## CLI Commands

### List concepts

```bash
openclaw okf list
openclaw okf list --directory api
openclaw okf list --type "API Endpoint"
```

### Search concepts

```bash
openclaw okf search "authentication"
openclaw okf search "user data" --type "BigQuery Table"
openclaw okf search "security" --limit 20
```

### Validate bundle

```bash
openclaw okf validate
openclaw okf validate --path api/auth/login
```

### Show statistics

```bash
openclaw okf stats
```

### Rebuild index

```bash
openclaw okf index
```

## Auto-Recall

When `autoRecall` is enabled (the default), the plugin automatically injects relevant OKF concepts into agent turns via the `before_prompt_build` hook.

**How it works:**

1. Extract keywords from the current prompt
2. Search the OKF index for matching concepts
3. **Apply relevance gates** (see below) so only genuinely relevant concepts survive
4. Take the top N surviving concepts (based on `maxRecallConcepts`)
5. If `graphDepth > 0`, include linked concepts (1-hop neighbors)
6. Format as markdown and inject into the prompt context (up to `maxRecallChars`)

If no concept clears the relevance gates, **nothing is injected** — the correct behaviour for an off-topic turn.

### Relevance Gating

Earlier versions injected the top-N concepts by score with no confidence
threshold. Because the search scorer sums the IDF of matched query tokens
(`score = sum(IDF) / queryLength`), a single overlap on a common token
(e.g. `docker`, `restart`, `workspace`) produces a non-zero score — so weak,
off-topic concepts were surfaced whenever nothing better filled the top-N. For
example, an unrelated development conversation could pull in home-infrastructure
or OAuth concepts purely on ambient shared words.

Auto-recall now gates candidates on three signals before slicing to the top-N:

| Gate | Default | Effect |
|------|---------|--------|
| `minMatchedTokens` | `1` | Require at least this many **distinct** query tokens to overlap. Raise to `2` to demand multi-token relevance. |
| `minRecallScore` | `0.5` | Absolute floor on the normalized score. Concepts below it are treated as noise. |
| `recallRelevanceRatio` | `0.35` | Scale-invariant gate: drop any concept scoring below `ratio × topScore`, so one strong match cannot drag in weak neighbours. |

**Tuning:**

- Seeing irrelevant concepts? **Raise** `minRecallScore` (e.g. `1.0`) and/or
  `recallRelevanceRatio` (e.g. `0.5`), or set `minMatchedTokens: 2`.
- Missing concepts you expected? **Lower** the thresholds.
- Want the pre-gating behaviour back? Set `minRecallScore: 0`,
  `recallRelevanceRatio: 0`, and `minMatchedTokens: 1`.

The scores are **not** normalized to 0–1 (they scale with token rarity and
query length), which is why the ratio gate carries most of the precision — it
adapts to whatever magnitude a given query produces. The absolute floor is a
secondary backstop for very weak single-token matches.

**Example injected context:**

```markdown
## Relevant Knowledge (OKF)

### User Authentication API (API Endpoint)
OAuth2 authentication endpoint for user login
Resource: https://api.example.com/v1/auth
Tags: auth, oauth, security
Links to: api/auth/refresh, api/users/profile
ID: `api/auth/login`

### Token Refresh API (API Endpoint)
Endpoint to refresh OAuth2 access tokens
Resource: https://api.example.com/v1/auth/refresh
Tags: auth, oauth
ID: `api/auth/refresh`
```

This gives agents automatic access to relevant domain knowledge without explicit tool calls.

## File Structure

The plugin expects an OKF bundle at `<workspace>/.okf/` (configurable):

```
.okf/
├── index.md          # Optional root index
├── log.md            # Optional change log
├── api/
│   ├── index.md
│   ├── auth/
│   │   ├── login.md
│   │   └── refresh.md
│   └── users/
│       └── profile.md
└── tables/
    ├── users.md
    └── orders.md
```

**Reserved filenames** (per OKF spec):
- `index.md` — Directory listing (no frontmatter)
- `log.md` — Update history (no frontmatter)

All other `.md` files are concept documents with required YAML frontmatter.

## OKF Spec Conformance

This plugin implements **OKF v0.1** as specified at:
https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

**Conformance requirements:**

✅ Every concept has YAML frontmatter with required `type` field  
✅ Reserved filenames (`index.md`, `log.md`) are not treated as concepts  
✅ Cross-links use standard markdown syntax  
✅ Bundle-relative (`/path/to/concept.md`) and relative (`./concept.md`) links are supported  
✅ Validation is permissive (broken links are warnings, not errors)  
✅ Unknown frontmatter fields are preserved  

## Implementation Details

### Indexer

- Recursively scans `.okf/` directory tree
- Parses YAML frontmatter from each `.md` file (custom lightweight parser, no dependencies)
- Builds in-memory index: `Map<conceptId, ConceptMeta>`
- Extracts cross-links from markdown bodies
- Builds adjacency graph for traversal
- Creates inverted index for full-text search (tokenize + TF-IDF scoring)

### Parser

- Custom YAML parser for frontmatter (handles `key: value`, `key: [array]`, multi-line arrays)
- Markdown link extraction via regex (`[text](url)`)
- Resolves both absolute (`/tables/users.md`) and relative (`../users.md`) links
- Derives title from filename if not in frontmatter

### Recall Engine

- Extracts keywords from prompt (removes stopwords, keeps meaningful terms)
- Searches OKF index using FTS (TF-IDF scoring)
- Follows cross-links (configurable `graphDepth`)
- Progressive disclosure: concept summaries first, full content on demand
- Token budget: limits injected context to `maxRecallChars`

### Watcher

- Uses Node.js `fs.watch` with recursive option
- Triggers reindex on `.md` file changes
- Debounced to batch rapid changes

## Use Cases

- **API documentation**: Structure API endpoints as OKF concepts, auto-recall them when agents need to call APIs
- **Data catalog**: Document database tables/schemas, auto-inject when agents query data
- **Runbooks/playbooks**: Store operational procedures, recall during incident response
- **Project knowledge**: Capture architectural decisions, design docs, conventions
- **Personal wiki**: Build a second brain for agents to search and reference

## Contributing

This is a workspace plugin scaffold. To extend:

1. Add new concept types (just frontmatter `type` field — no code changes needed)
2. Improve search scoring (edit `indexer.ts`)
3. Add vector embeddings for semantic search (integrate with `memory-lancedb` pattern)
4. Build UI visualizations (use CLI output as starting point)

## License

MIT

## Related

- [OKF Spec v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [OpenClaw Plugin SDK](https://docs.openclaw.ai/plugins/sdk-overview)
- [Memory LanceDB Plugin](https://docs.openclaw.ai/plugins/memory-lancedb)
