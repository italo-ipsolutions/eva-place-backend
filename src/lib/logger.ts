/**
 * Logger estruturado simples.
 * Imprime JSON para facilitar parsing futuro.
 * Em producao trocar por pino ou winston.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  subscriber_id?: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logInbound(subscriberId: string, type: "text" | "audio" | "image", message?: string): void {
  emit({
    ts: new Date().toISOString(),
    level: "info",
    event: "inbound",
    subscriber_id: subscriberId,
    type,
    message: message?.slice(0, 120),
  });
}

export function logOutbound(
  subscriberId: string,
  intent: string,
  source: string,
  action: string,
  replyPreview?: string
): void {
  emit({
    ts: new Date().toISOString(),
    level: "info",
    event: "outbound",
    subscriber_id: subscriberId,
    intent,
    source,
    action,
    reply_preview: replyPreview?.slice(0, 100),
  });
}

export function logError(event: string, error: unknown, extra?: Record<string, unknown>): void {
  emit({
    ts: new Date().toISOString(),
    level: "error",
    event,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

export function logWarn(event: string, extra?: Record<string, unknown>): void {
  emit({
    ts: new Date().toISOString(),
    level: "warn",
    event,
    ...extra,
  });
}

export function logInfo(event: string, extra?: Record<string, unknown>): void {
  emit({
    ts: new Date().toISOString(),
    level: "info",
    event,
    ...extra,
  });
}
