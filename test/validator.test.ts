import { describe, it, expect } from "vitest";
import { validateBundle } from "../src/validator.js";
import type { BundleIndex, ConceptMeta } from "../src/types.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

function createTestBundle(concepts: Record<string, string>): { path: string; cleanup: () => void } {
  const dir = join(tmpdir(), `okf-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  
  for (const [name, content] of Object.entries(concepts)) {
    const filePath = join(dir, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content);
  }
  
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function createMockIndex(concepts: Record<string, Partial<ConceptMeta>>): BundleIndex {
  const map = new Map<string, ConceptMeta>();
  for (const [id, partial] of Object.entries(concepts)) {
    map.set(id, {
      id,
      path: `${id}.md`,
      type: partial.type || "Infrastructure",
      title: partial.title || id,
      description: partial.description,
      tags: partial.tags || [],
      links: [],
      linksTo: partial.links || [],
      body: partial.body || "Content here.",
      frontmatter: {
        type: partial.type || "Infrastructure",
        title: partial.title,
        description: partial.description,
        tags: partial.tags || [],
        links: partial.links || [],
      },
      ...partial,
    } as ConceptMeta);
  }
  return {
    concepts: map,
    rootPath: "/tmp/test-bundle",
    buildTime: Date.now(),
  };
}

describe("validateBundle", () => {
  it("validates a real bundle on disk", async () => {
    const bundle = createTestBundle({
      "index.md": `---
type: "Index"
title: "Test Bundle"
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
      const index = createMockIndex({
        "services/auth": {
          type: "Service",
          title: "Auth Service",
          tags: ["auth", "service"],
        },
      });

      const result = await validateBundle(bundle.path, index);
      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    } finally {
      bundle.cleanup();
    }
  });

  it("detects broken links in concepts", async () => {
    const bundle = createTestBundle({
      "index.md": `---
type: "Index"
title: "Test"
---
Index.
`,
    });

    try {
      const index = createMockIndex({
        "services/auth": {
          type: "Service",
          title: "Auth Service",
          links: ["nonexistent/concept"],
        },
      });

      const result = await validateBundle(bundle.path, index);
      // Should have warnings or errors about broken links
      const allMessages = [
        ...result.errors.map((e) => e.message),
        ...result.warnings.map((w) => w.message),
      ];
      const brokenLinkMsgs = allMessages.filter(
        (m) => m.toLowerCase().includes("link") || m.toLowerCase().includes("broken")
      );
      expect(brokenLinkMsgs.length).toBeGreaterThan(0);
    } finally {
      bundle.cleanup();
    }
  });
});
