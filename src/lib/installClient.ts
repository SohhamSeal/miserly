// Talks to the dev-server install endpoint (see scripts/vite-plugin-installer.mjs).
// Only works while running locally under `npm run dev`. In a production build
// there is no endpoint, so callers should fall back to showing the CLI command.

const ENDPOINT = "/__miserly/api/install";
const DONE_MARKER = "__MISERLY_DONE__";

export interface InstallResult {
  ok: boolean;
  code?: number;
  error?: string;
}

/** True only in a local dev server, where in-app install is possible. */
export const canInstallInApp: boolean = import.meta.env.DEV;

/**
 * Trigger installation of a feature on the host machine, streaming each line of
 * npm output to `onLine`. Resolves once the install finishes. On success the
 * dev server restarts, so the caller should reload the page shortly after.
 */
export async function installFeatureInApp(
  featureKey: string,
  onLine: (line: string) => void,
): Promise<InstallResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: featureKey }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok || !res.body) {
    return { ok: false, error: `Installer endpoint unavailable (HTTP ${res.status}).` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: InstallResult = { ok: false, error: "Installer ended unexpectedly." };

  const flushLine = (line: string) => {
    if (line.startsWith(DONE_MARKER)) {
      try {
        result = JSON.parse(line.slice(DONE_MARKER.length)) as InstallResult;
      } catch {
        result = { ok: false, error: "Could not parse installer result." };
      }
    } else if (line.length) {
      onLine(line);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      flushLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer) flushLine(buffer);

  return result;
}
