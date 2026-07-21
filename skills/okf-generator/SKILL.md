# OKF (Open Knowledge Format) — Agent Skill

Structured knowledge bundles with auto-recall, graph traversal, and agent tools.
Based on the OKF v0.1 spec: markdown files with YAML frontmatter, cross-linked
via standard markdown links.

## When to Use OKF vs Hybrid-Memory

| Use Case | Tool | Why |
|---|---|---|
| Durable, structured knowledge (architecture, decisions, playbooks) | `okf_write` | Persists as versioned markdown files with frontmatter, cross-links, and graph traversal |
| Volatile facts, contacts, session-scoped context | `memory_store` | FTS + vector recall, decay/compaction, fast lookups |
| Cross-session knowledge that should survive memory pruning | `okf_write` | OKF files don't decay — they're permanent until explicitly removed |
| Quick "remember this for later" | `memory_store` | Lower ceremony, no frontmatter needed |
| Documenting why a decision was made | `okf_write` (type: `Decision Record`) | Structured format preserves context, rationale, and alternatives |
| People, orgs, relationships | `memory_directory` | Purpose-built for contact/org data |

**Rule of thumb:** If it's worth documenting for future agents/sessions with structure and cross-references, use OKF. If it's a transient fact or quick recall target, use hybrid-memory.

## Tools

### `okf_write` — Write a Single Concept
Use for: individual knowledge entries, decisions, architecture docs, playbooks.

Parameters:

- `path` (required): concept path relative to the bundle root, without `.md`
  (e.g., `architecture/auth-flow`, `decisions/2026-03-db-choice`). The path IS
  the concept ID. Allowed characters: alphanumerics, `-`, `_`, `/`, `.`.
  `index` and `log` are reserved filenames and will be rejected.
- `type` (required): one of the types below
- `title` (required): human-readable display name
- `body` (required): markdown content (the actual knowledge)
- `description`: one-line summary (strongly recommended — used by search and recall)
- `tags`: array of searchable tags
- `resource`: canonical URI if the concept describes an external asset

**Cross-linking:** there is no `links` parameter. Relationships are expressed
as standard markdown links in the `body`, preferably bundle-relative:

```markdown
Joined with the [users table](/data-models/users.md) on `user_id`.
```

The indexer extracts these links to build the concept graph (used by
`okf_read includeLinks` and auto-recall graph traversal).

### `okf_write_batch` — Bulk Import
Use when: importing 5+ concepts at once (repo analysis, documentation extraction, migration).

Takes `concepts`: an array of objects with the same fields as `okf_write`
(`path`, `type`, `title`, `body`, plus optional `description`, `tags`,
`resource`). More efficient than calling `okf_write` in a loop — single index
rebuild after all writes.

### `okf_search` — Keyword Search
Searches concept titles, descriptions, tags, and the first ~500 characters of
body text. Parameters: `query` (required), `type` filter, `tags` filter,
`limit`. Returns ranked matches with concept IDs — follow up with `okf_read`.

### `okf_read` — Read a Concept
Fetch full content of a concept by ID (`conceptId`). Set `includeLinks: true`
to also get summaries of concepts it links to and is referenced by.

### `okf_list` — List Concepts
List all concepts, optionally filtered by `directory` (path prefix) and/or
`type`.

### `okf_validate` — Validate Bundle
Check bundle conformance to the OKF v0.1 spec: missing `type` fields,
unparseable frontmatter, reserved-filename misuse. Broken cross-links and
missing recommended fields are reported as warnings (the spec is intentionally
permissive about these).

### `okf_corpus_search` — Corpus Supplement Mode
Only available when `corpusSupplement: true` in plugin config. Exposes OKF search in a `memory_search`-compatible format for use by other plugins (e.g., hybrid-memory corpus supplement).

## Concept Types

Types are free-form strings per the OKF spec; these are the conventions used
in this bundle:

| Type | Use For |
|---|---|
| `Architecture` | System design, component diagrams, data flow |
| `API Endpoint` | REST/GraphQL specs, request/response formats |
| `Data Model` | Database schemas, entity relationships |
| `Service` | Microservice docs, dependencies, health checks |
| `Infrastructure` | Docker/K8s configs, networking, deployment |
| `Playbook` | Runbooks, procedures, step-by-step guides |
| `Script` | Shell/Python scripts with full source |
| `Decision Record` | "Why we chose X" — context, options, rationale |
| `Integration` | Third-party API setup, webhooks, auth flows |
| `Configuration` | Env vars, config files, feature flags |
| `Recovery Procedure` | DR/rollback guides |

## Bundle Structure

```
.okf/
├── index.md               # Directory listing; frontmatter here may ONLY declare okf_version
├── architecture/          # System design concepts
│   ├── auth-flow.md
│   └── data-pipeline.md
├── modules/               # Component-level docs
├── data-models/           # Schema definitions
├── decisions/             # Decision records (YYYY-MM-DD-*.md)
├── playbooks/             # Operational runbooks
└── integrations/          # Third-party service docs
```

`index.md` and `log.md` are reserved at every directory level — never use them
as concept paths.

### Frontmatter Contract (OKF v0.1)

Every concept file has YAML frontmatter. Written via `okf_write`, this is
generated for you. If you write `.md` files directly:

```yaml
---
type: Architecture                       # REQUIRED — the only required field
title: Authentication Flow               # recommended
description: OAuth2 + PKCE flow for API authentication   # recommended
tags: [auth, oauth, security, api]       # optional
resource: https://github.com/org/repo/docs/auth.md       # optional
timestamp: 2026-07-21T10:00:00Z          # optional, ISO 8601
---
```

- Required: `type` only.
- The concept ID is the file path (no `id` frontmatter field).
- There is no `links:` frontmatter field — cross-links go in the body as
  markdown links (`[title](/dir/concept.md)`).
- The bundle-root `index.md` may declare `okf_version: "0.1"` in frontmatter;
  no other frontmatter belongs in index files.

## Content Rules

1. **One concept per file** — don't create mega-files
2. **Max ~500 lines per concept** — split if larger
3. **Extract actual values** — IPs, ports, paths, env var names (not secrets)
4. **Preserve code blocks** — include full source for scripts
5. **Cross-link in the body** — use bundle-relative markdown links (`/dir/concept.md`) to connect related concepts
6. **Include "why" context** — rationale matters more than raw facts
7. **Group by domain** — use subdirectories for related concepts
8. **Front-load searchable text** — search indexes the title, description, tags, and the first ~500 characters of the body

## Generation from External Sources

### Source Code Repository
Analyze code structure → generate OKF concepts for architecture, services, data models.

### Documentation / Wiki Pages
Parse → split into atomic concepts → generate with appropriate types.

### Conversation Context
Extract key decisions, architecture discussions, or procedures from conversation → create structured concepts.

### URL Pattern Detection
Auto-suggest OKF capture when these patterns appear:
- `github.com/*` or `gitlab.com/*` → repo documentation
- `*.notion.site/*` → Notion page capture
- `docs.*` or `wiki.*` → documentation sites

## Auto-Capture Safety

When `autoCapture` is enabled in plugin config (also requires
`plugins.entries.okf.hooks.allowConversationAccess: true`):

1. **Requires BOTH signals** — user intent (asking to document, sharing for reference) AND assistant content (substantial, structured knowledge)
2. **Never capture reasoning artifacts** — model chain-of-thought, thinking traces, or internal deliberation are NOT knowledge
3. **Never capture casual conversation** — only structured, documentable content
4. **Minimum length threshold** — `autoCaptureMinChars` (default 500) prevents trivial captures
5. **User controls types** — `autoCaptureTypes` limits what categories are eligible
6. **Suggestion only** — a matched turn queues a suggestion into the next turn's context; the agent decides whether to call `okf_write`

## Merge Strategy

When importing from external sources into an existing bundle:
1. Place under `.okf/<source-name>/` to avoid path conflicts
2. Check bundle health with `okf_validate` before and after writing
3. Use `okf_write_batch` for efficiency
4. Cross-link new concepts to existing ones in the body where relevant
