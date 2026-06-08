// Lightweight error reporting: always logs; optionally fans out to a webhook
// (Slack `text` + Discord `content` are both included so either works). Never
// throws — error reporting must not cause errors.

import { config } from "./config";

export function reportError(where: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[error] ${where}:`, detail);

  const url = config.errorWebhookUrl;
  if (!url) return;

  const summary = (err instanceof Error ? err.message : String(err)).slice(0, 400);
  const text = `🛑 CodeOutbox error in ${where}: ${summary}`;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
    }).catch(() => {});
  } catch {
    /* never throw from the reporter */
  }
}
