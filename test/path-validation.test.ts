import { describe, it, expect } from "vitest";
import { validateConceptPath } from "../src/tools.js";

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
