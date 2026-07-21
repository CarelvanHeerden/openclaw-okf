import { describe, it, expect } from "vitest";
import { validateBundle } from "../src/validator.js";
import type { BundleIndex, ConceptMeta } from "../src/types.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

let bundleCounter = 0;

function createTestBundle(files: Record<string, string>): { path: string; cleanup: () => void } {
  const dir = join(tmpdir(), `okf-test-${Date.now()}-${bundleCounter++}`);
  mkdirSync(dir, { recursive: true });
  
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
  
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createMockIndex(
  bundlePath: string,
  concepts: Record<string, Partial<ConceptMeta>>
): BundleIndex {
  const map = new Map<string, ConceptMeta>();
  for (const [id, partial] of Object.entries(concepts)) {
    map.set(id, {
      id,
      filePath: join(bundlePath, `${id}.md`),
      type: partial.type ?? "Infrastructure",
      title: partial.title ?? id,
      description: partial.description,
      resource: partial.resource,
      tags: partial.tags ?? [],
      timestamp: partial.timestamp,
      linksTo: partial.linksTo ?? [],
      linkedFrom: partial.linkedFrom ?? [],
      mtime: Date.now(),
      searchText: `${partial.title ?? id} ${partial.description ?? ""}`.toLowerCase(),
    });
  }
  return {
    concepts: map,
    invertedIndex: new Map(),
    indexedAt: Date.now(),
    bundlePath,
  };
}

describe("validateBundle", () => {
  it("validates a real bundle on disk", async () => {
    const bundle = createTestBundle({
      "index.md": `---
okf_version: "0.1"
---

Test bundle index.
`,
      "services/auth.md": `---
type: "Service"
title: "Auth Service"
description: "Handles authentication"
tags: [auth, service]
---

Auth service docs.
`,
    });

    try {
      const index = createMockIndex(bundle.path, {
        "services/auth": {
          type: "Service",
          title: "Auth Service",
          description: "Handles authentication",
          tags: ["auth", "service"],
        },
      });

      const result = await validateBundle(bundle.path, index);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    } finally {
      bundle.cleanup();
    }
  });

  it("detects broken links in concepts", async () => {
    const bundle = createTestBundle({
      "index.md": "# Test\n",
    });

    try {
      const index = createMockIndex(bundle.path, {
        "services/auth": {
          type: "Service",
          title: "Auth Service",
          linksTo: ["nonexistent/concept"],
        },
      });

      const result = await validateBundle(bundle.path, index);
      const brokenLinkWarnings = result.warnings.filter((w) => w.type === "broken-link");
      expect(brokenLinkWarnings.length).toBe(1);
      expect(brokenLinkWarnings[0]!.message).toContain("nonexistent/concept");
      // Broken links are warnings, never errors (spec §5.3 / §9)
      expect(result.valid).toBe(true);
    } finally {
      bundle.cleanup();
    }
  });

  it("treats a frontmatter-less root index.md as conformant (warning only)", async () => {
    const bundle = createTestBundle({
      "index.md": "# Bundle\n\n* [A concept](concept.md) - something\n",
      "concept.md": `---
type: "Playbook"
title: "A Concept"
description: "Body"
---

Body.
`,
    });

    try {
      const index = createMockIndex(bundle.path, {
        concept: { type: "Playbook", title: "A Concept", description: "Body" },
      });

      const result = await validateBundle(bundle.path, index);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      const versionWarnings = result.warnings.filter((w) => w.type === "missing-okf-version");
      expect(versionWarnings.length).toBe(1);
    } finally {
      bundle.cleanup();
    }
  });

  it("does not warn about frontmatter in the root index.md when it declares okf_version", async () => {
    const bundle = createTestBundle({
      "index.md": `---
okf_version: "0.1"
---

# Bundle
`,
    });

    try {
      const index = createMockIndex(bundle.path, {});
      const result = await validateBundle(bundle.path, index);
      expect(result.valid).toBe(true);
      expect(result.warnings.filter((w) => w.type === "reserved-file-frontmatter")).toEqual([]);
      expect(result.warnings.filter((w) => w.type === "missing-okf-version")).toEqual([]);
    } finally {
      bundle.cleanup();
    }
  });

  it("warns about frontmatter in non-root index.md files", async () => {
    const bundle = createTestBundle({
      "index.md": `---
okf_version: "0.1"
---
`,
      "api/index.md": `---
type: "Index"
title: "API"
---

# API
`,
    });

    try {
      const index = createMockIndex(bundle.path, {});
      const result = await validateBundle(bundle.path, index);
      const reservedWarnings = result.warnings.filter(
        (w) => w.type === "reserved-file-frontmatter"
      );
      expect(reservedWarnings.length).toBe(1);
      expect(reservedWarnings[0]!.filePath).toContain(join("api", "index.md"));
      // Still a warning, not an error
      expect(result.valid).toBe(true);
    } finally {
      bundle.cleanup();
    }
  });

  it("errors on a concept missing the required type field", async () => {
    const bundle = createTestBundle({
      "index.md": `---
okf_version: "0.1"
---
`,
      "broken.md": `---
title: "No Type Here"
---

Body.
`,
    });

    try {
      const index = createMockIndex(bundle.path, {});
      const result = await validateBundle(bundle.path, index);
      expect(result.valid).toBe(false);
      const typeErrors = result.errors.filter(
        (e) => e.type === "missing-type" || e.type === "invalid-frontmatter"
      );
      expect(typeErrors.length).toBeGreaterThan(0);
    } finally {
      bundle.cleanup();
    }
  });
});
