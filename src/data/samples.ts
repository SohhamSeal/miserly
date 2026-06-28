import type { ContentType } from "@/engine";

export interface Sample {
  id: string;
  name: string;
  description: string;
  hint: ContentType;
  content: string;
}

function repeat(fn: (i: number) => string, n: number): string {
  return Array.from({ length: n }, (_, i) => fn(i)).join("\n");
}

const ROUTES = ["/api/orders", "/api/users", "/api/cart", "/healthz", "/api/payments"];
const LEVELS = ["INFO", "INFO", "INFO", "WARN", "DEBUG"];

const incidentLogs = [
  "=== service: checkout-api · region: us-east-1 · build: 4f2c9a1 ===",
  repeat(
    (i) =>
      `2026-06-27T08:${String(10 + (i % 48)).padStart(2, "0")}:${String(i % 60).padStart(
        2,
        "0",
      )}.${String((i * 37) % 1000).padStart(3, "0")}Z ${LEVELS[i % LEVELS.length]}  ` +
      `[req-7f3a${String(1000 + i)}] ${ROUTES[i % ROUTES.length]} -> 200 in ${8 + (i % 40)}ms`,
    70,
  ),
  repeat(() => "2026-06-27T08:30:01.000Z DEBUG [health] liveness probe OK", 12),
  "2026-06-27T08:31:14.882Z WARN  [pool] db connection pool at 92% capacity",
  "2026-06-27T08:31:15.114Z WARN  [pool] db connection pool at 94% capacity",
  "2026-06-27T08:31:16.901Z ERROR [orders] failed to commit transaction tx-2f9c-44ab-91de-77c0",
  `{"event":"order_failed","order_id":"a3f9c2b1-44ab-49de-91c0-77c0aa12bb34","user_id":4471,"amount":129.99,"currency":"USD","attempt":3,"gateway":"stripe","reason":"timeout"}`,
  `{"event":"order_failed","order_id":"b1c2d3e4-55fa-40de-81c0-99c0aa34cc56","user_id":4472,"amount":59.0,"currency":"USD","attempt":2,"gateway":"stripe","reason":"timeout"}`,
  "2026-06-27T08:31:17.001Z ERROR [orders] Unhandled exception while processing order",
  "Traceback (most recent call last):",
  '  File "/srv/app/orders/service.py", line 142, in process_order',
  "    gateway.charge(order, idempotency_key=key)",
  '  File "/srv/app/payments/stripe.py", line 88, in charge',
  "    resp = self._client.post(url, json=payload, timeout=self.timeout)",
  '  File "/usr/lib/python3.12/site-packages/httpx/_client.py", line 1014, in post',
  "    return self.request('POST', url, ...)",
  '  File "/usr/lib/python3.12/site-packages/httpx/_client.py", line 901, in request',
  "    raise ReadTimeout(message) from exc",
  "httpx.ReadTimeout: The read operation timed out after 5.0s",
  repeat(
    (i) =>
      `2026-06-27T08:31:${String(18 + (i % 30)).padStart(2, "0")}.000Z INFO  [retry] re-queueing order attempt ${i % 4}`,
    24,
  ),
].join("\n");

const tsService = `import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { logger } from "../logger";

// Schema for creating an order. Keep this in sync with the OpenAPI spec.
const CreateOrder = z.object({
  userId: z.number().int().positive(),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
  couponCode: z.string().optional(),
});

/**
 * Orders router.
 *
 * This file is intentionally a little verbose so that the optimizer has
 * something to chew on: comments, blank lines, and defensive boilerplate.
 */
export const ordersRouter = Router();

ordersRouter.post("/orders", async (req, res) => {
  // Validate the incoming payload before doing anything else.
  const parsed = CreateOrder.safeParse(req.body);
  if (!parsed.success) {
    // Return a 400 with the validation issues.
    return res.status(400).json({ error: "invalid_payload", issues: parsed.error.issues });
  }

  const { userId, items, couponCode } = parsed.data;

  try {
    // Look up the user first so we can fail fast.
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }

    // Compute the total. In a real system this would be a service call.
    let total = 0;
    for (const item of items) {
      const product = await db.product.findUnique({ where: { sku: item.sku } });
      if (!product) {
        return res.status(404).json({ error: "product_not_found", sku: item.sku });
      }
      total += product.price * item.qty;
    }

    // Apply the coupon if present.
    if (couponCode) {
      const coupon = await db.coupon.findUnique({ where: { code: couponCode } });
      if (coupon) {
        total = total * (1 - coupon.discount);
      }
    }

    const order = await db.order.create({ data: { userId, total } });
    logger.info("order_created", { orderId: order.id, total });
    return res.status(201).json(order);
  } catch (err) {
    logger.error("order_failed", { err });
    return res.status(500).json({ error: "internal_error" });
  }
});
`;

const ragKnowledge = `# Postgres Connection Pooling — Runbook

## Summary

This document explains how our services pool Postgres connections and what to
do when the pool saturates. It is long on purpose; most of it is background and
can be summarized aggressively without losing the operational facts.

## Background

Every service instance opens a pool of connections to the primary database.
The pool is sized at startup based on the CPU count of the host. In practice we
have found that more connections is not better: beyond a certain point the
database spends more time context switching than doing useful work, and tail
latency goes up rather than down.

## Symptoms of saturation

When the pool saturates you will typically see the following. Requests begin to
queue waiting for a free connection. The p99 latency climbs even though the
database CPU is not maxed out. You may see warnings in the logs that say the
pool is at high capacity. Eventually requests start timing out because they
wait longer than the configured acquire timeout.

## Immediate mitigation

The fastest mitigation is to reduce load on the database. Shed non-critical
traffic first. Disable background jobs that are not time sensitive. If a single
tenant is responsible for the spike, rate limit that tenant specifically rather
than degrading everyone.

## Root cause analysis

After the incident is over, look at the slow query log. Most saturation events
are caused by one or two queries that have lost their index, often after a
schema migration. Confirm with EXPLAIN ANALYZE that the query plan is using the
index you expect. If it is not, the statistics may be stale; run ANALYZE on the
table.

## Prevention

Set a sensible upper bound on the pool size and do not raise it reflexively when
you see saturation. Add a circuit breaker so that a slow database does not turn
into a cascading failure across every service. Most importantly, add an alert on
pool utilization so that you find out about saturation before your users do.
`;

const chatHistory = repeat(
  (i) =>
    [
      `User: Question ${i + 1}: can you explain how the retry logic works for failed payments, in detail please?`,
      `Assistant: Sure. When a payment fails with a transient error such as a timeout, the worker re-queues the job with exponential backoff. It will retry up to three times. After the third failure the order is moved to a dead-letter queue for manual review, and an alert is sent to the on-call engineer.`,
    ].join("\n"),
  14,
);

const k8sEvents = [
  repeat(
    (i) =>
      `{"ts":"2026-06-27T08:${String(10 + (i % 40)).padStart(2, "0")}:00Z","kind":"Event","reason":"${
        ["Pulled", "Created", "Started", "BackOff", "Unhealthy"][i % 5]
      }","pod":"checkout-${7000 + i}","node":"ip-10-0-${i % 8}-${i % 200}","msg":"container event ${i}"}`,
    80,
  ),
  repeat(
    () =>
      `{"ts":"2026-06-27T08:32:00Z","kind":"Event","reason":"Unhealthy","pod":"checkout-7042","node":"ip-10-0-3-44","msg":"Readiness probe failed: HTTP 503"}`,
    18,
  ),
].join("\n");

export const SAMPLES: Sample[] = [
  {
    id: "incident-logs",
    name: "Incident logs + stack trace",
    description: "Noisy service logs with repeated lines, JSON events and a Python traceback.",
    hint: "logs",
    content: incidentLogs,
  },
  {
    id: "ts-service",
    name: "TypeScript service",
    description: "A verbose Express route handler with comments and boilerplate.",
    hint: "code",
    content: tsService,
  },
  {
    id: "rag-runbook",
    name: "Knowledge base / runbook",
    description: "A long Markdown runbook — ideal for summarization and retrieval compressors.",
    hint: "knowledge",
    content: ragKnowledge,
  },
  {
    id: "chat-history",
    name: "Chat history",
    description: "A repetitive multi-turn conversation between a user and an assistant.",
    hint: "chat",
    content: chatHistory,
  },
  {
    id: "k8s-events",
    name: "Kubernetes events (JSON)",
    description: "Structured JSON event stream with many near-duplicate records.",
    hint: "json",
    content: k8sEvents,
  },
];
