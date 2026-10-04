// `import.meta.glob` is a Vite transform; the test tsconfig does not load
// vite/client, so declare the one overload migrations-drift.spec.ts uses.
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>;
}
