import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  module?: string;
  action?: string;
  plate?: string;
  supplier?: string;
  durationMs?: number;
  statusCode?: number;
  error?: unknown;
  [key: string]: unknown;
}

function formatError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

class StructuredLogger {
  private logDir: string;
  private isProd: boolean;

  constructor() {
    this.logDir = join(process.cwd(), 'logs');
    this.isProd = process.env.NODE_ENV === 'production';
  }

  private writeLog(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const entry: Record<string, unknown> = {
      timestamp,
      level,
      message,
      ...context,
    };

    if (context?.error) {
      entry.error = formatError(context.error);
    }

    const jsonStr = JSON.stringify(entry);

    if (level === 'error') {
      console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context?.error ? context.error : (context ?? ''));
    } else if (level === 'warn') {
      console.warn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context ?? '');
    } else {
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, context ?? '');
    }

    try {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      const dateStr = timestamp.split('T')[0];
      const logFile = join(this.logDir, `app-${dateStr}.log`);
      appendFileSync(logFile, jsonStr + '\n', 'utf-8');
    } catch {
      // Ignore disk write errors to prevent logger crashing the HTTP server
    }
  }

  public debug(message: string, context?: LogContext): void {
    if (!this.isProd) {
      this.writeLog('debug', message, context);
    }
  }

  public info(message: string, context?: LogContext): void {
    this.writeLog('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.writeLog('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.writeLog('error', message, context);
  }
}

export const logger = new StructuredLogger();
