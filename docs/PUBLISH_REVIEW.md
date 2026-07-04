# OpenClaw OKF Plugin — Pre-Publication Review

**Reviewer**: Independent Critical Reviewer (Subagent)  
**Date**: 2026-07-04  
**Plugin Version**: 0.1.0  
**Repository**: `/home/node/.openclaw/workspace/openclaw-okf/`

---

## Executive Summary

**VERDICT: ⚠️ HOLD — NOT READY FOR PUBLIC RELEASE**

This plugin has **3 CRITICAL blockers** and **11 HIGH-severity issues** that must be fixed before publication. The core concept is solid, the code is well-structured, and the OKF spec compliance is good — but there are significant gaps in dependency management, testing, documentation accuracy, and OpenClaw compatibility verification.

**Key Concerns:**
1. **No runtime dependencies declared** — plugin will fail at runtime
2. **No OpenClaw version testing** — compatibility claims are unverified
3. **dist/ shipped in git** — wrong build artifact strategy
4. **README contradicts reality** — multiple factual errors about features
5. **Missing LICENSE file** — legally ambiguous

**Recommendation**: Fix critical issues, test against actual OpenClaw instance, then resubmit for review.

---

## CRITICAL Issues (MUST FIX)

### C1. Missing Runtime Dependencies — Plugin Will Crash

**Severity**: CRITICAL  
**Location**: `package.json`  
**Current state**:
```json
{
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^26.1.0",
    "typescript": "^6.0.3"
  }
}
```

**Problem**:
The plugin imports from `openclaw/plugin-sdk/*` and `@sinclair/typebox`, but declares ZERO runtime dependencies. Running `npm ls` shows `(empty)`.

**Why this is critical**:
- Plugin SDK imports will fail at runtime with `Cannot find module 'openclaw/plugin-sdk/plugin-entry'`
- TypeBox schemas for tools will fail with `Cannot find module '@sinclair/typebox'`
- Plugin will crash gateway on startup

**Evidence from code**:
```typescript
// src/index.ts:8
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// src/tools.ts (implied)
// Uses Type.Object, Type.String from @sinclair/typebox
```

**Fix**:
```json
{
  "dependencies": {
    "@sinclair/typebox": "^0.32.0"
  },
  "peerDependencies": {
    "openclaw": ">=2026.3.24-beta.2"
  }
}
```

**Note**: OpenClaw plugins should use `peerDependencies` for `openclaw`, not regular `dependencies`, because the plugin SDK is provided by the host gateway.

**Verification needed**:
1. Install actual OpenClaw gateway
2. Install this plugin as external (`openclaw plugins install ./openclaw-okf`)
3. Restart gateway and check logs for module errors

---

### C2. Compatibility Claims Unverified

**Severity**: CRITICAL  
**Location**: `package.json`, `openclaw.plugin.json`, README

**Claims**:
```json
// package.json
"openclaw": {
  "compat": {
    "pluginApi": ">=2026.3.24-beta.2",
    "minGatewayVersion": "2026.3.24-beta.2"
  },
  "build": {
    "openclawVersion": "2026.3.24-beta.2",
    "pluginSdkVersion": "2026.3.24-beta.2"
  }
}
```

**Problem**:
1. **No evidence of testing** against OpenClaw `2026.3.24-beta.2` or any version
2. **No OpenClaw installation** found in workspace
3. **Compatibility matrix in README** references `Plugin API >=2026.3.24-beta.2` but this is NEVER verified
4. **SDK import paths** (`openclaw/plugin-sdk/plugin-entry`) are assumed valid but NEVER tested

**Why this is critical**:
If the plugin API changed between the documented version and the current OpenClaw release, this plugin will:
- Fail to register tools correctly
- Crash on hook execution
- Break gateway startup

**Evidence gaps**:
- No `openclaw` binary in PATH
- No OpenClaw dependency in workspace
- AUDIT_REPORT.md (line ~35) mentions "need to verify SDK import paths" but never does it
- No test logs showing successful plugin load

**Fix**:
1. Install OpenClaw gateway (Docker or binary)
2. Load this plugin: `openclaw plugins install --link .`
3. Verify startup logs show: `OKF plugin initializing with bundle path: ...`
4. Verify tools are registered: `openclaw plugins inspect okf --runtime --json`
5. Test each tool via agent
6. Document tested version in README

**Until this is done**, remove version claims from README or mark them as "Target version (untested)".

---

### C3. Compiled JavaScript in Git Repository

**Severity**: CRITICAL (for open-source hygiene)  
**Location**: `dist/` directory, `.gitignore`

**Current state**:
```bash
$ ls dist/
capture.ts  config.d.ts  config.js  index.d.ts  index.js  indexer.d.ts  ...
# 30+ compiled files committed to git
```

**Problem**:
1. `dist/` is tracked in git (not in `.gitignore`)
2. Compiled JavaScript (`.js`, `.d.ts`, `.js.map`) files are committed
3. Source TypeScript files are ALSO in `dist/` (e.g., `dist/capture.ts`)

**Why this is critical**:
- **Stale builds**: dist/ can become out of sync with src/
- **Merge conflicts**: Generated files cause conflicts in PRs
- **Security risk**: Attacker can modify dist/ without touching src/
- **Bundle bloat**: npm package will include redundant files
- **Wrong pattern**: OpenClaw plugins should publish source OR dist, not both

**Standard plugin pattern** (from OpenClaw docs):
- External plugins: Ship compiled `dist/` via npm, `.gitignore` it in source control
- Workspace plugins: Can load TypeScript directly, skip compilation

**Fix**:
```bash
# Add to .gitignore
dist/

# Remove from git
git rm -r --cached dist/
git commit -m "chore: remove compiled artifacts from git"

# Update README
"## Installation
npm install  # installs dependencies
npm run build  # compiles TypeScript
"
```

**Alternative** (if you want to keep dist/ for convenience):
Document this as a "development repo" pattern and clarify that published npm package will be different.

---

## HIGH Priority Issues

### H1. README Factual Errors — autoRecall Default Wrong

**Severity**: HIGH  
**Location**: `README.md`

**README claims** (line 36):
```markdown
"autoRecall": false,       // Set true to auto-inject concepts into turns
```

**But openclaw.plugin.json says** (line 22):
```json
"autoRecall": {
  "type": "boolean",
  "default": false,
  "description": "Automatically recall relevant OKF concepts before agent turns. Disabled by default to avoid context budget competition with hybrid-memory. Enable only if you want OKF concepts auto-injected into every turn."
}
```

**And config.ts says** (line 9):
```typescript
export const DEFAULT_CONFIG: OkfConfig = {
  bundlePath: ".okf",
  autoRecall: false,  // ✓ Matches manifest
  ...
```

**Wait, these all match!** Let me re-check README...

Actually, **README line 36 is CORRECT**. False alarm here. The default is `false` everywhere. But...

**NEW ISSUE**: README example config (line 29-42) shows:
```json5
"config": {
  "bundlePath": ".okf",
  "autoRecall": false,       // Set true to auto-inject concepts into turns
  "maxRecallChars": 1000,
  "maxRecallConcepts": 5,
  "graphDepth": 1,
  "watchChanges": true,
  "autoCapture": false,       // Feature flag: auto-detect documentable knowledge
  ...
}
```

But the manifest `configSchema` says `maxRecallChars` default is **1000** (README says 1000 ✓) and `maxRecallConcepts` default is **5** (README says 5 ✓). These are correct.

**Actually found issue**: README claims (line 54):
```markdown
## Configuration
| `autoRecall`         | `boolean`  | `false` | Auto-inject relevant concepts before agent turns             |
```

But then later (line 155):
```markdown
## Auto-Recall

When `autoRecall` is enabled **(default)**, the plugin automatically injects relevant OKF concepts...
```

**Contradiction**: Line 54 says default is `false`, line 155 says it's enabled by default.

**Fix**: Change line 155 to:
```markdown
When `autoRecall` is enabled (disabled by default), the plugin automatically injects...
```

---

### H2. console.log/console.error in Production Code

**Severity**: HIGH  
**Location**: `src/indexer.ts`, `src/index.ts`

**Found 30+ instances** of raw `console.log`/`console.error` calls in source:

```typescript
// src/indexer.ts:46
console.warn(`OKF index built with ${errors.length} error(s):`, errors.slice(0, 5));

// src/indexer.ts:138
console.error(`Failed to index ${fullPath}:`, error);

// src/indexer.ts:217
console.error("Bundle watcher error:", error);

// src/index.ts:229 (CLI command — OK)
console.log(`\nFound ${concepts.length} concept(s):\n`);
```

**Problem**:
1. **Core logic** (indexer, watcher) uses `console.*` instead of `api.logger`
2. Logs will not respect OpenClaw log levels
3. Cannot be filtered or captured by gateway logging
4. Breaks in environments where stdout/stderr are not available

**Distinction**:
- **CLI commands** (lines 229+): `console.log` is CORRECT (user-facing output)
- **Plugin hooks/internals**: Should use `api.logger.info/warn/error`

**Fix**:
Pass `api.logger` to `buildIndex()`, `watchBundle()`, and internal functions:

```typescript
// src/indexer.ts
export async function buildIndex(
  bundlePath: string,
  config: OkfConfig,
  logger: PluginLogger  // ADD THIS
): Promise<BundleIndex> {
  // Replace console.warn with:
  logger.warn(`OKF index built with ${errors.length} error(s):`, errors.slice(0, 5));
  ...
}

// src/index.ts:48
currentIndex = await buildIndex(bundlePath, config, api.logger);
```

Repeat for all non-CLI uses of `console.*`.

---

### H3. Missing Test Coverage — Zero Tests

**Severity**: HIGH  
**Location**: None (tests don't exist)

**Problem**:
- No `test/` directory
- No test script in `package.json`
- CHANGELOG claims "Manual testing with example bundle" but no evidence
- COMPLETION_REPORT mentions "⏸️ Automated unit tests (future enhancement)"

**Why this matters**:
1. Cannot verify OKF spec conformance claims
2. Cannot test edge cases (malformed YAML, broken links, path traversal attacks)
3. Cannot regression test after fixes
4. Violates OpenClaw plugin best practices (docs say "Tests pass" in checklist)

**Minimum tests needed**:
1. **Parser tests**: Valid/invalid frontmatter, edge cases
2. **Validator tests**: OKF spec conformance (required fields, reserved names)
3. **Path validation tests**: Ensure `okf_write` rejects `../../../etc/passwd`
4. **Search tests**: Tokenizer, TF-IDF scoring, relevance
5. **Tool tests**: Mock tool execution, verify outputs

**Fix**:
```bash
mkdir test
npm install --save-dev vitest @openclaw/plugin-testing-utils
```

Create `test/parser.test.ts`, `test/validator.test.ts`, etc.

Add to `package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

---

### H4. No LICENSE File — Legally Ambiguous

**Severity**: HIGH  
**Location**: Missing file

**Current state**:
- `package.json` claims `"license": "MIT"` (line 24)
- No `LICENSE` or `LICENSE.md` file in repository
- CHANGELOG says "## License: MIT" but no legal text

**Problem**:
Without a LICENSE file containing the full MIT license text, the repository is technically **unlicensed** (all rights reserved by default). This means:
- Users cannot legally use, modify, or redistribute the code
- npm registry may reject the package
- GitHub shows "No license" badge

**Fix**:
Create `LICENSE`:
```
MIT License

Copyright (c) 2026 [Your Name or Organization]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Update README to reference it:
```markdown
## License

MIT - see [LICENSE](LICENSE)
```

---

### H5. Path Validation Uses Blocklist (Should Be Allowlist)

**Severity**: HIGH  
**Location**: `src/tools.ts:221-253`

**Current approach** (blocklist):
```typescript
// Check for null bytes
if (decoded.includes("\0")) {
  return { valid: false, error: "Path contains null bytes" };
}

// Check for backslashes (Windows path separators)
if (decoded.includes("\\")) {
  return { valid: false, error: "Use forward slashes only" };
}

// Only allow alphanumeric, hyphens, underscores, forward slashes, dots in path segments
if (!/^[a-zA-Z0-9_\-/.]+$/.test(decoded)) {
  return { valid: false, error: "Path contains invalid characters..." };
}
```

**Problem**:
- **Blocklist security is weak**: "Only disallow X, Y, Z" always misses something
- Current regex `/^[a-zA-Z0-9_\-/.]+$/` allows:
  - `../../../etc/passwd` (blocked by later `relative()` check, but still passes regex)
  - Ambiguous paths like `foo//bar` or `./././foo`
  - Dots in the middle of filenames (acceptable for slugs, not malicious)

**Better approach** (allowlist):
```typescript
/**
 * Allowlist-based path validation.
 * Format: <dir>/<dir>/filename
 * Allowed characters per segment: alphanumeric, hyphen, underscore
 * No dots, no parent traversal, no absolute paths.
 */
function validateConceptPath(
  bundlePath: string,
  userPath: string
): { valid: boolean; resolved?: string; error?: string } {
  // Decode
  let decoded: string;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
    return { valid: false, error: "Invalid path encoding" };
  }
  
  // Normalize and check for suspicious patterns BEFORE resolving
  if (decoded.includes("..") || decoded.startsWith("/")) {
    return { valid: false, error: "Path must be relative and not contain .." };
  }
  
  // Split into segments and validate each
  const segments = decoded.split("/").filter(s => s.length > 0);
  if (segments.length === 0) {
    return { valid: false, error: "Path is empty" };
  }
  
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
      return { valid: false, error: `Invalid segment: ${segment}` };
    }
  }
  
  // Now safe to resolve
  const fullPath = resolve(bundlePath, `${decoded}.md`);
  const rel = relative(bundlePath, fullPath);
  
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { valid: false, error: "Path escapes bundle directory" };
  }
  
  return { valid: true, resolved: fullPath };
}
```

**Why allowlist is better**:
- Explicit about what's allowed (alphanumeric, hyphen, underscore per segment)
- Rejects ambiguous input (`//`, `./`, etc.) early
- Easier to audit ("Is this regex too permissive?" vs "Did I block everything?")

---

### H6. agent_end Hook Lacks Error Handling for Malformed Events

**Severity**: HIGH  
**Location**: `src/index.ts:147-189`

**Current code**:
```typescript
api.on(
  "agent_end",
  async (event) => {
    if (!currentIndex) return;
    
    try {
      // Safely extract user message and assistant response
      const userMessage = typeof event.prompt === "string" ? event.prompt : "";
      if (!userMessage) return;
      
      // Guard against malformed event structure
      const messages = Array.isArray(event.messages) ? event.messages : [];
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      if (!lastMessage) return;
      
      const assistantResponse = typeof lastMessage.content === "string"
        ? lastMessage.content
        : "";
```

**Good**: Guards against malformed events  
**Problem**: Still fragile if OpenClaw event structure changes

**Risk scenarios**:
1. `event.messages` is undefined (not an array or empty)
2. `lastMessage.content` is an array of content blocks (not a string)
3. `event.prompt` is an object (not a string)

**Current code handles #1 and #3**, but **#2 could fail silently** (empty string → skip analysis).

**Better approach**:
```typescript
// Handle content array (e.g., [{type: "text", text: "..."}])
let assistantResponse = "";
if (typeof lastMessage.content === "string") {
  assistantResponse = lastMessage.content;
} else if (Array.isArray(lastMessage.content)) {
  assistantResponse = lastMessage.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join(" ");
}
```

---

### H7. README Claims "Zero External Dependencies" — False

**Severity**: HIGH (documentation accuracy)  
**Location**: `README.md`, CHANGELOG.md

**README claims** (line ~520 implied from CHANGELOG):
> Zero external runtime dependencies (except OpenClaw SDK and TypeBox)

**CHANGELOG says** (line 175):
> #### Implementation Details
> - ✅ Zero external runtime dependencies (except OpenClaw SDK and TypeBox)

**Problem**: This is **self-contradictory**. You can't say "zero dependencies except these two dependencies."

**Accurate statement**:
> Minimal external dependencies: TypeBox for schema validation, OpenClaw SDK for plugin API (provided by host). No heavy frameworks or external services.

**Fix**: Update both files.

---

### H8. TypeScript Not Installed — Build Fails

**Severity**: HIGH (blocks testing)  
**Location**: `package.json`, `node_modules/`

**Current state**:
```bash
$ cd openclaw-okf
$ npm ls
@openclaw/okf@0.1.0 /home/node/.openclaw/workspace/openclaw-okf
`-- (empty)

$ npm run build
> tsc
sh: 1: tsc: not found
```

**Problem**:
1. `devDependencies` declares `typescript: ^6.0.3` but it's not installed
2. `npm install` was never run OR package-lock is stale
3. Build script fails immediately

**Why this matters**:
- Cannot compile the plugin
- Cannot test compiled output
- Cannot verify that TypeScript config is correct
- Blocks all verification steps

**Fix**:
```bash
npm install
npm run build
git add package-lock.json  # commit the lockfile
```

**Verify**: `dist/` should populate with `.js`, `.d.ts`, `.js.map` files.

---

### H9. Skill Documentation Misplaced

**Severity**: MEDIUM-HIGH  
**Location**: `skills/okf-generator/SKILL.md`

**Problem**:
The plugin ships with a `skills/okf-generator/SKILL.md` file that describes how to **generate OKF concepts from external sources** (repos, Notion, docs). This is a **usage skill for agents**, not plugin documentation.

**Confusion**:
1. Should this skill be in the **agent's workspace** (`~/.openclaw/workspace/skills/`), not in the plugin repo?
2. Or is this an example skill that gets installed alongside the plugin?
3. README never mentions this skill

**OpenClaw convention** (from docs):
- Agent skills go in `~/.openclaw/workspace/skills/`
- Plugin packages should not include agent skills unless they're explicitly registered via the plugin API

**Fix options**:
1. **Option A** (recommended): Move to `examples/` directory and document in README:
   ```
   examples/
     skills/
       okf-generator/
         SKILL.md  # "Example skill for generating OKF from external sources"
   ```

2. **Option B**: Register the skill via plugin API (requires skill registration support in SDK)

3. **Option C**: Remove from plugin, publish separately as a workspace skill package

---

### H10. CLAUDE.md and .cursor/rules — Wrong Audience

**Severity**: MEDIUM  
**Location**: `CLAUDE.md`, `.cursor/rules/okf-documentation.mdc`

**Current state**:
These files contain instructions for **Claude/Cursor AI coding assistants** on how to maintain OKF documentation in projects.

**Problem**:
1. These are **development tooling files**, not user-facing documentation
2. They pollute the published npm package
3. They reference "this project" but are written for **users of OKF**, not developers of the plugin

**Correct approach**:
- `CLAUDE.md` and `.cursor/` belong in **consumer projects** that use OKF, not in the plugin repo
- Plugin repo should have `CONTRIBUTING.md` (for plugin developers) instead

**Fix**:
```bash
# Add to .gitignore and .npmignore
CLAUDE.md
.cursor/

# Or move to examples/
examples/project-setup/CLAUDE.md
examples/project-setup/.cursor/rules/okf-documentation.mdc
```

Update README:
```markdown
## Example Project Setup

See `examples/project-setup/` for sample CLAUDE.md and Cursor rules to enable AI-assisted OKF documentation in your projects.
```

---

### H11. Audit Reports Should Be Internal

**Severity**: MEDIUM  
**Location**: `AUDIT_REPORT.md`, `REVIEW_ROUND2.md`, `COMPLETION_REPORT.md`

**Problem**:
These are **internal development artifacts** that document the plugin's creation and review process. They:
1. Reference unresolved issues that may confuse users
2. Contain reviewer opinions that aren't official documentation
3. Add 50KB+ of noise to the published package

**Recommendation**:
Move to `.internal/` directory and exclude from npm package:

```bash
mkdir .internal
mv AUDIT_REPORT.md REVIEW_ROUND2.md COMPLETION_REPORT.md .internal/
```

Add to `.npmignore`:
```
.internal/
```

**Alternative**: Keep them in git for transparency, but add a note in README:
```markdown
## Development History

See `.internal/` for audit reports and completion notes from the plugin's development process.
```

---

## MEDIUM Priority Issues

### M1. OpenClaw Version Tested Against — Undocumented

**Location**: README, package.json

**Problem**: README claims compatibility with `>=2026.3.24-beta.2` but never documents which version was **actually tested**.

**Fix**: Add to README:
```markdown
## Compatibility

- **Target**: OpenClaw `>=2026.3.24-beta.2`
- **Tested**: OpenClaw `2026.3.24-beta.2` (Docker, 2026-07-03)
- **OKF Spec**: v0.1
```

---

### M2. No .npmignore — Package Will Be Bloated

**Location**: Missing file

**Problem**: Without `.npmignore`, npm will publish:
- `AUDIT_REPORT.md` (28KB)
- `REVIEW_ROUND2.md` (27KB)
- `COMPLETION_REPORT.md` (10KB)
- `.cursor/` directory
- `CLAUDE.md`
- Potentially `dist/*.ts` source files alongside `.js` (if you keep dist/ in git)

**Fix**: Create `.npmignore`:
```
# Source (only ship dist/)
src/
tsconfig.json

# Development
.cursor/
CLAUDE.md
*.log
.DS_Store

# Internal docs
AUDIT_REPORT.md
REVIEW_ROUND2.md
COMPLETION_REPORT.md
.internal/

# Git
.git/
.gitignore
```

Then verify:
```bash
npm pack --dry-run
```

This will show what files npm would include.

---

### M3. CHANGELOG Version Semantics — 0.1.0 or 1.0.0?

**Location**: `CHANGELOG.md`, `package.json`

**Current version**: `0.1.0`  
**CHANGELOG says**: "## [0.1.0] - 2026-07-03 ### Initial Release"

**Question**: Is this a pre-1.0 beta or a stable release?

**Semantic Versioning guidance**:
- `0.x.x` = Unstable API, breaking changes allowed
- `1.0.0` = First stable release, semantic versioning starts

**Current plugin state**:
- Full OKF spec implementation
- 5 agent tools (stable contracts)
- Documentation claims production-ready

**Recommendation**:
If this is production-ready, bump to `1.0.0`. If it's still experimental, keep `0.1.0` but add to README:
```markdown
## Status

**Pre-1.0** — API is stable but may change based on feedback. Use in production at your own risk.
```

---

### M4. Skills Directory Not Documented in README

**Location**: `skills/okf-generator/`, README

**Problem**: The plugin includes a `skills/` directory with an agent skill, but README never mentions it.

**Fix**: Add section to README:
```markdown
## Included Skills

### OKF Generator Skill

Located at `skills/okf-generator/SKILL.md`, this agent skill provides patterns for generating OKF concepts from external sources (GitHub repos, Notion, documentation).

**To use**:
Copy to your agent workspace:
```bash
cp -r skills/okf-generator ~/.openclaw/workspace/skills/
```

The skill teaches agents to detect "document this" requests and create structured OKF concepts.
```

---

### M5. No CONTRIBUTING.md

**Location**: Missing file

**Problem**: Open-source projects should have contribution guidelines.

**Fix**: Create `CONTRIBUTING.md`:
```markdown
# Contributing to @openclaw/okf

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test: `npm test` (once tests exist)

## Code Style

- TypeScript with strict mode
- ESM modules
- Use `api.logger`, not `console.*` (except in CLI commands)

## Testing

- Add tests for new features
- Ensure all tests pass before submitting PR

## Pull Requests

- Follow conventional commits: `feat:`, `fix:`, `docs:`, etc.
- Update CHANGELOG.md
- Update README if adding features

## License

By contributing, you agree to license your contributions under MIT.
```

---

## LOW Priority Issues (Polish)

### L1. README Example Config Has JSON5 Comments

**Location**: README line 29-42

**Issue**: Example uses `// comments` (JSON5), but JSON parsers will fail.

**Fix**: Either:
1. Label it as "JSON5 (with comments for clarity)"
2. Remove comments and put them in a table below
3. Use YAML examples instead

---

### L2. No GitHub/GitLab Repository Link

**Location**: `package.json`, README

**Problem**: `package.json` has no `repository` field. Users won't know where to file issues or contribute.

**Fix**:
```json
"repository": {
  "type": "git",
  "url": "https://github.com/your-org/openclaw-okf"
},
"bugs": {
  "url": "https://github.com/your-org/openclaw-okf/issues"
}
```

---

### L3. No Package Keywords for Discovery

**Location**: `package.json`

**Current**:
```json
"keywords": [
  "openclaw",
  "okf",
  "open-knowledge-format",
  "knowledge-graph",
  "agent-memory"
]
```

**Suggestions to add**:
- `"plugin"`
- `"knowledge-base"`
- `"documentation"`
- `"agent-tools"`

---

## OpenClaw Plugin Standards Compliance

### Checklist (from `/app/docs/plugins/building-plugins.md`)

| Requirement | Status | Notes |
|------------|--------|-------|
| ✅ package.json has correct `openclaw` metadata | ⚠️ PARTIAL | Missing dependencies |
| ✅ openclaw.plugin.json manifest is present | ✅ PASS | Valid manifest |
| ✅ Entry point uses `definePluginEntry` | ✅ PASS | Correct usage |
| ✅ All imports use focused `plugin-sdk/<subpath>` | ✅ PASS | Clean imports |
| ✅ Tests pass | ❌ FAIL | No tests exist |
| ✅ `pnpm check` passes (in-repo) | ⚠️ N/A | External plugin |

### Plugin Manifest Validation

**openclaw.plugin.json**:
```json
{
  "id": "okf",
  "name": "OKF (Open Knowledge Format)",
  "description": "Structured knowledge bundles with auto-recall...",
  "contracts": {
    "tools": ["okf_search", "okf_read", "okf_write", "okf_list", "okf_validate"]
  },
  "activation": {
    "onStartup": true
  },
  "configSchema": { ... }
}
```

✅ **All required fields present**  
✅ **Tool contracts match registered tools** (verified in `src/tools.ts`)  
✅ **Config schema is valid JSON Schema**  
⚠️ **No `toolMetadata` for optional tools** (all tools are required, OK)

---

## Security Review

### Path Traversal (okf_write)

**Current mitigation**:
- `validateConceptPath()` checks for `..` after normalization
- Uses `relative()` to ensure path stays within bundle
- Decodes URL encoding

**Grade**: B+ (good but could be stronger with allowlist)

### YAML Parsing

**Custom parser** in `src/parser.ts`:
- No external dependencies (good for security)
- Simple regex-based parsing
- Could be vulnerable to malformed input causing hangs

**Recommendation**: Add input size limits:
```typescript
if (content.length > 1_000_000) {
  throw new Error("Concept file too large (>1MB)");
}
```

### Injection Risks

**Auto-recall injection**:
- Injects OKF content into agent prompts
- Could be exploited if attacker controls `.okf/` files
- **Mitigation**: OKF files are local-only (not fetched from URLs)

**Grade**: A- (low risk if bundle is trusted)

---

## Performance Review

### Indexing Performance

**Algorithm**: Recursive directory scan + inverted index build  
**Complexity**: O(n) files × O(m) tokens per file  
**Memory**: All concepts held in memory

**Scalability**:
- Small (<100 concepts): Instant
- Medium (100-1000): <1s
- Large (1000-10000): ~5s (per USAGE.md)

**Concern**: No index size limit. A 100K-concept bundle could use 1GB+ RAM.

**Recommendation**: Add config option:
```json
"maxConcepts": 10000  // Fail if bundle exceeds this
```

### Auto-Recall Budget

**Default**: 1000 chars, 5 concepts  
**Risk**: In worst case, injects 5KB+ per turn (5 concepts × 1000 chars each)

**Recommendation**: Document token cost in README:
```markdown
## Performance Considerations

Auto-recall adds ~500-2000 tokens per turn (depending on `maxRecallChars` and `maxRecallConcepts`). For large context models (Claude 3.5 Sonnet), you can increase these safely:

```json5
{
  "maxRecallChars": 8000,
  "maxRecallConcepts": 15
}
```

For smaller models, reduce to avoid context budget issues.
```

---

## Documentation Quality Assessment

### README.md

**Strengths**:
- Comprehensive (12KB)
- Good examples
- Clear configuration table
- Usage patterns well-explained

**Weaknesses**:
- Factual error (line 155: "enabled by default")
- No troubleshooting section
- No "Next Steps" after installation
- Missing version compatibility table

**Grade**: B+

### USAGE.md

**Strengths**:
- Very detailed (10KB)
- Covers CLI, tools, agent interactions
- Good troubleshooting section
- Performance considerations documented

**Weaknesses**:
- Duplicates some README content
- No quick-start (jumps straight to details)
- Missing "Common Patterns" section

**Grade**: A-

### CHANGELOG.md

**Strengths**:
- Detailed initial release notes
- Every feature documented
- Compatibility info included

**Weaknesses**:
- No comparison to future versions (it's the only version)
- "Known Limitations" section is good but hidden at bottom
- Should extract "Breaking Changes" section (even if none yet)

**Grade**: A

---

## Recommendations Summary

### MUST FIX (Before Publication)

1. **Add runtime dependencies** (`@sinclair/typebox`, peer dep on `openclaw`)
2. **Test against actual OpenClaw instance** (verify compatibility claims)
3. **Remove `dist/` from git** OR document "dev repo" pattern
4. **Add LICENSE file** (full MIT text)
5. **Fix console.log usage** (use `api.logger` in plugin internals)
6. **Add basic tests** (parser, validator, path validation)

### SHOULD FIX (For Professional Release)

7. Fix README factual error (line 155)
8. Improve path validation (allowlist approach)
9. Add error handling for malformed `agent_end` events
10. Fix "zero dependencies" claim
11. Install TypeScript and verify build works
12. Move/document skill files appropriately
13. Move CLAUDE.md and .cursor/ to examples or .internal
14. Create .npmignore
15. Document tested OpenClaw version

### NICE TO HAVE (Polish)

16. Add CONTRIBUTING.md
17. Add repository links to package.json
18. Version decision (0.1.0 vs 1.0.0)
19. Add input size limits for security
20. Add max concepts config limit
21. Document token cost of auto-recall

---

## Final Verdict

**NOT READY FOR PUBLIC RELEASE**

The plugin has a solid foundation and demonstrates good understanding of OKF spec and OpenClaw architecture, but has too many unverified claims and missing pieces to ship to real users.

**Estimated effort to fix critical issues**: 4-6 hours  
**Estimated effort to fix all HIGH issues**: 8-12 hours  
**Estimated effort for full polish**: 16-20 hours

**After fixes, this will be a high-quality plugin.** The core code is well-structured and the documentation is thorough. It just needs the final 20% of work to cross the finish line.

---

## Action Items (Prioritized)

### Phase 1: Make It Work (Critical)
1. [ ] `npm install` to get dependencies
2. [ ] Add runtime deps to package.json
3. [ ] Test plugin load in actual OpenClaw gateway
4. [ ] Fix any module resolution errors
5. [ ] Verify all 5 tools register successfully
6. [ ] Test one tool end-to-end (e.g., `okf_search`)

### Phase 2: Make It Safe (High)
7. [ ] Add LICENSE file
8. [ ] Fix console.log → api.logger in core code
9. [ ] Add error handling to agent_end hook
10. [ ] Create .npmignore
11. [ ] Remove dist/ from git (or document pattern)
12. [ ] Fix README errors

### Phase 3: Make It Professional (Polish)
13. [ ] Add 5-10 core tests
14. [ ] Add CONTRIBUTING.md
15. [ ] Document tested version
16. [ ] Add repository links
17. [ ] Review CHANGELOG for accuracy
18. [ ] Final README review

### Phase 4: Publish
19. [ ] `npm pack --dry-run` to verify package contents
20. [ ] Test install from tarball
21. [ ] Publish to npm or ClawHub
22. [ ] Announce in OpenClaw community

---

**End of Review**  
Questions? Check the line numbers and fix the issues in order of severity. Good luck! 🦞
