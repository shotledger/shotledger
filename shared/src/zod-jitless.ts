// The web app imports this first (web/src/main.tsx). Its CSP has no
// 'unsafe-eval', and zod's `new Function` probe is reported as a violation
// even though zod falls back. Object schemas read the flag when they are
// defined, so this has to run before any module that defines one.
import { config } from 'zod';

config({ jitless: true });
