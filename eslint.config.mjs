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
    // Type information for every TS file in a workspace package; each file
    // resolves its nearest tsconfig.json.
    files: ['shared/**/*.ts', 'backend/**/*.ts', 'app/**/*.{ts,tsx}', 'web/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // shared, backend: plain TS, no React — the full type-checked set.
    files: ['shared/**/*.ts', 'backend/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeCheckedOnly],
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    // Test fakes implement async ports synchronously, and some rely on an
    // `async` throw becoming a rejection; adding an `await` would be noise.
    files: ['shared/**/*.test.ts', 'backend/test/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // The Worker bundle is ELv2 and may only compile in the Apache-2.0
    // protocol package, never the AGPL rest of shared/ (CONTRIBUTING.md, license map). The
    // payload schemas are a subpath of it, kept out of the package barrel so
    // drizzle-zod stays out of the app and web bundles (ARCHITECTURE.md § Sync).
    files: ['backend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@shotledger/shared',
              message:
                'backend/src may only import @shotledger/shared/src/sync (CONTRIBUTING.md, license map).',
            },
          ],
          patterns: [
            {
              regex: '^@shotledger/shared/(?!src/sync(/payload-schemas)?$)',
              message:
                'backend/src may only import @shotledger/shared/src/sync (CONTRIBUTING.md, license map).',
            },
          ],
        },
      ],
    },
  },
  {
    // shared/src/sync is Apache-2.0 and must stay self-contained: zod, the
    // Apache-2.0 drizzle-orm and drizzle-zod (the table definitions and their
    // payload schemas, ARCHITECTURE.md § Sync), and its own files, so the backend never
    // pulls AGPL code through it.
    files: ['shared/src/sync/**/*.ts'],
    ignores: ['shared/src/sync/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!zod$|drizzle-orm$|drizzle-orm/sqlite-core$|drizzle-zod$)(?!\\./)',
              message:
                'shared/src/sync may import only zod, drizzle-orm, drizzle-zod and files in its own directory (CONTRIBUTING.md, license map).',
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
              regex:
                '^(?!zod$|drizzle-orm$|drizzle-orm/sqlite-core$|drizzle-zod$|vitest$|fast-check$)(?!\\./)',
              message:
                'shared/src/sync tests may import only zod, drizzle-orm, drizzle-zod, vitest, fast-check and files in this directory (CONTRIBUTING.md, license map).',
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
      // The type-aware rules that catch real bugs here; the rest of
      // recommendedTypeChecked is noise against RN typings for now.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    // web: the browser app (ARCHITECTURE.md § Web app), React DOM.
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    // App files the web app imports by relative path: they must stay free of
    // react-native, Expo and the `@/` alias. A relative import here must
    // point at a file on this list too.
    files: [
      'app/src/components/shot-value.ts',
      'app/src/components/time-series-chart-math.ts',
      'app/src/features/dates/format.ts',
      'app/src/features/home/home-session-row.ts',
      'app/src/features/session/falt-session-result.ts',
      'app/src/features/session/format-falt-result.ts',
      'app/src/features/session/labels.ts',
      'app/src/theme/colors.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@shotledger/shared(/|$)|i18next$|\\.)',
              message:
                'web/ imports this file: only @shotledger/shared, i18next and listed app files (eslint.config.mjs).',
            },
          ],
        },
      ],
    },
  },
  {
    // Node-run tooling scripts and jest mocks (not bundled by Metro).
    files: [
      'scripts/**/*.mjs',
      // CommonJS because app/jest.config.js has to require it (docs/reqstool/README.md).
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
    // A focused or skipped test passes the gate while proving nothing (#806).
    // Vitest already rejects `.only` under CI; Jest does not, and neither
    // rejects `.skip`. Conditional `skipIf` is not matched.
    files: ['{app,shared,backend,web}/**/*.{test,spec}.{ts,tsx}', 'backend/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(it|test|describe|suite)$/][property.name=/^(only|skip)$/]',
          message: 'No focused or skipped tests: fix the test or delete it (#806).',
        },
        {
          selector: 'CallExpression[callee.name=/^(fit|fdescribe|xit|xtest|xdescribe)$/]',
          message: 'No focused or skipped tests: fix the test or delete it (#806).',
        },
        // A real-time wait is a race on a slow runner and slows the suite.
        // `setTimeout(fn)` / `setTimeout(fn, 0)` (one macrotask) stays allowed.
        {
          selector:
            'CallExpression[callee.name=/^(setTimeout|setInterval)$/][arguments.length>1]:not([arguments.1.value=0])',
          message:
            'No real-time waits in tests: use fake timers (advanceTimersByTimeAsync) or setSystemTime (#806).',
        },
      ],
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
