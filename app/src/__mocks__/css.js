// Jest stub for CSS / CSS-module imports (web-only Metro assets); test
// environment doesn't need real styles.
module.exports = new Proxy(
  {},
  {
    get: () => '',
  },
);
