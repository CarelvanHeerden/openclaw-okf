# OKF Plugin Usage Guide

This guide shows how to use the OKF plugin with OpenClaw.

## Setup

### 1. Build the Plugin

Since OpenClaw workspace plugins load TypeScript directly, you can skip the build step in development:

```bash
cd ~/.openclaw/workspace/openclaw-okf
```

The plugin will be automatically discovered by OpenClaw.

### 2. Enable in Config

Add to your `~/.openclaw/config.json`:

```json5
{
  "plugins": {
    "entries": {
      "okf": {
        "enabled": true,
        "config": {
          "bundlePath": ".okf",
          "autoRecall": true,
          "maxRecallChars": 1000,
          "maxRecallConcepts": 5,
          "graphDepth": 1,
          "watchChanges": true
        }
      }
    }
  }
}
```

### 3. Restart Gateway

```bash
openclaw gateway restart
```

### 4. Verify Installation

```bash
openclaw plugins list | grep okf
openclaw okf stats
```

## Creating Your First Concept

### Via File System

Create a file at `~/.openclaw/workspace/.okf/my-concept.md`:

```markdown
---
type: Concept
title: My First Concept
description: This is a test concept
tags: [test, example]
timestamp: 2026-07-03T20:00:00Z
---

# Overview

This is the body of my first OKF concept.

It can contain any markdown content:
- Lists
- **Bold text**
- `Code snippets`
- Links to other concepts: [Related Concept](/other-concept.md)

## Examples

```python
print("Hello from OKF!")
```
```

The file watcher will automatically reindex the bundle.

### Via Agent Tool

Ask your agent:

> "Create an OKF concept for our new authentication endpoint"

The agent will use `okf_write` to create the concept.

## Searching for Concepts

### Via CLI

```bash
# List all concepts
openclaw okf list

# Filter by directory
openclaw okf list --directory api

# Filter by type
openclaw okf list --type "API Endpoint"

# Search by text
openclaw okf search "authentication"
openclaw okf search "user data" --type "BigQuery Table"
```

### Via Agent

Ask your agent:

> "Search the knowledge base for authentication endpoints"

The agent will use `okf_search` and return relevant concepts.

### Via Auto-Recall

When `autoRecall: true`, relevant concepts are automatically injected into agent turns:

**You say:**
> "How do I authenticate users in our API?"

**Behind the scenes:**
The plugin extracts keywords ("authenticate", "users", "API"), searches the index, and injects relevant concepts:

```markdown
## Relevant Knowledge (OKF)

### User Authentication API (API Endpoint)
OAuth2 authentication endpoint for user login
Resource: https://api.example.com/v1/auth/login
Tags: auth, oauth, security, api
ID: `api/auth/login`
```

**Agent sees:**
The full prompt + the injected context, so it can answer with specific knowledge about your API.

## Reading Full Concepts

### Via CLI

```bash
# This doesn't exist yet, but you can read the files directly
cat ~/.openclaw/workspace/.okf/api/auth/login.md
```

### Via Agent

Ask your agent:

> "Show me the full documentation for the login endpoint"

The agent will use `okf_read` with the concept ID.

## Validating Your Bundle

### Via CLI

```bash
# Validate entire bundle
openclaw okf validate

# Validate specific concept
openclaw okf validate --path api/auth/login
```

### What Gets Validated

Per OKF v0.1 spec (§9-10):

**Errors (fatal):**
- Missing required `type` field in frontmatter
- Invalid frontmatter YAML syntax
- Reserved filename (`index.md`, `log.md`) used as concept

**Warnings (non-fatal):**
- Missing recommended fields (`title`, `description`)
- Broken cross-links to non-existent concepts
- Invalid ISO 8601 timestamp format

## Bundle Structure Best Practices

### Organize by Domain

```
.okf/
├── api/
│   ├── auth/
│   ├── users/
│   └── orders/
├── tables/
│   ├── core/
│   └── sales/
├── playbooks/
│   ├── incidents/
│   └── deployments/
└── metrics/
    ├── business/
    └── technical/
```

### Use Consistent Types

Pick type names that are self-explanatory:

- `API Endpoint`
- `BigQuery Table`
- `Snowflake Table`
- `Database Schema`
- `Metric Definition`
- `Playbook`
- `Runbook`
- `Architecture Decision`
- `Design Document`

### Cross-Link Liberally

Use markdown links to connect related concepts:

```markdown
See also: [User Profile API](/api/users/profile.md)
```

Both absolute (`/path/to/concept.md`) and relative (`../other-concept.md`) links work.

### Add Rich Metadata

Use all the optional frontmatter fields:

```yaml
---
type: API Endpoint
title: User Authentication
description: OAuth2 password grant authentication endpoint
resource: https://api.example.com/v1/auth/login
tags: [auth, oauth, security, critical, public-api]
timestamp: 2026-07-03T20:00:00Z
owner: auth-team
version: v1
status: stable
---
```

OKF allows any additional fields - they're preserved and searchable.

## Advanced Usage

### Progressive Disclosure with index.md

Create `index.md` files to provide directory overviews:

```markdown
# API Endpoints

This directory contains documentation for all public API endpoints.

## Authentication

* [Login](/api/auth/login.md) - OAuth2 authentication
* [Refresh](/api/auth/refresh.md) - Token refresh

## Users

* [Profile](/api/users/profile.md) - User profile management
```

### Change History with log.md

Track changes with `log.md`:

```markdown
# API Documentation Changelog

## 2026-07-03

* **Update**: Added rate limiting details to [Login](/api/auth/login.md)
* **Creation**: Added new [Logout](/api/auth/logout.md) endpoint

## 2026-07-02

* **Update**: Refreshed schema for [Users Table](/tables/users.md)
```

### External Citations

Link to external sources:

```markdown
# Citations

[1] [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
[2] [Internal Security Wiki](https://wiki.example.com/security)
[3] [API Design Guidelines](https://github.com/example/api-guidelines)
```

### Concept Types Examples

**Data Assets:**
- `BigQuery Table`
- `Snowflake Table`
- `S3 Bucket`
- `Kafka Topic`
- `Redis Cache`

**API/Services:**
- `REST API Endpoint`
- `GraphQL Query`
- `gRPC Service`
- `WebSocket Endpoint`

**Processes:**
- `ETL Pipeline`
- `Deployment Runbook`
- `Incident Response Playbook`
- `Data Quality Check`

**Metadata:**
- `Metric Definition`
- `Business Term`
- `Data Dictionary Entry`
- `Architecture Decision Record`

## Troubleshooting

### Plugin Not Loading

```bash
# Check plugin status
openclaw plugins list

# Check logs
openclaw gateway logs | grep okf
```

### Index Not Building

```bash
# Manually rebuild index
openclaw okf index

# Check bundle path
ls -la ~/.openclaw/workspace/.okf/
```

### Auto-Recall Not Working

1. Verify `autoRecall: true` in config
2. Check that concepts exist: `openclaw okf stats`
3. Test search manually: `openclaw okf search "your query"`
4. Check gateway logs for errors

### File Watcher Not Triggering

If changes to `.okf/` files don't trigger reindex:

1. Check `watchChanges: true` in config
2. Restart gateway: `openclaw gateway restart`
3. Manually reindex: `openclaw okf index`

### Validation Errors

If `openclaw okf validate` reports errors:

**Missing type field:**
```yaml
---
# ❌ Missing
title: My Concept

# ✅ Required
type: Concept
title: My Concept
---
```

**Invalid frontmatter:**
```yaml
---
type: Concept
tags: [incomplete array
# ❌ Unclosed array

# ✅ Valid
type: Concept
tags: [tag1, tag2]
---
```

**Reserved filename:**
```
# ❌ Don't create concepts named:
.okf/index.md       # Reserved for directory listing
.okf/api/index.md   # Reserved for directory listing
.okf/log.md         # Reserved for change history

# ✅ Use any other name:
.okf/overview.md
.okf/api/endpoints.md
.okf/changelog.md
```

## Integration Examples

### With Memory Plugin

OKF complements the memory plugin:

- **Memory**: Facts about the user, recent context, short-term observations
- **OKF**: Structured domain knowledge, documentation, long-term reference

Use both together for a complete knowledge system.

### With Task Flows

Create OKF concepts for common workflows:

```yaml
---
type: Task Flow Template
title: API Deployment Process
tags: [deployment, workflow]
---

# Steps

1. Run tests: `npm test`
2. Build: `npm run build`
3. Tag release: `git tag v1.2.3`
4. Deploy: `./scripts/deploy.sh`

# Rollback

If deployment fails, rollback with: `./scripts/rollback.sh`
```

Agents can reference this during deployments.

### With External Systems

Use `resource` field to link concepts to external systems:

```yaml
---
type: Monitoring Dashboard
title: API Performance Dashboard
resource: https://grafana.example.com/d/api-perf
tags: [monitoring, performance]
---
```

Agents can direct you to the right dashboard when investigating issues.

## Performance Considerations

### Index Size

- **Small bundle** (<100 concepts): Instant indexing, negligible memory
- **Medium bundle** (100-1000 concepts): <1s indexing, ~10MB memory
- **Large bundle** (1000-10000 concepts): ~5s indexing, ~100MB memory

### Auto-Recall Budget

Adjust based on your model's context window:

```json5
{
  "maxRecallChars": 2000,  // ~500 tokens for GPT-4
  "maxRecallConcepts": 5   // Max 5 concept summaries
}
```

For large context models (Claude 3.5 Sonnet), you can increase these:

```json5
{
  "maxRecallChars": 8000,
  "maxRecallConcepts": 15
}
```

### File Watching

The file watcher triggers reindex on every `.md` file change. For frequent edits, consider:

1. Disable watching: `"watchChanges": false`
2. Edit concepts
3. Manually reindex: `openclaw okf index`

## Next Steps

1. **Populate your bundle**: Add concepts for your APIs, databases, processes
2. **Test auto-recall**: Ask agent questions and watch it pull in relevant concepts
3. **Build workflows**: Create playbook/runbook concepts for common tasks
4. **Integrate with memory**: Use both systems together for comprehensive AI context
5. **Share bundles**: OKF bundles are just markdown in git - easy to share and version

## Resources

- [OKF Specification v0.1](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/plugins)
- [Example Bundle](./.okf/) - See the included example concepts

## Feedback

This plugin is a scaffold implementation. Extend it with:

- Vector embeddings for semantic search
- UI visualization of the concept graph
- Export to other formats (JSON, GraphQL schema, OpenAPI)
- Import from existing documentation tools
