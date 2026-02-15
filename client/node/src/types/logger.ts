/**
 * Logger interface for client components.
 * Allows optional structured logging with context and message.
 */

export interface Logger {
  debug?: (ctx: object, msg: string) => void;
  info?: (ctx: object, msg: string) => void;
  warn?: (ctx: object, msg: string) => void;
  error?: (ctx: object, msg: string) => void;
}

/** Type for logger factory: either a Logger or an object with get(name)? returning Logger. */
export type LoggerFactory = Logger | { get?(name: string): Logger };

/** Resolve logger from factory (supports loggerFactory or loggerFactory.get(SERVICE_NAME)). */
export function resolveLogger(factory: LoggerFactory | undefined, serviceName: string): Logger {
  if (!factory) return console as unknown as Logger;
  const logger = typeof (factory as { get?: (n: string) => Logger }).get === "function"
    ? (factory as { get: (n: string) => Logger }).get(serviceName)
    : (factory as Logger);
  return logger ?? (console as unknown as Logger);
}
