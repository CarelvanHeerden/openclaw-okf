# OKF Generator Skill

Generate OKF (Open Knowledge Format) concept files from source code, documentation, APIs, or external content.

## When to Use

- User says "document this", "add to knowledge base", "create OKF"
- User shares a repo URL (GitHub, GitLab) for documentation
- User shares a Notion page or wiki link
- User asks to document architecture, APIs, or decisions
- After significant code changes that affect system knowledge

## Input Sources

### 1. Source Code Repository
```
Input: Git repo URL or local path
Process: Analyze code structure → generate OKF concepts
Output: .okf/ directory with organized concept files
```

### 2. Notion Pages
```
Input: Notion page URL (*.notion.site/* or notion.so/*)
Process: Fetch via Notion API → extract content → generate OKF
Output: .okf/<topic>/ concept files
```

### 3. Documentation Files
```
Input: Markdown, PDF, or HTML documentation
Process: Parse → split into atomic concepts → generate OKF
Output: .okf/<topic>/ concept files
```

### 4. Conversation Context
```
Input: Current conversation about architecture/decisions
Process: Extract key knowledge → create concept files
Output: .okf/ concept files with appropriate types
```

## Generation Rules

### Concept Splitting Strategy
1. **One concept per file** — don't create mega-files
2. **Maximum 500 lines per concept** — split if larger
3. **Group by domain** — use subdirectories for related concepts
4. **Preserve structure** — if the source has sections, map them to files

### Content Rules
1. Extract ACTUAL values — IPs, ports, paths, env vars, credentials references
2. Preserve code blocks, tables, and structured data
3. Add cross-links between related concepts
4. Include "why" context, not just "what"
5. For scripts: include the FULL source in a fenced code block

### Frontmatter Template
```yaml
---
type: "<type>"
title: "<descriptive title>"
description: "<one-line summary>"
tags: [<domain>, <technology>, <specific-tags>]
resource: "<source-uri>"  # optional
links:
  - <related-concept-id>
---
```

### Type Selection Guide
| Source Content | OKF Type |
|---|---|
| System design docs | `Architecture` |
| REST/GraphQL specs | `API Endpoint` |
| Database schemas | `Data Model` |
| Microservice docs | `Service` |
| Docker/K8s configs | `Infrastructure` |
| Runbooks/procedures | `Playbook` |
| Shell/Python scripts | `Script` |
| "Why we chose X" | `Decision Record` |
| Third-party API setup | `Integration` |
| Env vars, config files | `Configuration` |
| DR/rollback guides | `Recovery Procedure` |

## Integration with OpenClaw

After generating OKF files, they should be placed in the agent's `.okf/` bundle directory. The OKF plugin automatically:
- Detects file changes via the watcher
- Reindexes all concepts
- Makes them searchable via `okf_search`
- Enables graph traversal via cross-links

## Merge Strategy

When importing OKF from an external source into an existing bundle:
1. Place under `.okf/<source-name>/` to avoid conflicts
2. If the source already has `.okf/`, merge directly
3. Check for duplicate concept IDs before writing
4. Update the bundle `index.md` with new concepts

## URL Pattern Detection

Auto-suggest OKF capture when these URL patterns appear in conversation:
- `github.com/*` or `gitlab.com/*` → repo documentation
- `*.notion.site/*` or `notion.so/*` → Notion page capture
- `docs.*` or `wiki.*` → documentation capture
- `confluence.*` → wiki page capture
