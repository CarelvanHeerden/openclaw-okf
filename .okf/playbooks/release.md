---
type: Playbook
title: Release Process
description: Steps to cut and publish a release of the openclaw-okf plugin.
tags: [release, playbook, clawhub]
timestamp: 2026-07-21T10:30:00Z
---

# Steps

1. Ensure a clean build and passing tests:

   ```bash
   npm run build && npm test
   ```

2. Bump the version in **both** `package.json` and `openclaw.plugin.json`
   (keep them in sync), and add a dated entry to `CHANGELOG.md`.
3. Rebuild so the committed `dist/` matches `src/` exactly:

   ```bash
   npm run build
   ```

4. Commit everything (source, dist, docs, lockfile) and tag:

   ```bash
   git tag v<version>
   git push origin main --tags
   ```

5. Publish to ClawHub. Consumers can also install straight from git:

   ```bash
   openclaw plugins install git:github.com/CarelvanHeerden/openclaw-okf
   ```

# Notes

* `dist/` is committed intentionally so git-based installs work without a
  build step — never commit source changes without rebuilding.
* The npm artifact ships `dist`, `skills`, `openclaw.plugin.json`, `README.md`,
  and `LICENSE` (see `files` in `package.json`).
* Runtime dependency: `@sinclair/typebox` (tool parameter schemas).

See the [Plugin Overview](/architecture/plugin-overview.md) for the module
layout.
