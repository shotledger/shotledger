/**
 * A D1 binding wrapper that counts every call a push makes on the database
 * (`run`/`all`/`raw`/`first` on a statement, or one `batch`) and can pause
 * or fail at call k. It drives the interleavings and crashes in
 * `sync-concurrency.spec.ts` deterministically
 * (docs/specs/sync-push-atomicity-spec.md §7).
 */

export type GateMode =
  | { kind: 'pause'; at: number }
  | { kind: 'fail-before'; at: number }
  | { kind: 'fail-after'; at: number };

export interface Gate {
  d1: D1Database;
  /** Calls made so far. */
  calls(): number;
  /** Resolves when the push reaches call `at` (pause mode only). */
  paused: Promise<void>;
  release(): void;
}

export class SimulatedCrash extends Error {
  constructor(at: number) {
    super(`simulated crash at D1 call ${at}`);
  }
}

const EXECUTE = new Set<PropertyKey>(['run', 'all', 'raw', 'first']);

export function gateD1(real: D1Database, mode: GateMode): Gate {
  let calls = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let markPaused!: () => void;
  const paused = new Promise<void>((resolve) => (markPaused = resolve));
  const unwrap = new WeakMap<object, D1PreparedStatement>();

  async function call<T>(execute: () => Promise<T>): Promise<T> {
    const n = calls++;
    if (n === mode.at) {
      if (mode.kind === 'pause') {
        markPaused();
        await released;
      } else if (mode.kind === 'fail-before') {
        throw new SimulatedCrash(n);
      } else {
        await execute();
        throw new SimulatedCrash(n);
      }
    }
    return execute();
  }

  function forward(target: object, prop: PropertyKey): unknown {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  }

  function wrapStatement(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, prop) {
        if (prop === 'bind') {
          return (...values: unknown[]) => wrapStatement(target.bind(...values));
        }
        if (EXECUTE.has(prop)) {
          const method = Reflect.get(target, prop) as (...args: unknown[]) => Promise<unknown>;
          return (...args: unknown[]) => call(() => method.apply(target, args));
        }
        return forward(target, prop);
      },
    });
    unwrap.set(proxy, statement);
    return proxy;
  }

  const d1 = new Proxy(real, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (query: string) => wrapStatement(target.prepare(query));
      }
      if (prop === 'batch') {
        return (statements: D1PreparedStatement[]) =>
          call(() =>
            target.batch(
              statements.map((statement) => {
                const inner = unwrap.get(statement);
                if (!inner) throw new Error('gateD1: batch got a statement it did not prepare');
                return inner;
              }),
            ),
          );
      }
      if (prop === 'exec' || prop === 'dump' || prop === 'withSession') {
        return () => {
          throw new Error(`gateD1: ${String(prop)} is not gated`);
        };
      }
      return forward(target, prop);
    },
  });

  return { d1, calls: () => calls, paused, release };
}
