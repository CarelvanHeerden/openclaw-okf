---
type: Architecture
title: Plugin Overview
description: How openclaw-okf registers with the OpenClaw gateway and what each module does.
tags: [plugin, architecture, openclaw]
resource: src/index.ts
timestamp: 2026-07-21T10:30:00Z
---

# Overview

The plugin exports a single `definePluginEntry` from `src/index.ts` with
`id: "okf"`. Everything registers inside `register(api)`:

| Surface | Registration | Source |
|---|---|---|
| Hooks | `api.on("before_prompt_build" / "agent_end" / "gateway_start" / "gateway_stop")` | `src/index.ts` |
| Agent tools | `api.registerTool(...)` for `okf_search`, `okf_read`, `okf_write`, `okf_write_batch`, `okf_list`, `okf_validate` (+ `okf_corpus_search` behind `corpusSupplement`) | `src/tools.ts` |
| CLI | `api.registerCli(...)` → `openclaw okf list/search/validate/stats/index` | `src/index.ts` |

All registered tools are declared in `openclaw.plugin.json` `contracts.tools`
(required by the gateway). Tool parameter schemas use TypeBox
(`@sinclair/typebox`), the plugin SDK's documented schema format.

# Modules

* `indexer.ts` — recursive `.md` scan, inverted index with IDF scoring,
  `fs.watch`-based reindexing. Search text = title + description + tags +
  first 500 chars of the body.
* `parser.ts` — lightweight YAML frontmatter parser (scalars, inline/dash
  arrays, quoted values, inline comments) and markdown link extraction
  (bundle-relative and relative links, anchor fragments stripped).
* `recall.ts` — auto-recall for `before_prompt_build`: keyword extraction,
  relevance gates (`minMatchedTokens`, `minRecallScore`,
  `recallRelevanceRatio`), graph traversal up to `graphDepth` hops.
* `capture.ts` — keyword triggers (always on) and auto-capture heuristics
  (feature-flagged; suggestion-only, injected into the next turn).
* `validator.ts` — OKF v0.1 conformance checks; permissive per §9 of the
  spec (broken links and missing recommended fields are warnings).
* `tools.ts` — agent tool implementations, shared write path with YAML
  escaping, and allowlist-based concept path validation.

# Data Flow

Prompt → `before_prompt_build` → keyword extraction → index search →
relevance gates → graph expansion → markdown context injected via
`appendContext` (budgeted by `maxRecallChars`).

Writes via `okf_write` go through `validateConceptPath` (traversal and
reserved-name checks) and `yamlScalar` escaping, then trigger a debounced
reindex. See [001: OKF Spec Alignment](/decisions/001-spec-alignment.md) for
why the write path escapes frontmatter values.
