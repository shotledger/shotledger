// Web counterpart of migration-gate.tsx. There is no web DB to migrate
// (see client.web.ts) — pass through untouched so the web preview still
// renders start to finish.
export function MigrationGate({ children }: { children: React.ReactNode }) {
  return children;
}
