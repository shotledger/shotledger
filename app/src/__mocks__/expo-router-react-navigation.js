// The slice of `expo-router/react-navigation` the app reads, for Jest: the
// real module pulls in query-string, an ES module Jest's CommonJS runtime
// cannot load. A test renders a screen outside any navigator, so no header
// is shown above it — the context's real default.
const { createContext } = require('react');

module.exports = {
  HeaderShownContext: createContext(false),
};
