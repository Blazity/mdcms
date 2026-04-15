export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogContext = Record<string, unknown>;

export type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  meta?: LogContext;
};

/**
 * Logger is the shared logging contract consumed by runtime packages.
 */
export interface Logger {
  child(context: LogContext): Logger;
  log(level: LogLevel, message: string, meta?: LogContext): void;
  trace(message: string, meta?: LogContext): void;
  debug(message: string, meta?: LogContext): void;
  info(message: string, meta?: LogContext): void;
  warn(message: string, meta?: LogContext): void;
  error(message: string, meta?: LogContext): void;
  fatal(message: string, meta?: LogContext): void;
}

export type ConsoleLoggerOptions = {
  level?: LogLevel;
  context?: LogContext;
  clock?: () => Date;
  sink?: (entry: LogEntry) => void;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function shouldLog(messageLevel: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_PRIORITY[messageLevel] >= LEVEL_PRIORITY[minLevel];
}

function defaultConsoleSink(entry: LogEntry): void {
  const payload = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
    context: entry.context,
    meta: entry.meta,
  };

  if (entry.level === "trace" || entry.level === "debug") {
    console.debug(payload);
    return;
  }

  if (entry.level === "info") {
    console.info(payload);
    return;
  }

  if (entry.level === "warn") {
    console.warn(payload);
    return;
  }

  console.error(payload);
}

function formatMeta(meta?: LogContext): string {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  const pairs = Object.entries(meta)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const hasObjects = value.some(
          (item) => typeof item === "object" && item !== null,
        );
        return `${key}=${hasObjects ? JSON.stringify(value) : value.join(",")}`;
      }

      if (typeof value === "object" && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }

      return `${key}=${String(value)}`;
    })
    .join(" ");

  return ` ${pairs}`;
}

/**
 * createCliConsoleSink formats log entries as human-friendly text for CLI use.
 * When write is provided, it is called with each formatted line.
 * When omitted, routes through console methods matching defaultConsoleSink routing.
 */
export function createCliConsoleSink(
  write?: (line: string) => void,
): (entry: LogEntry) => void {
  return (entry: LogEntry): void => {
    const merged = { ...entry.context, ...entry.meta };
    const meta = formatMeta(
      Object.keys(merged).length > 0 ? merged : undefined,
    );
    let line: string;

    if (entry.level === "trace" || entry.level === "debug") {
      line = `[${entry.level}] ${entry.message}${meta}`;
    } else if (entry.level === "info") {
      line = `${entry.message}${meta}`;
    } else if (entry.level === "warn") {
      line = `Warning: ${entry.message}${meta}`;
    } else {
      // error | fatal
      line = `Error: ${entry.message}${meta}`;
    }

    if (write !== undefined) {
      write(line);
      return;
    }

    if (entry.level === "trace" || entry.level === "debug") {
      console.debug(line);
      return;
    }

    if (entry.level === "info") {
      console.info(line);
      return;
    }

    if (entry.level === "warn") {
      console.warn(line);
      return;
    }

    console.error(line);
  };
}

/**
 * createConsoleLogger provides a lightweight structured logger implementation
 * for all runtime adapters without introducing a third-party logger yet.
 */
export function createConsoleLogger(
  options: ConsoleLoggerOptions = {},
): Logger {
  const minLevel = options.level ?? "info";
  const baseContext = options.context ?? {};
  const clock = options.clock ?? (() => new Date());
  const sink = options.sink ?? defaultConsoleSink;

  const createScopedLogger = (context: LogContext): Logger => {
    const log = (level: LogLevel, message: string, meta?: LogContext): void => {
      if (!shouldLog(level, minLevel)) {
        return;
      }

      sink({
        level,
        message,
        timestamp: clock().toISOString(),
        context,
        meta,
      });
    };

    return {
      child(childContext: LogContext): Logger {
        return createScopedLogger({
          ...context,
          ...childContext,
        });
      },
      log,
      trace(message, meta) {
        log("trace", message, meta);
      },
      debug(message, meta) {
        log("debug", message, meta);
      },
      info(message, meta) {
        log("info", message, meta);
      },
      warn(message, meta) {
        log("warn", message, meta);
      },
      error(message, meta) {
        log("error", message, meta);
      },
      fatal(message, meta) {
        log("fatal", message, meta);
      },
    };
  };

  return createScopedLogger(baseContext);
}
