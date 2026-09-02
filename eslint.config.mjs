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
      'app/scripts/**/*.js',
      'app/**/__mocks__/**/*.js',
      'app/babel.config.js',
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
