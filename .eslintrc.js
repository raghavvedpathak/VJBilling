// .eslintrc.js — Phase 1 & 2 Canonical Architecture & Lint Enforcement
module.exports = {
  root: true,
  extends: ['universe/native'],
  overrides: [
    {
      // Apply strictly to all UI screens, layouts, and components
      files: ['app/**/*.tsx', 'app/**/*.ts', 'screens/**/*.tsx', 'components/**/*.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@/db',
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).'
              },
              {
                name: '@/db/client',
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).'
              },
              {
                name: '@/db/schema',
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never import schema directly. Use domain types instead (G65).'
              },
              {
                name: 'drizzle-orm',
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: Direct ORM queries in UI components are prohibited (G65).'
              },
              {
                name: 'expo-sqlite',
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: Direct SQLite access in UI components is prohibited (G65).'
              }
            ],
            patterns: [
              {
                group: ['**/db/*', '@/db/*', '**/db'],
                message: 'PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65).'
              }
            ]
          }
        ],
        'no-restricted-syntax': [
          'error',
          {
            // Matches String Literals, JSX Text nodes (<Text>₹</Text>), and Template Strings (`₹${x}`)
            selector: ':matches(Literal, JSXText, TemplateElement)[value=/(\\u20B9|₹|\\bINR\\b)/]',
            message: "CURRENCY_HARDCODE: Never hardcode ₹ or 'INR'. Use getCurrencySymbol() or formatRupees() from utils/currency.ts (G67)."
          }
        ]
      }
    }
  ]
};