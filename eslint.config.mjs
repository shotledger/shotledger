import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.wrangler/**',
      '**/android/**',
      '**/.stryker-tmp/**',
      // `mkdocs build` output. Generated, minified, and not ours to lint.
      'site/**',
      // Agent worktrees are checkouts of this same repo; linting them lints
      // other branches' source through the root config.
      '.claude/worktrees/**',
      'coverage/**',
      'reports/**',
      '**/ios/**',
      '**/*.d.ts',
      'app/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // shared, backend: plain TS, no React
    files: ['shared/**/*.ts', 'backend/**/*.ts'],
    rules: {},
  },
  {
    // The Worker bundle is ELv2 and may only compile in the Apache-2.0
    // protocol package, never the AGPL rest of shared/ (ADR 0017).
    files: ['backend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@shotledger/shared',
              message: 'backend/src may only import @shotledger/shared/src/sync (ADR 0017).',
            },
          ],
          patterns: [
            {
              regex: '^@shotledger/shared/(?!src/sync$)',
              message: 'backend/src may only import @shotledger/shared/src/sync (ADR 0017).',
            },
          ],
        },
      ],
    },
  },
  {
    // shared/src/sync is Apache-2.0 and must stay self-contained: zod and
    // its own files only, so the backend never pulls AGPL code through it.
    files: ['shared/src/sync/**/*.ts'],
    ignores: ['shared/src/sync/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!zod$)(?!\\./)',
              message:
                'shared/src/sync may import only zod and files in its own directory (ADR 0017).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['shared/src/sync/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!zod$|vitest$|fast-check$)(?!\\./)',
              message:
                'shared/src/sync tests may import only zod, vitest, fast-check and files in this directory (ADR 0017).',
            },
          ],
        },
      ],
    },
  },
  {
    // app: React Native components
    files: ['app/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-native': reactNative,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-native/no-unused-styles': 'error',
      'react-native/no-single-element-style-arrays': 'error',
      'react-native/split-platform-components': 'error',
      // Metro's static-asset loading (images, fonts) is require()-based; this
      // is the RN idiom, not a CommonJS holdover.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Node-run tooling scripts and jest mocks (not bundled by Metro).
    files: [
      'scripts/**/*.mjs',
      // CommonJS because app/jest.config.js has to require it (ADR 0015).
      'scripts/reqstool-stem.js',
      'app/scripts/**/*.js',
      'app/plugins/**/*.js',
      'app/**/__mocks__/**/*.js',
      'app/babel.config.js',
      'app/jest.config.js',
      'app/metro.config.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettierConfig,
);
