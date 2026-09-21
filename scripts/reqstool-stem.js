// The dotted "stem" reqstool uses as the `fullyQualifiedName` prefix in
// `annotations.yml`, computed from a path relative to a scan root.
//
// Both test runners have to produce the same string the tag scanner does, or a
// JUnit testcase never matches the `@SVCs` annotation recorded for that same
// test and the requirement reads as unverified (ADR 0015). The scan roots are
// `shared/src`, `backend/src` and `app/src` — see `reqstool:tags` in
// package.json. vitest reports a path from the repo root and jest one from
// `app/`, so each strips its own prefix and `reqstoolStem` does the rest.
//
// CommonJS because `app/jest.config.js` has to `require` it; neither package
// declares `type: module`.
//
// Kept in lock-step with `toStem` in @reqstool/reqstool-typescript-tags.

/**
 * @param {string} pathRelativeToScanRoot
 * @returns {string}
 */
function reqstoolStem(pathRelativeToScanRoot) {
  return pathRelativeToScanRoot
    .replace(/\.(test|spec)\.(ts|tsx)$/, '')
    .replace(/\.(ts|tsx)$/, '')
    .replace(/[\\/]/g, '.');
}

/** vitest's `filename` is relative to the repo root, so the scan root goes first. */
function vitestClassnameTemplate({ filename }) {
  return reqstoolStem(filename.replace(/^(shared|backend|app)\/src\//, ''));
}

/** jest runs in `app/`, so jest-junit's `filepath` already starts at `src/`. */
function jestClassNameTemplate({ filepath }) {
  return reqstoolStem(filepath.replace(/^src\//, ''));
}

module.exports = { reqstoolStem, vitestClassnameTemplate, jestClassNameTemplate };
