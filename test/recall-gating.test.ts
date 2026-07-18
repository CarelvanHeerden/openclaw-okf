import { describe, it, expect } from "vitest";
import { applyRelevanceGates } from "../src/recall.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { OkfConfig } from "../src/types.js";

type Result = { conceptId: string; score: number; matchedTokens: string[] };

function cfg(overrides: Partial<OkfConfig> = {}): OkfConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("applyRelevanceGates", () => {
  it("returns empty for empty input", () => {
    expect(applyRelevanceGates([], cfg())).toEqual([]);
  });

  it("keeps a single strong on-topic match", () => {
    const results: Result[] = [
      { conceptId: "harness/beta", score: 3.2, matchedTokens: ["harness", "beta"] },
    ];
    const out = applyRelevanceGates(results, cfg());
    expect(out.map((r) => r.conceptId)).toEqual(["harness/beta"]);
  });

  it("drops weak neighbours far below the top score (ratio gate)", () => {
    // top = 3.0; ratio 0.35 => floor 1.05. The 0.6 hit must be dropped.
    const results: Result[] = [
      { conceptId: "harness/beta", score: 3.0, matchedTokens: ["harness", "beta"] },
      { conceptId: "homelab/docker", score: 0.6, matchedTokens: ["docker"] },
    ];
    const out = applyRelevanceGates(results, cfg());
    expect(out.map((r) => r.conceptId)).toEqual(["harness/beta"]);
  });

  it("reproduces the cross-domain noise case: nothing clears the floor", () => {
    // A dev/harness turn that only weakly matches home-infra concepts on
    // common tokens like "docker"/"restart". All below minRecallScore 0.5.
    const results: Result[] = [
      { conceptId: "homelab/docker/mount-map", score: 0.3, matchedTokens: ["docker"] },
      { conceptId: "netbox-clients", score: 0.2, matchedTokens: ["clients"] },
      { conceptId: "google-workspace", score: 0.15, matchedTokens: ["workspace"] },
    ];
    const out = applyRelevanceGates(results, cfg());
    expect(out).toEqual([]);
  });

  it("respects an absolute minRecallScore floor", () => {
    const results: Result[] = [
      { conceptId: "a", score: 0.4, matchedTokens: ["x", "y"] },
    ];
    expect(applyRelevanceGates(results, cfg({ minRecallScore: 0.5 }))).toEqual([]);
    expect(
      applyRelevanceGates(results, cfg({ minRecallScore: 0.3 })).map((r) => r.conceptId)
    ).toEqual(["a"]);
  });

  it("respects minMatchedTokens", () => {
    const results: Result[] = [
      { conceptId: "single", score: 2.0, matchedTokens: ["docker"] },
      { conceptId: "double", score: 2.0, matchedTokens: ["harness", "beta"] },
    ];
    const out = applyRelevanceGates(results, cfg({ minMatchedTokens: 2 }));
    expect(out.map((r) => r.conceptId)).toEqual(["double"]);
  });

  it("keeps multiple genuinely relevant concepts within the ratio band", () => {
    const results: Result[] = [
      { conceptId: "a", score: 3.0, matchedTokens: ["harness", "beta"] },
      { conceptId: "b", score: 2.4, matchedTokens: ["harness", "smoke"] },
      { conceptId: "c", score: 1.2, matchedTokens: ["harness"] },
    ];
    // ratio 0.35 of 3.0 = 1.05, all three clear it.
    const out = applyRelevanceGates(results, cfg());
    expect(out.map((r) => r.conceptId)).toEqual(["a", "b", "c"]);
  });

  it("can be fully disabled by setting gates to permissive values", () => {
    const results: Result[] = [
      { conceptId: "a", score: 5.0, matchedTokens: ["x"] },
      { conceptId: "b", score: 0.01, matchedTokens: ["y"] },
    ];
    const out = applyRelevanceGates(
      results,
      cfg({ minRecallScore: 0, recallRelevanceRatio: 0, minMatchedTokens: 1 })
    );
    expect(out.map((r) => r.conceptId)).toEqual(["a", "b"]);
  });
});
