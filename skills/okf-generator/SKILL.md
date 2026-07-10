# OKF (Open Knowledge Format) — Agent Skill

Structured knowledge bundles with auto-recall, graph traversal, and agent tools.

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

```
okf_write(id, title, type, body, tags?, links?, resource?, description?)
```

- `id`: path-like identifier (e.g., `architecture/auth-flow`, `decisions/2026-03-db-choice`)
- `type`: one of the types below
- `body`: markdown content (the actual knowledge)
- `tags`: array of searchable tags
- `links`: array of other concept IDs this relates to
- `resource`: source URI if capturing from external content

### `okf_write_batch` — Bulk Import
Use when: importing 5+ concepts at once (repo analysis, documentation extraction, migration).

```
okf_write_batch(concepts: Array<{id, title, type, body, tags?, links?}>)
```

More efficient than calling `okf_write` in a loop — single index rebuild.

### `okf_search` — Keyword Search
Searches concept titles, tags, body text. Returns ranked matches.

### `okf_corpus_search` — Corpus Supplement Mode
Only available when `corpusSupplement: true` in plugin config. Exposes OKF search in a `memory_search`-compatible format for use by other plugins (e.g., hybrid-memory corpus supplement).

### `okf_read` — Read a Concept
Fetch full content of a concept by ID.

### `okf_list` — List Concepts
List all concepts, optionally filtered by type or tags.

### `okf_validate` — Validate Bundle
Check bundle integrity: broken links, missing frontmatter, orphaned files.

## Concept Types

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
├── index.md              # Bundle manifest (auto-generated)
├── architecture/          # System design concepts
│   ├── auth-flow.md
│   └── data-pipeline.md
├── modules/               # Component-level docs
├── data-models/           # Schema definitions
├── decisions/             # Decision records (YYYY-MM-DD-*.md)
├── playbooks/             # Operational runbooks
└── integrations/          # Third-party service docs
```

### Frontmatter Contract

Every concept file requires YAML frontmatter:

```yaml
---
id: "architecture/auth-flow"
type: "Architecture"
title: "Authentication Flow"
description: "OAuth2 + PKCE flow for API authentication"
tags: [auth, oauth, security, api]
resource: "https://github.com/org/repo/docs/auth.md"  # optional
links:
  - modules/api-gateway
  - data-models/user-session
---
```

Required fields: `id`, `type`, `title`
Recommended: `description`, `tags`, `links`
Optional: `resource`

## Content Rules

1. **One concept per file** — don't create mega-files
2. **Max ~500 lines per concept** — split if larger
3. **Extract actual values** — IPs, ports, paths, env var names (not secrets)
4. **Preserve code blocks** — include full source for scripts
5. **Add cross-links** — use `links:` to connect related concepts
6. **Include "why" context** — rationale matters more than raw facts
7. **Group by domain** — use subdirectories for related concepts

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

When `autoCapture` is enabled in plugin config:

1. **Requires BOTH signals** — user intent (asking to document, sharing for reference) AND assistant content (substantial, structured knowledge)
2. **Never capture reasoning artifacts** — model chain-of-thought, thinking traces, or internal deliberation are NOT knowledge
3. **Never capture casual conversation** — only structured, documentable content
4. **Minimum length threshold** — `autoCaptureMinChars` (default 500) prevents trivial captures
5. **User controls types** — `autoCaptureTypes` limits what categories are eligible

## Merge Strategy

When importing from external sources into an existing bundle:
1. Place under `.okf/<source-name>/` to avoid ID conflicts
2. Check for duplicate concept IDs with `okf_validate` before writing
3. Use `okf_write_batch` for efficiency
4. Cross-link new concepts to existing ones where relevant
