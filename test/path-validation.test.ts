import { describe, it, expect } from "vitest";

// Import the validateConceptPath function
// Since it's not exported, we test it through okfWriteTool behavior
// For unit testing, we'll recreate the validation logic
import { resolve, normalize, relative, isAbsolute } from "node:path";

function validateConceptPath(
  bundlePath: string,
  userPath: string
): { valid: boolean; error?: string } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(userPath);
  } catch {
    return { valid: false, error: "Invalid path encoding" };
  }

  if (decoded.includes("\0")) {
    return { valid: false, error: "Path contains null bytes" };
  }

  if (decoded.includes("\\")) {
    return { valid: false, error: "Use forward slashes only" };
  }

  const normalized = normalize(decoded);
  const fullPath = resolve(bundlePath, `${normalized}.md`);

  const rel = relative(bundlePath, fullPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { valid: false, error: "Path escapes bundle directory" };
  }

  if (!/^[a-zA-Z0-9_\-/.]+$/.test(decoded)) {
    return { valid: false, error: "Path contains invalid characters" };
  }

  const filename = normalized.split("/").pop() || "";
  const reserved = ["index", "log", "index.md", "log.md"];
  if (reserved.includes(filename)) {
    return { valid: false, error: "Cannot use reserved filename" };
  }

  return { valid: true };
}

describe("Path Validation", () => {
  const bundlePath = "/tmp/test-bundle";

  describe("valid paths", () => {
    it("accepts simple concept name", () => {
      expect(validateConceptPath(bundlePath, "my-concept")).toEqual({ valid: true });
    });

    it("accepts nested path", () => {
      expect(validateConceptPath(bundlePath, "api/endpoints/auth")).toEqual({ valid: true });
    });

    it("accepts underscores and hyphens", () => {
      expect(validateConceptPath(bundlePath, "my_cool-concept")).toEqual({ valid: true });
    });

    it("accepts deeply nested paths", () => {
      expect(validateConceptPath(bundlePath, "a/b/c/d/e")).toEqual({ valid: true });
    });
  });

  describe("path traversal attacks", () => {
    it("blocks ../ traversal", () => {
      const result = validateConceptPath(bundlePath, "../../../etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("blocks encoded ../ traversal", () => {
      const result = validateConceptPath(bundlePath, "..%2F..%2F..%2Fetc%2Fpasswd");
      expect(result.valid).toBe(false);
    });

    it("blocks absolute paths", () => {
      const result = validateConceptPath(bundlePath, "/etc/passwd");
      expect(result.valid).toBe(false);
    });
  });

  describe("null byte injection", () => {
    it("blocks null bytes", () => {
      const result = validateConceptPath(bundlePath, "concept\0.md");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("null bytes");
    });
  });

  describe("Windows path separators", () => {
    it("blocks backslashes", () => {
      const result = validateConceptPath(bundlePath, "path\\to\\concept");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("forward slashes");
    });
  });

  describe("invalid characters", () => {
    it("blocks spaces", () => {
      const result = validateConceptPath(bundlePath, "my concept");
      expect(result.valid).toBe(false);
    });

    it("blocks special characters", () => {
      const result = validateConceptPath(bundlePath, "concept<script>");
      expect(result.valid).toBe(false);
    });

    it("blocks semicolons", () => {
      const result = validateConceptPath(bundlePath, "concept;rm -rf");
      expect(result.valid).toBe(false);
    });
  });

  describe("reserved filenames", () => {
    it("blocks index", () => {
      const result = validateConceptPath(bundlePath, "index");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reserved");
    });

    it("blocks log", () => {
      const result = validateConceptPath(bundlePath, "log");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reserved");
    });

    it("blocks nested index", () => {
      const result = validateConceptPath(bundlePath, "api/index");
      expect(result.valid).toBe(false);
    });
  });
});
