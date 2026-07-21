---
type: Decision Record
title: "001: OKF Spec Alignment"
description: Why v0.3.0 relaxed bundle validation and standardized cross-linking on body markdown links.
tags: [decision, okf-spec, validation]
timestamp: 2026-07-21T10:30:00Z
---

# Context

Before v0.3.0 the plugin drifted from the OKF v0.1 spec in three ways:

1. `okf_validate` treated a missing `okf_version` in the root `index.md` as a
   fatal **error**, while the spec (§11) makes the declaration optional and
   §9 forbids rejecting bundles over missing optional frontmatter. Worse, a
   second check warned that *any* `index.md` frontmatter was invalid — so a
   conformant bundle could receive an error and a contradictory warning at
   the same time.
2. The bundled skill and IDE rules taught agents an invented frontmatter
   contract (`id` and `links:` fields) that neither the spec nor the indexer
   recognized, so agent-authored cross-links were silently ignored.
3. `okf_write` interpolated titles/descriptions/tags into frontmatter
   unescaped, so agent-supplied values containing newlines or YAML
   indicators corrupted documents.

# Decision

* Validation follows the spec's permissive consumption model: only a missing
  `type` field, unparseable frontmatter, and reserved-name misuse are errors;
  everything else (including `okf_version`) is a warning at most. The
  bundle-root `index.md` is the single place frontmatter (only
  `okf_version`) is permitted.
* Cross-linking is done exclusively with markdown links in the concept body
  (bundle-relative preferred, i.e. a link target like `/tables/users.md`),
  matching what the indexer parses. All docs, rules, and the skill teach this
  one contract.
* The write path escapes/quotes all frontmatter scalars (`yamlScalar`) and
  sanitizes tags, shared between `okf_write` and `okf_write_batch`.

# Consequences

* Bundles produced by other OKF tools validate cleanly instead of failing on
  optional fields.
* Agent-written concepts round-trip safely regardless of punctuation in
  titles.
* Existing bundles that used a `links:` frontmatter field keep working (the
  field is preserved as an unknown key per spec) but the links only enter
  the graph when also present as body links.

See the [Plugin Overview](/architecture/plugin-overview.md) for where these
checks live in the module layout.
