// -----------------------------------------------------------------------------
// miserly proxy — put the compression engine INLINE between your agent and the
// LLM provider (the architecture Headroom pioneered; see
// docs/integrations/cursor-mcp-hooks.md §3.1).
//
//   chat client ──► http://localhost:4141 (this proxy) ──► provider API
//                        │
//                        └── oversized text / tool blocks are compressed by
//                            the real miserly engine before forwarding.
//
// Speaks BOTH provider shapes:
//   Anthropic  POST /v1/messages           →  api.anthropic.com
//   OpenAI     POST /v1/chat/completions   →  api.openai.com
//
// Wire up:
//   Claude Code            ANTHROPIC_BASE_URL=http://localhost:4141 claude
//   Codex / Aider          OPENAI_BASE_URL=http://localhost:4141/v1
//   Cursor (BYO key only)  Settings → Models → Override OpenAI Base URL
//                          (managed Cursor models cannot be redirected)
//
// Turning it on/off — NO restarts needed:
//   The proxy always passes traffic through; compression is a live toggle.
//     curl -X PUT localhost:4141/miserly/config -d '{"enabled":false}'   # bypass
//     curl -X PUT localhost:4141/miserly/config -d '{"enabled":true}'    # resume
//   Every setting below is live-editable the same way and persists to the
//   config file (~/.miserly/config.json by default).
//
// Control API (localhost only):
//   GET  /miserly/health   liveness + enabled state
//   GET  /miserly/config   effective configuration
//   PUT  /miserly/config   patch configuration (validated, persisted)
//   GET  /miserly/stats    session savings
//
// Environment overrides (session-only; a PUT to the same key takes back over):
//   MISERLY_PORT             listen port                     (default 4141)
//   MISERLY_CONFIG_PATH      config file location            (default ~/.miserly/config.json)
//   MISERLY_ENABLED          start enabled/bypassed          (default from config file)
//   MISERLY_UPSTREAM         override BOTH upstreams (testing/mocks)
//   MISERLY_GOAL             optimization goal
//   MISERLY_BUDGET           per-block token budget (number). Unset: each block
//                            targets HALF its own size — demanding enough that
//                            the closed loop engages instead of early-stopping.
//   MISERLY_MIN_TOKENS       only touch blocks above this
//   MISERLY_COMPRESS_SYSTEM  also compress system prompts ("true"/"false") —
//                            off by default: compressing a CACHED system prompt
//                            breaks provider prompt-caching and can COST money
//   MISERLY_MARKER           prepend a "[miserly: …]" note to compressed blocks
//
// Privacy holds: this runs on YOUR machine. The proxy never stores request
// content; API keys pass through untouched to the provider.
// -----------------------------------------------------------------------------
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.MISERLY_PORT ?? 4141);
const CONFIG_PATH =
  process.env.MISERLY_CONFIG_PATH ?? join(homedir(), ".miserly", "config.json");

// --- configuration -----------------------------------------------------------
const GOALS = ["balanced", "max_compression", "highest_quality", "lowest_cost", "fastest"];

const DEFAULTS = {
  /** Master switch. false = pure passthrough (the safe daily "off"). */
  enabled: true,
  goal: "balanced",
  /** Per-block token budget; null = half of each block's own size. */
  budget: null,
  /** Only blocks estimated above this many tokens are touched. */
  minTokens: 1500,
  compressSystem: false,
  marker: false,
  /**
   * Activity-feed capture. false (default): the history records METADATA only
   * — counts, clients, models, token deltas — never text. true: full
   * before/after text is kept too, in a memory-only ring buffer (never disk),
   * so the studio can show exactly what was compressed. Explicit opt-in.
   */
  captureContent: false,
  upstreams: {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
  },
};

/** Validate a config patch; returns { clean, errors }. Unknown keys rejected. */
function validatePatch(patch) {
  const errors = [];
  const clean = {};
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { clean, errors: ["body must be a JSON object"] };
  }
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "enabled":
      case "compressSystem":
      case "marker":
      case "captureContent":
        if (typeof value !== "boolean") errors.push(`${key} must be a boolean`);
        else clean[key] = value;
        break;
      case "goal":
        if (!GOALS.includes(value)) errors.push(`goal must be one of: ${GOALS.join(", ")}`);
        else clean.goal = value;
        break;
      case "budget":
        if (value === null) clean.budget = null;
        else if (typeof value !== "number" || !Number.isFinite(value) || value < 100)
          errors.push("budget must be null or a number ≥ 100");
        else clean.budget = Math.round(value);
        break;
      case "minTokens":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
          errors.push("minTokens must be a number ≥ 0");
        else clean.minTokens = Math.round(value);
        break;
      case "upstreams": {
        if (typeof value !== "object" || value === null) {
          errors.push("upstreams must be an object");
          break;
        }
        const ups = {};
        for (const [prov, url] of Object.entries(value)) {
          if (!["anthropic", "openai"].includes(prov)) errors.push(`unknown upstream "${prov}"`);
          else if (typeof url !== "string" || !/^https?:\/\//.test(url))
            errors.push(`upstreams.${prov} must be an http(s) URL`);
          else ups[prov] = url.replace(/\/$/, "");
        }
        if (Object.keys(ups).length > 0) clean.upstreams = ups;
        break;
      }
      default:
        errors.push(`unknown key "${key}"`);
    }
  }
  return { clean, errors };
}

function loadFileConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const { clean, errors } = validatePatch(raw);
    for (const e of errors) console.warn(`miserly config (${CONFIG_PATH}): ignoring — ${e}`);
    return clean;
  } catch (err) {
    console.warn(`miserly config (${CONFIG_PATH}): unreadable, using defaults —`, err?.message);
    return {};
  }
}

function envOverrides() {
  const raw = {};
  if (process.env.MISERLY_ENABLED !== undefined) raw.enabled = process.env.MISERLY_ENABLED === "true";
  if (process.env.MISERLY_GOAL) raw.goal = process.env.MISERLY_GOAL;
  if (process.env.MISERLY_BUDGET) raw.budget = Number(process.env.MISERLY_BUDGET);
  if (process.env.MISERLY_MIN_TOKENS) raw.minTokens = Number(process.env.MISERLY_MIN_TOKENS);
  if (process.env.MISERLY_COMPRESS_SYSTEM !== undefined)
    raw.compressSystem = process.env.MISERLY_COMPRESS_SYSTEM === "true";
  if (process.env.MISERLY_MARKER !== undefined) raw.marker = process.env.MISERLY_MARKER === "true";
  if (process.env.MISERLY_UPSTREAM) {
    const u = process.env.MISERLY_UPSTREAM.replace(/\/$/, "");
    raw.upstreams = { anthropic: u, openai: u };
  }
  const { clean, errors } = validatePatch(raw);
  for (const e of errors) console.warn(`miserly env override ignored — ${e}`);
  return clean;
}

let fileConfig = loadFileConfig();
const envConfig = envOverrides();

/** Effective config: defaults ← file ← env. PUT edits fileConfig and evicts
 * the same key from envConfig, so the API always wins over a stale env var. */
function effectiveConfig() {
  const merged = { ...DEFAULTS, ...fileConfig, ...envConfig };
  merged.upstreams = {
    ...DEFAULTS.upstreams,
    ...(fileConfig.upstreams ?? {}),
    ...(envConfig.upstreams ?? {}),
  };
  return merged;
}
let CFG = effectiveConfig();

function persistFileConfig() {
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(fileConfig, null, 2) + "\n");
  } catch (err) {
    console.warn(`miserly: could not persist config to ${CONFIG_PATH} —`, err?.message);
  }
}

function applyPatch(clean) {
  fileConfig = { ...fileConfig, ...clean };
  if (clean.upstreams) {
    fileConfig.upstreams = { ...(fileConfig.upstreams ?? {}), ...clean.upstreams };
  }
  for (const key of Object.keys(clean)) delete envConfig[key];
  CFG = effectiveConfig();
  persistFileConfig();
}

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

// Activity feed: newest-first ring buffer of processed chat requests.
// Memory only — restarting the proxy clears it; DELETE /miserly/history too.
const MAX_HISTORY = 200;
const MAX_CAPTURE_CHARS = 20_000;
const history = [];

function detectClient(headers, api) {
  const ua = String(headers["user-agent"] ?? "").toLowerCase();
  if (ua.includes("claude-cli") || ua.includes("claude-code")) return "Claude Code";
  if (ua.includes("cursor")) return "Cursor";
  if (ua.includes("aider")) return "Aider";
  if (ua.includes("codex")) return "Codex";
  return api === "openai" ? "OpenAI-compatible client" : "Anthropic client";
}

async function compressText(text) {
  const tokens = countTokens(text);
  if (tokens < CFG.minTokens) return null;
  // A demanding budget (half the block, unless the user pinned one) keeps the
  // planner from early-stopping after a single gentle stage on mid-size blocks.
  const targetBudget = CFG.budget ?? Math.ceil(tokens / 2);
  const result = await runOptimization({
    input: text,
    goal: CFG.goal,
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
  const out = CFG.marker
    ? `[miserly: compressed ~${tokens.toLocaleString()} → ~${result.optimizedTokens.toLocaleString()} tokens]\n${result.outputText}`
    : result.outputText;
  return { out, tokens, optimized: result.optimizedTokens };
}

async function tryBlock(details, holder, key, label) {
  const value = holder[key];
  if (typeof value !== "string") return;
  const r = await compressText(value);
  if (r) {
    holder[key] = r.out;
    const d = { label, before: r.tokens, after: r.optimized };
    if (CFG.captureContent) {
      d.beforeText = value.slice(0, MAX_CAPTURE_CHARS);
      d.afterText = r.out.slice(0, MAX_CAPTURE_CHARS);
      d.truncated = value.length > MAX_CAPTURE_CHARS || r.out.length > MAX_CAPTURE_CHARS;
    }
    details.push(d);
  }
}

/** Compress eligible text in an Anthropic /v1/messages body, in place. */
async function compressAnthropicBody(body) {
  const details = [];
  if (CFG.compressSystem && body.system !== undefined) {
    if (typeof body.system === "string") {
      await tryBlock(details, body, "system", "system");
    } else if (Array.isArray(body.system)) {
      for (const blk of body.system) {
        if (blk?.type === "text") await tryBlock(details, blk, "text", "system");
      }
    }
  }
  for (const msg of body.messages ?? []) {
    // Never rewrite the model's own prior words — only what the USER side sends.
    if (msg?.role !== "user") continue;
    if (typeof msg.content === "string") {
      await tryBlock(details, msg, "content", "user text");
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block?.type === "text") {
        await tryBlock(details, block, "text", "user text");
      } else if (block?.type === "tool_result") {
        if (typeof block.content === "string") {
          await tryBlock(details, block, "content", "tool_result");
        } else if (Array.isArray(block.content)) {
          for (const part of block.content) {
            if (part?.type === "text") await tryBlock(details, part, "text", "tool_result");
          }
        }
      }
    }
  }
  return details;
}

/** Compress eligible text in an OpenAI /v1/chat/completions body, in place. */
async function compressOpenAIBody(body) {
  const details = [];
  for (const msg of body.messages ?? []) {
    const role = msg?.role;
    const isSystem = role === "system" || role === "developer";
    if (isSystem && !CFG.compressSystem) continue;
    if (role === "assistant") continue; // never rewrite the model's own words
    const label = role === "tool" ? "tool message" : isSystem ? "system" : "user text";
    if (typeof msg.content === "string") {
      await tryBlock(details, msg, "content", label);
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part?.type === "text") await tryBlock(details, part, "text", label);
    }
  }
  return details;
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

function isLocalOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** CORS for the studio's Integrations panel (localhost origins only). */
function corsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isLocalOrigin(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET, PUT, DELETE, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value, null, 2) + "\n");
}

/** Route a request path to the right provider upstream. */
function upstreamFor(url, headers) {
  if (url.startsWith("/v1/messages") || url.startsWith("/v1/complete")) {
    return CFG.upstreams.anthropic;
  }
  if (
    url.startsWith("/v1/chat/completions") ||
    url.startsWith("/v1/completions") ||
    url.startsWith("/v1/responses") ||
    url.startsWith("/v1/embeddings")
  ) {
    return CFG.upstreams.openai;
  }
  // Ambiguous paths (e.g. /v1/models): Anthropic clients identify themselves.
  return headers["anthropic-version"] || headers["x-api-key"]
    ? CFG.upstreams.anthropic
    : CFG.upstreams.openai;
}

async function handleControl(req, res) {
  corsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.url === "/miserly/health" && req.method === "GET") {
    json(res, 200, { ok: true, enabled: CFG.enabled, port: PORT });
    return true;
  }
  if (req.url === "/miserly/stats" && req.method === "GET") {
    json(res, 200, {
      enabled: CFG.enabled,
      ...totals,
      saved: totals.before - totals.after,
      note: "token counts are estimates (~4 chars/token) unless the exact tokenizer is installed",
    });
    return true;
  }
  if (req.url === "/miserly/history" && req.method === "GET") {
    json(res, 200, { capture: CFG.captureContent, entries: history });
    return true;
  }
  if (req.url === "/miserly/history" && req.method === "DELETE") {
    const origin = req.headers.origin;
    if (origin && !isLocalOrigin(origin)) {
      json(res, 403, { error: "forbidden origin" });
      return true;
    }
    history.length = 0;
    json(res, 200, { ok: true });
    return true;
  }
  if (req.url === "/miserly/config" && req.method === "GET") {
    json(res, 200, { ...CFG, configPath: CONFIG_PATH });
    return true;
  }
  if (req.url === "/miserly/config" && req.method === "PUT") {
    // Same stance as the in-app installer: browser cross-site requests carry an
    // Origin header — only localhost pages may change settings.
    const origin = req.headers.origin;
    if (origin && !isLocalOrigin(origin)) {
      json(res, 403, { error: "forbidden origin" });
      return true;
    }
    let patch;
    try {
      patch = JSON.parse((await readBody(req)).toString("utf8"));
    } catch {
      json(res, 400, { error: "body must be valid JSON" });
      return true;
    }
    const { clean, errors } = validatePatch(patch);
    if (errors.length > 0) {
      json(res, 400, { error: errors.join("; ") });
      return true;
    }
    applyPatch(clean);
    console.log(
      `⚙ config updated: ${Object.keys(clean).join(", ")} → compression ${CFG.enabled ? "ON" : "BYPASSED"}`,
    );
    json(res, 200, { ...CFG, configPath: CONFIG_PATH });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/miserly/")) {
      if (await handleControl(req, res)) return;
    }

    let bodyBuf = await readBody(req);

    // Rewrite eligible chat requests (unless bypassed); everything else — and
    // everything when disabled — passes through byte-for-byte.
    const isAnthropicChat = req.method === "POST" && req.url?.startsWith("/v1/messages");
    const isOpenAIChat = req.method === "POST" && req.url?.startsWith("/v1/chat/completions");
    if (CFG.enabled && (isAnthropicChat || isOpenAIChat) && bodyBuf.length > 0) {
      try {
        const body = JSON.parse(bodyBuf.toString("utf8"));
        const api = isAnthropicChat ? "anthropic" : "openai";
        const details = isAnthropicChat
          ? await compressAnthropicBody(body)
          : await compressOpenAIBody(body);
        // Record EVERY parsed chat request — including "nothing over the
        // threshold" ones — so the activity feed shows the whole picture.
        history.unshift({
          id: crypto.randomUUID(),
          ts: Date.now(),
          api,
          client: detectClient(req.headers, api),
          model: typeof body.model === "string" ? body.model : "unknown",
          blocks: details,
          before: details.reduce((a, d) => a + d.before, 0),
          after: details.reduce((a, d) => a + d.after, 0),
        });
        if (history.length > MAX_HISTORY) history.pop();
        if (details.length > 0) {
          totals.requests++;
          bodyBuf = Buffer.from(JSON.stringify(body), "utf8");
          const pct =
            totals.before > 0 ? Math.round((1 - totals.after / totals.before) * 100) : 0;
          const swaps = details.map(
            (d) => `${d.label} ~${d.before.toLocaleString()}→~${d.after.toLocaleString()}`,
          );
          console.log(
            `⇒ compressed ${details.length} block(s): ${swaps.join(", ")} · session total −${pct}% (~${(
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

    const upstreamRes = await fetch(upstreamFor(req.url ?? "/", req.headers) + req.url, {
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
   compression     ${CFG.enabled ? "ON" : "BYPASSED (passthrough)"} · goal ${CFG.goal} · per-block budget ${
     CFG.budget ? CFG.budget.toLocaleString() + " tokens" : "half of each block"
   }
   touches         user text & tool blocks over ~${CFG.minTokens.toLocaleString()} tokens
   system prompt   ${CFG.compressSystem ? "COMPRESSED (cache warning!)" : "untouched (default — protects prompt caching)"}
   upstreams       anthropic → ${CFG.upstreams.anthropic} · openai → ${CFG.upstreams.openai}
   activity feed   ${CFG.captureContent ? "CAPTURING full content (memory-only, explicit opt-in)" : "metadata only — no request text stored"}
   config          ${CONFIG_PATH}

   Claude Code:        ANTHROPIC_BASE_URL=http://localhost:${PORT} claude
   Codex / Aider:      OPENAI_BASE_URL=http://localhost:${PORT}/v1
   Cursor (BYO key):   Settings → Models → Override OpenAI Base URL → http://localhost:${PORT}/v1

   Toggle off/on:      curl -X PUT localhost:${PORT}/miserly/config -d '{"enabled":false}'
   Session savings:    curl localhost:${PORT}/miserly/stats
`);
});
