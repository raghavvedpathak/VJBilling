/* global __dirname */
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

module.exports = [
  // 1. Global Ignores for Native, Metro, and Generated Drizzle Artifacts
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'build/',
      'android/',
      'ios/',
      'drizzle/',
      'coverage/',
      '*.config.js',
    ],
  },

  // 2. Base Expo Config
  ...compat.extends('eslint-config-expo'),

  // 3. Global TypeScript & React Overrides
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',

      // Silence stylistic and unused variable warnings in builds
      '@typescript-eslint/no-unused-vars': 'off',
      'import/first': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/array-type': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // 4. Constitutional Architectural Boundaries (G65 & G67)
  {
    files: ['app/**/*.tsx', 'app/**/*.ts', 'screens/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db',
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).',
            },
            {
              name: '@/db/client',
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).',
            },
            {
              name: '@/db/schema',
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never import schema directly. Use domain types instead (G65).',
            },
            {
              name: 'drizzle-orm',
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: Direct ORM queries in UI components are prohibited (G65).',
            },
            {
              name: 'expo-sqlite',
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: Direct SQLite access in UI components is prohibited (G65).',
            },
          ],
          patterns: [
            {
              group: ['**/db/*', '@/db/*', '**/db'],
              message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Matches String Literals, JSX Text nodes (<Text>₹</Text>), and Template Strings (`₹${x}`)
          selector: ':matches(Literal, JSXText, TemplateElement)[value=/(\\u20B9|₹|\\bINR\\b)/]',
          message: "CURRENCY_HARDCODE: Never hardcode ₹ or 'INR'. Use getCurrencySymbol() or formatRupees() from utils/currency.ts (G67).",
        },
      ],
    },
  },
];