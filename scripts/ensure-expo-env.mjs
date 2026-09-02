// expo-env.d.ts is gitignored (Expo regenerates it locally on `expo start`),
// but `app/tsconfig.json` requires it to exist and CI never runs `expo
// start`, so `pnpm typecheck:app` would otherwise fail on a clean checkout.
// The content is fixed and machine-independent, so write it if missing.
import { existsSync, writeFileSync } from 'node:fs';

const path = 'app/expo-env.d.ts';
const content = `/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be in your git ignore
`;

if (!existsSync(path)) {
  writeFileSync(path, content);
}
