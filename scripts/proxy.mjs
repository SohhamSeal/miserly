// -----------------------------------------------------------------------------
// miserly proxy — put the compression engine INLINE between your agent and the
// LLM provider (the architecture Headroom pioneered; see
// docs/integrations/cursor-mcp-hooks.md §3.1).
//
//   chat client ──► http://localhost:4141 (this proxy) ──► api.anthropic.com
//                        │
//                        └── oversized text / tool_result blocks are compressed
//                            by the real miserly engine before forwarding.
//
// Wire it up (Claude Code):   ANTHROPIC_BASE_URL=http://localhost:4141 claude
// Start it:                   npm run proxy
//
// The engine is loaded through Vite's SSR module loader, so the browser code
// (path aliases, import.meta.glob plugin registry) runs unmodified in Node —
// no separate build, always the same engine the studio uses.
//
// Knobs (environment variables):
//   MISERLY_PORT             listen port                     (default 4141)
//   MISERLY_UPSTREAM         provider base URL               (default https://api.anthropic.com)
//   MISERLY_GOAL             optimization goal               (default balanced)
//   MISERLY_BUDGET           per-block token budget. Unset (default), each
//                            block targets HALF its own size — a demanding
//                            budget so the engine's closed loop actually
//                            engages instead of early-stopping after one
//                            gentle stage. Set a number to use it verbatim.
//   MISERLY_MIN_TOKENS       only touch blocks above this    (default 1500)
//   MISERLY_COMPRESS_SYSTEM  also compress the system prompt (default false —
//                            compressing a CACHED system prompt breaks the
//                            provider's prompt cache and can COST money; see
//                            the cache advisor in the studio)
//   MISERLY_MARKER           prepend a small "[miserly: …]" note to compressed
//                            blocks so the model knows content was compacted
//                            (default false)
//
// Privacy holds: this runs on YOUR machine. The proxy never stores request
// content; API keys pass through untouched to the provider.
// -----------------------------------------------------------------------------
import http from "node:http";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.MISERLY_PORT ?? 4141);
const UPSTREAM = (process.env.MISERLY_UPSTREAM ?? "https://api.anthropic.com").replace(/\/$/, "");
const GOAL = process.env.MISERLY_GOAL ?? "balanced";
const BUDGET = process.env.MISERLY_BUDGET ? Number(process.env.MISERLY_BUDGET) : null;
const MIN_TOKENS = Number(process.env.MISERLY_MIN_TOKENS ?? 1500);
const COMPRESS_SYSTEM = process.env.MISERLY_COMPRESS_SYSTEM === "true";
const MARKER = process.env.MISERLY_MARKER === "true";

// --- load the engine through Vite SSR (same code the studio runs) -----------
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const engine = await vite.ssrLoadModule("/src/engine/index.ts");
const { runOptimization, countTokens } = engine;

// --- compression -------------------------------------------------------------
const totals = { requests: 0, blocks: 0, before: 0, after: 0 };

async function compressText(text) {
  const tokens = countTokens(text);
  if (tokens < MIN_TOKENS) return null;
  // A demanding budget (half the block, unless the user pinned one) keeps the
  // planner from early-stopping after a single gentle stage on mid-size blocks.
  const targetBudget = BUDGET ?? Math.ceil(tokens / 2);
  const result = await runOptimization({
    input: text,
    goal: GOAL,
    targetBudget,
    modelId: "claude-sonnet-4",
    pace: 0, // headless: no presentation delays
  });
  // Only swap when the engine measurably helped (>3% — below that the churn
  // isn't worth changing the payload).
  if (result.optimizedTokens >= tokens * 0.97) return null;
  totals.blocks++;
  totals.before += tokens;
  totals.after += result.optimizedTokens;
  const out = MARKER
    ? `[miserly: compressed ~${tokens.toLocaleString()} → ~${result.optimizedTokens.toLocaleString()} tokens]\n${result.outputText}`
    : result.outputText;
  return { out, tokens, optimized: result.optimizedTokens };
}

/** Compress eligible text in an Anthropic /v1/messages body, in place. */
async function compressMessagesBody(body) {
  const swaps = [];
  const tryBlock = async (holder, key, label) => {
    const value = holder[key];
    if (typeof value !== "string") return;
    const r = await compressText(value);
    if (r) {
      holder[key] = r.out;
      swaps.push(`${label} ~${r.tokens.toLocaleString()}→~${r.optimized.toLocaleString()}`);
    }
  };

  if (COMPRESS_SYSTEM && body.system !== undefined) {
    if (typeof body.system === "string") {
      await tryBlock(body, "system", "system");
    } else if (Array.isArray(body.system)) {
      for (const blk of body.system) {
        if (blk?.type === "text") await tryBlock(blk, "text", "system");
      }
    }
  }

  for (const msg of body.messages ?? []) {
    // Never rewrite the model's own prior words — only what the USER side sends.
    if (msg?.role !== "user") continue;
    if (typeof msg.content === "string") {
      await tryBlock(msg, "content", "user text");
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block?.type === "text") {
        await tryBlock(block, "text", "user text");
      } else if (block?.type === "tool_result") {
        if (typeof block.content === "string") {
          await tryBlock(block, "content", "tool_result");
        } else if (Array.isArray(block.content)) {
          for (const part of block.content) {
            if (part?.type === "text") await tryBlock(part, "text", "tool_result");
          }
        }
      }
    }
  }
  return swaps;
}

// --- plumbing ----------------------------------------------------------------
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding", // ask upstream for identity so we can relay bytes verbatim
  "keep-alive",
  "proxy-authorization",
  "te",
  "upgrade",
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/miserly/stats") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ...totals,
          saved: totals.before - totals.after,
          note: "token counts are estimates (~4 chars/token) unless the exact tokenizer is installed",
        }),
      );
      return;
    }

    let bodyBuf = await readBody(req);

    // Rewrite eligible chat requests; pass everything else through verbatim.
    if (req.method === "POST" && req.url?.startsWith("/v1/messages") && bodyBuf.length > 0) {
      try {
        const body = JSON.parse(bodyBuf.toString("utf8"));
        const swaps = await compressMessagesBody(body);
        if (swaps.length > 0) {
          totals.requests++;
          bodyBuf = Buffer.from(JSON.stringify(body), "utf8");
          const pct =
            totals.before > 0 ? Math.round((1 - totals.after / totals.before) * 100) : 0;
          console.log(
            `⇒ compressed ${swaps.length} block(s): ${swaps.join(", ")} · session total −${pct}% (~${(
              totals.before - totals.after
            ).toLocaleString()} tokens saved)`,
          );
        }
      } catch (err) {
        // Malformed/unexpected body — never block the request over it.
        console.warn("miserly: leaving request untouched:", err?.message ?? err);
      }
    }

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) headers[k] = v;
    }

    const upstreamRes = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : bodyBuf,
    });

    res.statusCode = upstreamRes.status;
    upstreamRes.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key)) {
        res.setHeader(key, value);
      }
    });
    if (upstreamRes.body) {
      // Stream the response through untouched (SSE included).
      for await (const chunk of upstreamRes.body) res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("miserly proxy error:", err);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json");
    }
    res.end(JSON.stringify({ error: { type: "miserly_proxy_error", message: String(err) } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`
🪙 miserly proxy listening on http://localhost:${PORT}
   upstream        ${UPSTREAM}
   goal            ${GOAL} · per-block budget ${BUDGET ? BUDGET.toLocaleString() + " tokens" : "half of each block"}
   touches         user text & tool_result blocks over ~${MIN_TOKENS.toLocaleString()} tokens
   system prompt   ${COMPRESS_SYSTEM ? "COMPRESSED (cache warning!)" : "untouched (default — protects prompt caching)"}

   Wire up Claude Code:   ANTHROPIC_BASE_URL=http://localhost:${PORT} claude
   Session savings:       curl http://localhost:${PORT}/miserly/stats
`);
});
