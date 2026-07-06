import { describe, it, expect } from "vitest";
import {
  minifyJsonBlocks,
  dropLowInfoLines,
  dedupeGlobalLines,
  dedupeConsecutiveLines,
  stripComments,
  collapseWhitespace,
  genericTokenReduce,
  extractiveSummary,
  toonifyJsonBlocks,
} from "@/engine/transforms";
import { countTokens } from "@/engine/tokenizer";
import { lineType, segment } from "@/engine/segmenter";
import { classify } from "@/engine/classifier";
import { PLUGINS, DEFAULT_MODEL_ID, runOptimization, analyzeCache, getModel } from "@/engine";
import { getPlugin } from "@/engine/registry";

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

  it("types keyword-less code statements (Python/Ruby/Go) as code, not prose", () => {
    expect(lineType("for item in items:")).toBe("code");
    expect(lineType("if item is None:")).toBe("code");
    expect(lineType("count = 0")).toBe("code");
    expect(lineType("total += n")).toBe("code");
    expect(lineType("pass")).toBe("code");
  });

  it("types bare JSON scalar array elements as json, not prose", () => {
    expect(lineType("1,")).toBe("json");
    expect(lineType('"red",')).toBe("json");
    expect(lineType("true")).toBe("json");
    expect(lineType("null,")).toBe("json");
  });

  it("only calls a line SQL with structural evidence, not a lone keyword", () => {
    expect(lineType("Please update the docs before you ship.")).toBe("prose");
    expect(lineType("SELECT id, name FROM users WHERE active = 1")).toBe("sql");
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

  it("property: minifying never changes the parsed value across many shapes", () => {
    const samples: unknown[] = [
      { a: 1, b: [1, 2, { c: "x" }], d: null, e: false },
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      { nested: { deep: { deeper: [true, false, null, "s"] } } },
      { unicode: "café — naïve", empty: {}, arr: [] },
      { floaty: 1.5, neg: -42, zero: 0 },
    ];
    for (const value of samples) {
      const pretty = JSON.stringify(value, null, 2);
      const { text } = minifyJsonBlocks(pretty);
      expect(JSON.parse(text)).toEqual(value);
    }
  });

  it("refuses to round-trip integers float64 cannot represent exactly", () => {
    // Snowflake / int64 IDs lose precision through JSON.parse — leave them alone.
    const bigId = "1234567890123456789";
    const pretty = `{\n  "id": ${bigId},\n  "name": "x"\n}`;
    const { text } = minifyJsonBlocks(pretty);
    expect(text).toContain(bigId);
    // A round-trip would have corrupted it to a different number.
    expect(text).not.toContain("1234567890123456800");
  });

  it("refuses high-magnitude DECIMALS (total significant digits, not per-side)", () => {
    // 17 significant digits, but neither the integer nor fractional side hits 16
    // — the old per-side guard let this through and corrupted it to 10000000000.
    const risky = "9999999999.9999999";
    const pretty = `{\n  "ratio": ${risky},\n  "name": "x"\n}`;
    const { text } = minifyJsonBlocks(pretty);
    expect(text).toContain(risky);
    expect(text).not.toContain("10000000000");
  });

  it("still minifies JSON whose numbers are safely representable", () => {
    const pretty = JSON.stringify({ a: 1.5, b: 30, c: 0.008, d: 128000 }, null, 2);
    const { text } = minifyJsonBlocks(pretty);
    expect(JSON.parse(text)).toEqual({ a: 1.5, b: 30, c: 0.008, d: 128000 });
    expect(text.length).toBeLessThan(pretty.length);
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

  it("dedupeConsecutiveLines does not merge repeated JSON scalar array elements", () => {
    const json = ["[", '  "red",', '  "red",', '  "blue"', "]"].join("\n");
    const { text } = dedupeConsecutiveLines(json);
    // Both "red" lines must survive (no "⟲ ×2"): removing one corrupts the array.
    expect(text).toBe(json);
    expect(JSON.parse(text)).toEqual(["red", "red", "blue"]);
  });

  it("dedupeConsecutiveLines does not merge repeated code statements", () => {
    const code = ["function retry() {", "  attempt();", "  attempt();", "}"].join("\n");
    expect(dedupeConsecutiveLines(code).text).toBe(code);
  });

  it("dropLowInfoLines keeps a JSON scalar array intact (no emptied arrays)", () => {
    const pretty = JSON.stringify({ weights: [1, 2, 3] }, null, 2);
    const { text } = dropLowInfoLines(pretty, 0.9);
    expect(JSON.parse(text)).toEqual({ weights: [1, 2, 3] });
  });

  it("dropLowInfoLines preserves a Markdown setext heading underline", () => {
    const md = ["Overview", "========", "", "Body text goes here."].join("\n");
    const { text } = dropLowInfoLines(md, 0.9);
    expect(text).toContain("========");
  });

  it("genericTokenReduce preserves Python keywords inside code segments", () => {
    const py = ["def f(items):", "  for item in items:", "    if item is None:", "      pass"].join(
      "\n",
    );
    // At max aggressiveness the code block is untouched (typed code, not prose).
    const { text } = genericTokenReduce(py, 0.9);
    expect(text).toContain("for item in items:");
    expect(text).toContain("if item is None:");
  });

  it("collapseWhitespace does not squeeze spaces inside a code string literal", () => {
    const code = 'const sep = "a    b";';
    expect(collapseWhitespace(code).text).toContain('"a    b"');
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

  it("keeps a // inside a template literal", () => {
    const src = "const u = `tpl // inside template`;";
    expect(stripComments(src).text).toBe(src);
  });

  it("keeps a // after an escaped quote inside a string", () => {
    const src = 'const v = "he said \\"hi // there\\"";';
    expect(stripComments(src).text).toBe(src);
  });

  it("does not eat a glob string via the block-comment pass", () => {
    // "src/**/*.test.ts" contains both a comment-open and comment-close sequence.
    const src = 'const g = "src/**/*.test.ts";';
    expect(stripComments(src).text).toBe(src);
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

describe("extractiveSummary", () => {
  it("never drops a whole paragraph — every paragraph keeps its lead sentence", () => {
    const doc = [
      "Intro sentence one is here.",
      "Body about topic A here.",
      "Body about topic B here.",
      "Conclusion sentence is here.",
    ].join("\n\n");
    const { text } = extractiveSummary(doc, 0.5);
    // The trailing paragraph (a conclusion) must survive, not silently vanish.
    expect(text).toContain("Conclusion");
    expect(text).toContain("Intro");
    expect(text.split(/\n\s*\n/).filter((p) => p.trim() !== "").length).toBe(4);
  });

  it("still compresses multi-sentence paragraphs down to their leads", () => {
    const para = [
      "The lead sentence states the topic clearly.",
      "This is a supporting detail that can go.",
      "Another supporting detail that can also go.",
      "Yet another minor elaboration here.",
    ].join(" ");
    const { text } = extractiveSummary(para, 0.25);
    expect(text).toContain("The lead sentence states the topic");
    expect(text.length).toBeLessThan(para.length);
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

  it("a prose-looking line sandwiched inside a JSON block inherits json", () => {
    // The bare "42" line matches no JSON key rule, but its neighbors are json,
    // so context inheritance must keep it out of a prose island.
    const doc = ['{', '  "a": 1,', "  42,", '  "b": 2', "}"].join("\n");
    const segs = segment(doc);
    // Whole thing should be one json (or json+code) block — never a prose island.
    expect(segs.every((s) => s.type !== "prose")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the historical corruption cases can't be reproduced via a plugin
// ---------------------------------------------------------------------------
describe("plugin-level corruption regressions", () => {
  it("Claw does not empty a JSON scalar array (end-to-end)", () => {
    const claw = getPlugin("claw");
    expect(claw).toBeTruthy();
    const pretty = JSON.stringify({ weights: [1, 2, 3], name: "w" }, null, 2);
    const out = claw!.compress({
      text: pretty,
      classification: classify(pretty),
      goal: "max_compression",
      targetBudget: 10,
      config: { aggressiveness: 0.9, similarityThreshold: 0.8, enabled: true },
    });
    // Numbers survive — the array is not emptied.
    expect(out.text).toContain("1");
    expect(out.text).toContain("3");
  });
});

// ---------------------------------------------------------------------------
// Cooperative cancellation — an aborted run stops and rejects
// ---------------------------------------------------------------------------
describe("abort", () => {
  it("throws when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runOptimization({
        input: "Some prose to compress.\n".repeat(40),
        goal: "balanced",
        targetBudget: 100,
        modelId: DEFAULT_MODEL_ID,
        pace: 0,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tokenizer provenance stamped on the result
// ---------------------------------------------------------------------------
describe("tokenizer stamp", () => {
  it("stamps the tokenizer kind used to measure the run", async () => {
    const res = await runOptimization({
      input: "Repeated filler prose that can be compressed a bit.\n".repeat(20),
      goal: "balanced",
      targetBudget: 100,
      modelId: DEFAULT_MODEL_ID,
      pace: 0,
    });
    // Default (lean) build has no gpt-tokenizer, so counts are estimated.
    expect(["exact", "estimated"]).toContain(res.tokenizerKind);
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

  it("accounts for the cache-write premium on providers that charge one", () => {
    const opus = getModel("claude-opus-4");
    const c = analyzeCache(20000, 8000, opus);
    // Opus charges ~1.25× input to WRITE the cache — so the first cached call
    // costs more than a plain input call.
    expect(c.cacheWriteOriginal).toBeGreaterThan(c.perCallOriginal);
  });
});

describe("toonifyJsonBlocks — TOON table encoding with a measured fallback", () => {
  const users = {
    users: [
      { id: "u1", name: "Arjun", age: 29, active: true },
      { id: "u2", name: "Meera", age: 34, active: true },
      { id: "u3", name: "Vikram", age: 41, active: false },
    ],
  };

  it("re-encodes a uniform record array as a table with keys declared once", () => {
    const pretty = JSON.stringify(users, null, 2);
    const { text } = toonifyJsonBlocks(pretty);
    expect(text).toContain("users[3]{id,name,age,active}:");
    expect(text).toContain("u1,Arjun,29,true");
    // Keys are paid for once — no per-record `"id":` repetition survives.
    expect(text).not.toContain('"id"');
  });

  it("measurably beats plain minification on record arrays", () => {
    const pretty = JSON.stringify(users, null, 2);
    const toon = toonifyJsonBlocks(pretty).text;
    const min = minifyJsonBlocks(pretty).text;
    expect(countTokens(toon)).toBeLessThan(countTokens(min));
  });

  it("quotes values carrying commas or spaces so rows stay unambiguous", () => {
    const doc = JSON.stringify(
      { rows: [{ a: "Tech Park, Block C", b: 1 }, { a: "plain", b: 2 }] },
      null,
      2,
    );
    const { text } = toonifyJsonBlocks(doc);
    expect(text).toContain('"Tech Park, Block C"');
  });

  it("never round-trips precision-risk numbers — the block is left untouched", () => {
    const risky = '{\n  "id": 1234567890123456789,\n  "name": "x"\n}';
    const { text } = toonifyJsonBlocks(risky);
    expect(text).toBe(risky);
  });

  it("ships whichever encoding measures smaller — never larger than the input", () => {
    const irregular = JSON.stringify(
      { a: { deeply: { nested: [1, "two", { three: 3 }] } } },
      null,
      2,
    );
    const out = toonifyJsonBlocks(irregular).text;
    expect(countTokens(out)).toBeLessThanOrEqual(countTokens(irregular));
  });

  it("segmenter types TOON output lines as structured data, not prose/markdown", () => {
    expect(lineType("users[4]{id,username}:")).toBe("json");
    expect(lineType("tags[3]: a,b,c")).toBe("json");
    expect(lineType("- id: usr_000001")).toBe("json");
    expect(lineType("  usr_000001,arjun_kumar,29")).toBe("json");
    // Ordinary prose with a comma keeps its type.
    expect(lineType("Well, that went fine.")).toBe("prose");
  });
});

describe("JSONL streams (one record per line)", () => {
  const rec = '{"ts":"<ts>","kind":"Event","reason":"Unhealthy","pod":"checkout-7042"}';

  it("dedupeConsecutiveLines folds identical free-standing JSONL records", () => {
    const stream = [rec, rec, rec, '{"ts":"<ts>","kind":"Event","reason":"Killing","pod":"api-1"}'].join("\n");
    const { text } = dedupeConsecutiveLines(stream);
    expect(text.split("\n").filter((l) => l.includes("checkout-7042")).length).toBe(1);
    expect(text).toContain("⟲ ×3");
  });

  it("still never folds identical JSON array ELEMENT lines (trailing commas)", () => {
    const arr = ["[", '  {"a": 1},', '  {"a": 1},', '  {"a": 1}', "]"].join("\n");
    const { text } = dedupeConsecutiveLines(arr);
    expect(text).toBe(arr);
  });

  it("toonifyJsonBlocks folds a run of JSONL records into one TOON table", () => {
    const stream = [
      '{"ts":"t1","kind":"Event","reason":"Unhealthy","pod":"a"}',
      '{"ts":"t2","kind":"Event","reason":"Killing","pod":"b"}',
      '{"ts":"t3","kind":"Event","reason":"BackOff","pod":"c"}',
    ].join("\n");
    const { text, note } = toonifyJsonBlocks(stream);
    expect(text).toContain("[3]{ts,kind,reason,pod}:");
    expect(text).toContain("t1,Event,Unhealthy,a");
    expect(note).toMatch(/JSONL/);
  });
});

describe("planner early-stop transparency", () => {
  it("says why it planned a light pipeline when the budget is already met", async () => {
    const { planPipeline } = await import("@/engine/planner");
    const pretty = JSON.stringify({ a: 1, b: [1, 2, 3], c: "x" }, null, 2);
    const plan = planPipeline({
      classification: classify(pretty),
      goal: "balanced",
      targetBudget: 8000,
    });
    expect(plan.reasoning.join("\n")).toMatch(/Stopped adding stages early/);
  });
});
