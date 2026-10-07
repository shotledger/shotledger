import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * Hono's default handler logs the whole error, and a Drizzle query error's
 * message carries the bound parameters (session tokens, emails). This logs
 * the error's name and the driver's own message instead.
 */
export const logSafeErrors: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  const cause = err.cause instanceof Error ? `: ${err.cause.message}` : '';
  console.error(`${err.name}${cause}`);
  return c.text('Internal Server Error', 500);
};
