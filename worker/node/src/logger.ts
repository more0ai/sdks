/**
 * Minimal logger for the worker. Matches the interface expected by main/config
 * (package + method prefix, structured context + message). Replace with
 * @more0ai/logger or another logger if available.
 */

export type LogMethod = (ctx: Record<string, unknown>, msg: string) => void;

export interface LoggerInstance {
  info?: LogMethod;
  warn?: LogMethod;
  error?: LogMethod;
}

function log(level: string, ctx: Record<string, unknown>, msg: string): void {
  const payload = Object.keys(ctx).length ? { ...ctx, msg } : { msg };
  const line = JSON.stringify({ level, ...payload });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function makeMethod(level: string): LogMethod {
  return (ctx: Record<string, unknown>, msg: string) => log(level, ctx, msg);
}

/**
 * Create a node-style logger factory. Returns an object with get(prefix)
 * that returns a logger instance with info, warn, error methods.
 */
export function createNodeJSLogger(_serviceName: string): {
  get: (prefix: string) => LoggerInstance;
} {
  return {
    get(prefix: string) {
      const p = prefix;
      return {
        info: (ctx: Record<string, unknown>, msg: string) =>
          log("info", { ...ctx, prefix: p }, msg),
        warn: (ctx: Record<string, unknown>, msg: string) =>
          log("warn", { ...ctx, prefix: p }, msg),
        error: (ctx: Record<string, unknown>, msg: string) =>
          log("error", { ...ctx, prefix: p }, msg),
      };
    },
  };
}
