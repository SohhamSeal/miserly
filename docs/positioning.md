# miserly — Product Positioning

**Status:** Strategy / decided direction
**Last updated:** 2026-06-29
**Related:** [`integrations/cursor-mcp-hooks.md`](./integrations/cursor-mcp-hooks.md) (architecture & feasibility)

---

## 1. One-liner

> **Headroom is a black box that silently shrinks your context. miserly is the compression layer you can see inside and control — the glass box.**

miserly is a **local-first, transparent context-compression layer** with its **own engine and own proxy** (no dependency on other compression tools). It differentiates not on "compresses the most," but on **transparency, auditability, and control**.

---

## 2. The reality we're positioning against

[Headroom](https://github.com/chopratejas/headroom) already implements the "compress context in the agent loop" vision, and does it well: local proxy + library + MCP, real content-aware compressors (AST-aware code, ML prose, log/JSON/search), KV-cache alignment, CCR reversible retrieval, cross-agent memory, benchmarks. It is mature and trending.

**Honest assessment:** on *raw token compression in the loop*, Headroom wins today. miserly's current engine is largely **simulated** (~9 of 11 optimizers). Competing head-to-head on "better compression" is a losing battle and is **not** the plan.

---

## 3. The decision

| Axis | Choice |
| --- | --- |
| **Positioning** | **Glass box** — the visualization / control / inspection layer for compression (leverages miserly's existing studio UI). |
| **Relationship to Headroom** | **Fully independent** — own engine + own proxy; **learn from** Headroom (CCR, CacheAligner, content routing) but **don't depend on** it. |

---

## 4. Differentiation pillars

1. **Transparency.** Every compression is inspectable: what was kept, what was dropped, by which optimizer, with confidence and token deltas. (miserly already has the live pipeline, section breakdown, and cost/budget visualizations to express this.)
2. **Control.** Tune aggressiveness per content type, set keep/drop rules, pin sections — and have the runtime *enforce* those rules. Headroom is set-and-forget; miserly is set-and-**steer**.
3. **Auditability + reversibility.** A diff/audit trail of every change, plus on-demand retrieval of originals (CCR) so nothing is truly lost.
4. **Local-first / privacy.** Everything runs on the user's machine; routing context through miserly *shrinks* what's sent to the model rather than exporting data.

**Example of the payoff (the glass box in action):**
> Proxy compresses a 4,000-line log → the studio shows, live: *"LogCompressor kept 38 errors/warnings, dropped 3,602 passing lines (−89%), 12 segments deferred to `miserly_retrieve`."* You click a section, tighten the keep-rule, and the proxy applies it on the next call.

---

## 5. What miserly is NOT

- **Not** a black box. If a change can't be explained/inspected, it doesn't belong.
- **Not** trying to out-compress Headroom on raw ratios.
- **Not** a cloud service — local-first is a feature, not a limitation.
- **Not** "done" on the engine. (See the tension below.)

---

## 6. Target users

- Engineers/teams who **won't allow an opaque tool to silently mutate their prompts** and need to audit what's sent.
- Prompt engineers crafting **lean, deliberate** contexts (author-time workbench use).
- Teams establishing **context-hygiene norms** who want visibility into where tokens go.
- Privacy-sensitive users who need **local-only** processing.

---

## 7. The core tension (read this before building anything)

**A glass box is only valuable if what it shows is true.** Transparency is the *entire* value proposition. With the engine ~9/11 simulated today, the beautiful visualizations would be showing *fiction* — which is **worse** than a black box, because it actively misleads.

And because we chose **independent** (own engine, no borrowing Headroom's real compressors), we have to build that real engine ourselves.

> **Therefore: "glass box + independent" = glass-box *positioning* with compete-on-engine *effort*.** The simulated engine is the #1 blocker, not a finished prototype. This is acceptable only if we go in eyes-open and prioritize accordingly.

---

## 8. Critical path (de-risked sequencing)

1. **Make the engine real — but narrow.** Don't fix all 11 optimizers. Pick **2–3 high-value content types** (logs, JSON, maybe code) and implement *real, benchmarked* compressors with honest before/after numbers. Everything downstream depends on this being true.
2. **Headless `@miserly/core`.** Extract `src/engine` into an importable Node package (also unblocks proxy + CLI).
3. **Own proxy + CCR retrieval.** Sit in the loop; defer (don't drop) detail so compression is safe.
4. **Wire the glass box to the proxy.** Real-time view of what the proxy compressed/why/deferred, plus tunable rules the proxy enforces. This is where the existing UI becomes the moat.
5. **Benchmark vs Headroom throughout.** Learn from CCR / CacheAligner / content routing; stay independent, not ignorant.

---

## 9. Honest risks

- **Engine credibility.** Simulated → real is genuine R&D; the moat collapses without it.
- **Scope.** "Own engine + own proxy + transparent UI" is the most ambitious combination. Narrow ruthlessly (2–3 content types first).
- **Maintenance.** A provider-compatible proxy must track upstream API changes (streaming, tool-calls, system blocks).
- **Trust math.** Transparency claims invite scrutiny — numbers and diffs must be exact, or the positioning backfires.

---

## 10. What "winning" looks like

- A user can route a real coding session through miserly, **see** every compression as it happens, **tune** it, **trust** it (originals retrievable), and **measure** real token/cost savings — all locally — with the engine doing *real* work behind the visualizations.
- Differentiated answer to "why not just use Headroom?": *"Because I need to see and control what's being cut, and prove it to my team."*
