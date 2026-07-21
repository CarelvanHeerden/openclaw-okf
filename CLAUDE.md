# CLAUDE.md — OKF Documentation Instructions

This file instructs Claude Code and Claude-powered tools on how to maintain OKF (Open Knowledge Format) documentation in this and any project that adopts the OKF standard.

## What is OKF?

OKF is a structured knowledge format that uses markdown files with YAML frontmatter to create searchable, cross-linked knowledge bases. It's designed to be human-readable AND agent-readable — an AI assistant can search, read, and write OKF concepts to build persistent knowledge about a codebase.

## Core Principle

**Every significant piece of knowledge should be captured in OKF.** Code is temporary context — OKF makes knowledge persistent and searchable across sessions, tools, and team members.

## When to Generate OKF

### Automatically (every significant change):
- New service, module, or component → create `services/<name>.md` or `architecture/<name>.md`
- New API endpoint → create `api/endpoints/<name>.md`
- Database migration → update `architecture/data-model.md`
- New Docker service → update `deployment/docker.md`
- Architecture decision → create `architecture/decisions/NNN-<title>.md`
- New script or automation → create `scripts/<name>.md`
- Configuration change → update relevant concept or create `configuration/<name>.md`

### On request:
- "Document this" → create OKF for the discussed topic
- "Add to knowledge base" → same
- "What do we know about X?" → search OKF first, then code

## File Format

```yaml
---
type: "Architecture"          # REQUIRED (the only spec-required field)
title: "Auth Service"         # Recommended
description: "JWT-based auth" # Recommended
tags: [auth, jwt, security]   # Recommended (2+ tags)
resource: "src/auth/"         # Optional: path or URI
timestamp: "2026-07-21T10:00:00Z" # Optional: ISO 8601
---

# Auth Service

Content here. Use markdown. Include:
- Code blocks with actual config/commands
- Tables for structured data
- Cross-references as markdown links in the body,
  e.g. [auth endpoint](/api/endpoints/auth.md)
```

There is no `id` or `links:` frontmatter field — the concept ID is the file
path, and relationships are expressed as markdown links in the body.

## Concept Types

Use these standardized types:
- `Architecture` — system design, components, data flow
- `API Endpoint` — endpoints, request/response schemas
- `Data Model` — database schemas, entities, relationships
- `Service` — services, workers, background jobs
- `Infrastructure` — Docker, cloud, networking, deployment
- `Playbook` — operational procedures, runbooks
- `Script` — automation scripts, CLI tools
- `Decision Record` — ADRs (Architecture Decision Records)
- `Integration` — third-party service connections
- `Configuration` — env vars, feature flags, config
- `Recovery Procedure` — disaster recovery, rollbacks

## Directory Convention

```
.okf/
├── index.md                    # Always create this (listing; no frontmatter except root okf_version)
├── architecture/
│   ├── overview.md
│   ├── data-model.md
│   └── decisions/
│       └── 001-tech-stack.md
├── api/
│   └── endpoints/
├── services/
├── deployment/
├── playbooks/
├── scripts/
└── configuration/
```

`index.md` and `log.md` are reserved filenames at every level — never use
them for concept documents. The bundle-root `index.md` may declare
`okf_version: "0.1"` in frontmatter; no other frontmatter belongs in index
files — list entries as markdown links with short descriptions instead.

## Cross-Linking

Link concepts with standard markdown links in the body, preferably
bundle-relative (leading `/`, resolved against the bundle root):

```markdown
See the [data model](/architecture/data-model.md) for entity relationships.
The [auth service](/services/auth.md) issues the tokens described here.
```

Consumers (including this plugin's indexer) build the concept graph from
these body links.

## Best Practices

1. **Atomic concepts** — one file per concept, split large topics
2. **Real values** — include actual ports, paths, env var names (not placeholders)
3. **Code blocks** — include relevant config, commands, SQL
4. **Update with code** — OKF changes go in the same commit as code changes
5. **Delete stale docs** — remove OKF files for removed features
6. **ADR format** — for decisions, include: Context, Decision, Consequences
7. **Scripts get full source** — wrap the entire script in a fenced code block

## Integration with OpenClaw

When this `.okf/` directory is loaded by OpenClaw's OKF plugin:
- All concepts are indexed and searchable via `okf_search`
- Individual concepts are readable via `okf_read`
- The agent can write new concepts via `okf_write`
- Cross-links enable graph traversal of related knowledge
- File changes trigger automatic reindexing

## For Cursor / IDE Users

When vibe-coding with Cursor:
1. The `.cursor/rules/okf-documentation.mdc` file teaches Cursor to maintain OKF
2. As you build features, Cursor auto-generates corresponding OKF docs
3. Export the `.okf/` directory to share knowledge with OpenClaw or other agents
4. OKF files are just markdown — they render beautifully on GitHub/GitLab too
