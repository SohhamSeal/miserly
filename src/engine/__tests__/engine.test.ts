import { describe, it, expect } from "vitest";
import {
  minifyJsonBlocks,
  dropLowInfoLines,
  dedupeGlobalLines,
  stripComments,
  genericTokenReduce,
} from "@/engine/transforms";
import { lineType, segment } from "@/engine/segmenter";
import { classify } from "@/engine/classifier";
import { PLUGINS, DEFAULT_MODEL_ID, runOptimization, analyzeCache, getModel } from "@/engine";

// ---------------------------------------------------------------------------
// Classifier / segmenter — rule order and role-marker fixes
// ---------------------------------------------------------------------------
describe("lineType", () => {
  it("classifies a log line as logs even when it embeds a code keyword", () => {
    // The `\bimport\b` code rule used to pre-empt the logs rule here.
    expect(lineType("2024-05-01 12:00:01 INFO Failed to import module")).toBe("logs");
    expect(lineType("2024-05-01 12:00:02 ERROR return value was null")).toBe("logs");
  });

  it("does NOT treat a hyphenated word as a chat role marker", () => {
    // "Human-generated" used to match the old `[:>\-]` separator class.
    expect(lineType("Human-generated content is included below")).toBe("prose");
    expect(lineType("User: what is the status?")).toBe("chat");
    expect(lineType("Assistant> here is the answer")).toBe("chat");
  });

  it("types a bare structural-punctuation line as code, not prose", () => {
    expect(lineType("}")).toBe("code");
    expect(lineType("});")).toBe("code");
    expect(lineType("]")).toBe("code");
  });
});

describe("classify", () => {
  it("labels a valid pretty-printed JSON document as json", () => {
    const pretty = JSON.stringify({ a: 1, nested: { b: [1, 2, 3] } }, null, 2);
    expect(classify(pretty).primary).toBe("json");
  });
});

// ---------------------------------------------------------------------------
// Property: minifyJsonBlocks must be value-preserving
// ---------------------------------------------------------------------------
describe("minifyJsonBlocks", () => {
  it("minified output parses to a deep-equal value", () => {
    const value = { name: "checkout", retries: 3, tags: ["a", "b"], meta: { ok: true, n: null } };
    const pretty = JSON.stringify(value, null, 2);
    const { text } = minifyJsonBlocks(pretty);
    expect(JSON.parse(text)).toEqual(value);
    expect(text.length).toBeLessThanOrEqual(pretty.length);
  });
});

// ---------------------------------------------------------------------------
// Property: a prose transform must never alter a JSON or code segment
// ---------------------------------------------------------------------------
const MIXED = `Deployment notes for the checkout service.
This is really very important prose that should shrink a lot.

{
  "retries": 3,
  "timeout": 30,
  "enabled": true
}

function add(a, b) {
  return a + b;
}`;

describe("segment-safe transforms", () => {
  it("genericTokenReduce leaves JSON and code byte-for-byte intact", () => {
    const { text } = genericTokenReduce(MIXED, 0.9);
    expect(text).toContain('"retries": 3');
    expect(text).toContain('"enabled": true');
    expect(text).toContain("function add(a, b) {");
    expect(text).toContain("return a + b;");
    // ...but the prose really did shrink.
    expect(text.length).toBeLessThan(MIXED.length);
  });

  it("dropLowInfoLines never deletes structural brace lines on JSON", () => {
    const pretty = JSON.stringify({ a: 1, b: { c: 2 } }, null, 2);
    const { text } = dropLowInfoLines(pretty, 0.9);
    expect(JSON.parse(text)).toEqual({ a: 1, b: { c: 2 } });
  });

  it("dedupeGlobalLines does not merge two functions with identical bodies", () => {
    const code = ["function a() {", "  return 1;", "}", "function b() {", "  return 1;", "}"].join(
      "\n",
    );
    const { text } = dedupeGlobalLines(code);
    expect(text).toBe(code);
  });

  it("dedupeGlobalLines still collapses genuine repeated log lines", () => {
    const logs = [
      "2024-01-01 00:00:00 INFO cache miss",
      "2024-01-01 00:00:00 INFO cache miss",
      "2024-01-01 00:00:00 INFO cache miss",
    ].join("\n");
    const { text } = dedupeGlobalLines(logs);
    expect(text.split("\n").filter((l) => l.includes("cache miss")).length).toBe(1);
    expect(text).toContain("×3");
  });
});

// ---------------------------------------------------------------------------
// stripComments — must not truncate strings or URLs
// ---------------------------------------------------------------------------
describe("stripComments", () => {
  it("keeps a // that lives inside a string literal", () => {
    const src = 'const char* s = "foo // bar";';
    expect(stripComments(src).text).toBe(src);
  });

  it("keeps a URL's //", () => {
    const src = 'const u = "http://example.com/path";';
    expect(stripComments(src).text).toBe(src);
  });

  it("removes a genuine trailing line comment", () => {
    const { text } = stripComments("const x = 1; // set x");
    expect(text.trim()).toBe("const x = 1;");
  });
});

// ---------------------------------------------------------------------------
// genericTokenReduce — meaning + chat behavior
// ---------------------------------------------------------------------------
describe("genericTokenReduce", () => {
  it("keeps logic-bearing connectives at the balanced default (0.55)", () => {
    const src = "The retry succeeded, but the data was corrupted.";
    const { text } = genericTokenReduce(src, 0.55);
    expect(text).toContain("but");
    // Soft filler ("the") should still be dropped.
    expect(text.toLowerCase().split(/\W+/).filter((w) => w === "the").length).toBeLessThan(2);
  });

  it("actually reduces a chat transcript and preserves the role marker", () => {
    const chat = "User: I really think that this is basically the correct answer.";
    const { text } = genericTokenReduce(chat, 0.55);
    expect(text.startsWith("User:")).toBe(true);
    expect(text.length).toBeLessThan(chat.length);
  });
});

// ---------------------------------------------------------------------------
// segment() basic shape
// ---------------------------------------------------------------------------
describe("segment", () => {
  it("round-trips to the original text when segments are re-joined", () => {
    const segs = segment(MIXED);
    expect(segs.map((s) => s.text).join("\n")).toBe(MIXED);
  });
});

// ---------------------------------------------------------------------------
// Plugin provenance — no impersonation of upstream research / tools
// ---------------------------------------------------------------------------
describe("plugin provenance honesty", () => {
  it("every plugin declares a valid provenance", () => {
    for (const p of PLUGINS) {
      expect(["native", "reference-sim", "external"]).toContain(p.metadata.provenance);
    }
  });

  it("miserly is the author of every plugin — lineage lives in inspiredBy, not author", () => {
    for (const p of PLUGINS) {
      expect(p.metadata.author).toBe("miserly");
    }
  });

  it("the LLMLingua sim credits its lineage without impersonating Microsoft", () => {
    const llmlingua = PLUGINS.find((p) => p.metadata.id === "llmlingua");
    expect(llmlingua?.metadata.provenance).toBe("reference-sim");
    expect(llmlingua?.metadata.inspiredBy?.name).toMatch(/LLMLingua/);
    // Regression guard for the original bug: the upstream org must NOT be the author.
    expect(llmlingua?.metadata.author).not.toMatch(/Microsoft/i);
  });
});

// ---------------------------------------------------------------------------
// Closed-loop budget enforcement — the runner measures against targetBudget
// ---------------------------------------------------------------------------
describe("closed-loop budget enforcement", () => {
  // 60 distinct, filler-heavy prose lines: compressible, but not collapsible by
  // dedup alone (each line is unique), so reduction tracks aggressiveness.
  const input = Array.from(
    { length: 60 },
    (_, i) =>
      `Note ${i}: the service basically just processes the incoming data and then it simply returns a result for item number ${i}.`,
  ).join("\n");

  it("compresses harder for a tight budget than a generous one (the loop is closed)", async () => {
    const generous = await runOptimization({
      input,
      goal: "balanced",
      targetBudget: 100000,
      modelId: DEFAULT_MODEL_ID,
      pace: 0,
    });
    const tight = await runOptimization({
      input,
      goal: "balanced",
      targetBudget: 250,
      modelId: DEFAULT_MODEL_ID,
      pace: 0,
    });
    // Before enforcement both were identical; now the tight budget escalates.
    expect(tight.optimizedTokens).toBeLessThan(generous.optimizedTokens);
  });

  it("warns honestly when the budget is below the achievable floor", async () => {
    const res = await runOptimization({
      input,
      goal: "balanced",
      targetBudget: 1,
      modelId: DEFAULT_MODEL_ID,
      pace: 0,
    });
    expect(res.optimizedTokens).toBeGreaterThan(1);
    expect(res.validation.warnings.some((w) => /budget/i.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cache-aware pricing — compression and caching are complementary, not rivals
// ---------------------------------------------------------------------------
describe("cache-aware pricing", () => {
  it("a cache read of the compressed prompt is the cheapest per-reuse option", () => {
    const c = analyzeCache(20000, 8000, getModel("gpt-5"));
    expect(c.supported).toBe(true);
    expect(c.cacheReadCompressed).toBeLessThan(c.perCallCompressed);
    expect(c.cacheReadCompressed).toBeLessThanOrEqual(c.cacheReadOriginal);
  });

  it("reports no cache pricing for models without caching", () => {
    const c = analyzeCache(20000, 8000, getModel("llama-3.1-405b"));
    expect(c.supported).toBe(false);
    expect(c.cacheReadPerM).toBe(0);
  });

  it("finds a finite break-even where caching the original beats compressing every call", () => {
    const c = analyzeCache(20000, 8000, getModel("claude-opus-4"));
    expect(c.breakEvenReuse).not.toBeNull();
    expect(c.breakEvenReuse ?? 0).toBeGreaterThanOrEqual(2);
  });
});
