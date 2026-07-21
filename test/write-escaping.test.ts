import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { yamlScalar, sanitizeTag, renderTags, okfWriteTool } from "../src/tools.js";
import { parseFrontmatter } from "../src/parser.js";

describe("yamlScalar", () => {
  it("passes plain values through unquoted", () => {
    expect(yamlScalar("Simple Title")).toBe("Simple Title");
  });

  it("quotes values containing colons", () => {
    const out = yamlScalar("Redis: Cache Server");
    expect(out).toBe('"Redis: Cache Server"');
  });

  it("collapses newlines so values cannot inject frontmatter keys", () => {
    const out = yamlScalar("Legit title\nmalicious_key: injected");
    expect(out).not.toContain("\n");
  });

  it("escapes embedded double quotes", () => {
    const out = yamlScalar('He said "hi" # loudly');
    expect(out.startsWith('"')).toBe(true);
    expect(out).toContain('\\"');
  });
});

describe("sanitizeTag / renderTags (0.3.1 comma round-trip)", () => {
  it("preserves commas inside a tag", () => {
    expect(sanitizeTag("escaping, comma-break")).toBe("escaping, comma-break");
  });

  it("strips brackets, quotes and newlines", () => {
    expect(sanitizeTag('[weird]')).toBe("weird");
    expect(sanitizeTag('a"b')).toBe("a b");
    expect(sanitizeTag("line1\nline2")).toBe("line1 line2");
  });

  it("renders inline flow sequence when no tag has a comma", () => {
    expect(renderTags(["one", "two"])).toEqual(["tags: [one, two]"]);
  });

  it("renders a quoted block list when any tag has a comma", () => {
    expect(renderTags(["a,b", "c"])).toEqual([
      "tags:",
      '  - "a,b"',
      '  - "c"',
    ]);
  });

  it("drops empty tags and returns [] when nothing remains", () => {
    expect(renderTags(["", "   "])).toEqual([]);
  });

  it("block-list output parses back to the exact tags", () => {
    const lines = renderTags(["a, b", "plain", "[brack]"]);
    const doc = ["---", "type: T", ...lines, "---", "", "body", ""].join("\n");
    const { frontmatter } = parseFrontmatter(doc);
    expect(frontmatter.tags).toEqual(["a, b", "plain", "brack"]);
  });
});

describe("okf_write frontmatter round-trip", () => {
  it("writes hostile values that parse back intact", async () => {
    const dir = join(tmpdir(), `okf-write-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    try {
      const result = await okfWriteTool.execute(
        "test-call",
        {
          path: "decisions/hostile",
          type: "Decision Record",
          title: "Choice: use [brackets], quotes \" and\nnewlines",
          description: "Summary with # hash and : colon",
          body: "# Body\n\nContent.",
          tags: ["a,b", "ok-tag", "[weird]"],
        },
        { bundlePath: dir, reindexCallback: () => {} }
      );

      expect(result.content[0]!.text).toContain("Successfully wrote");

      const written = readFileSync(join(dir, "decisions/hostile.md"), "utf-8");
      const { frontmatter, body } = parseFrontmatter(written);

      expect(frontmatter.type).toBe("Decision Record");
      // Newline collapsed to a space, no injected keys
      expect(frontmatter.malicious_key).toBeUndefined();
      expect(String(frontmatter.title)).toContain("Choice: use [brackets]");
      expect(String(frontmatter.description)).toBe("Summary with # hash and : colon");
      // Tags sanitized: no flow-sequence breakage
      expect(Array.isArray(frontmatter.tags)).toBe(true);
      expect((frontmatter.tags as string[])).toContain("ok-tag");
      // 0.3.1: a comma-containing tag now round-trips intact (block-list form)
      expect((frontmatter.tags as string[])).toContain("a,b");
      expect(body).toContain("Content.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects reserved and traversal paths", async () => {
    const dir = join(tmpdir(), `okf-write-test-${Date.now()}-b`);
    mkdirSync(dir, { recursive: true });

    try {
      const reserved = await okfWriteTool.execute(
        "test-call",
        { path: "api/index", type: "T", title: "T", body: "B" },
        { bundlePath: dir, reindexCallback: () => {} }
      );
      expect(reserved.content[0]!.text).toContain("reserved");

      const traversal = await okfWriteTool.execute(
        "test-call",
        { path: "../escape", type: "T", title: "T", body: "B" },
        { bundlePath: dir, reindexCallback: () => {} }
      );
      expect(traversal.content[0]!.text).toContain("Error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
