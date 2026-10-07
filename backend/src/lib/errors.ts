import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * A Drizzle query error's message ends in `params: …`, the values the query
 * was run with (session tokens, emails, password hashes). Everything from
 * there on is dropped.
 */
export function redactQueryParams(message: string): string {
  return message.replace(/params:[\s\S]*$/, 'params: [redacted]');
}

/** Hono's default handler logs the whole error object; this logs a redacted line. */
export const logSafeErrors: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  const cause = err.cause instanceof Error ? ` [${err.cause.message}]` : '';
  console.error(redactQueryParams(`${err.name}${cause}: ${err.message}`));
  return c.text('Internal Server Error', 500);
};

/**
 * better-auth's `logger` option. Its extra arguments are error objects, so
 * only the message is logged; better-auth passes a failed query's message
 * through as is, so that is redacted too.
 */
export const redactingAuthLogger = {
  level: 'warn' as const,
  log: (level: 'debug' | 'info' | 'success' | 'warn' | 'error', message: string): void => {
    const line = redactQueryParams(message);
    (level === 'error' ? console.error : console.warn)(
      line.startsWith('[better-auth]') ? line : `[better-auth] ${line}`,
    );
  },
};
