// Dev tools = seeding/wiping demo data and the component gallery. On in any
// dev build; a sideloaded release build can opt in with
// EXPO_PUBLIC_ENABLE_DEV_TOOLS=1 at build time so the maintainer can load demo
// data on a phone. Never set it for a Play build — it ships a wipe button.
export const DEV_TOOLS_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === '1';
