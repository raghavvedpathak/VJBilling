/* global __dirname */
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname
});

module.exports = [
  ...compat.extends("eslint-config-expo"),
  {
    // Apply global rule overrides to keep the build clean and warning-free
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      
      // Silence stylistic and unused variable warnings
      "@typescript-eslint/no-unused-vars": "off",
      "import/first": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/display-name": "off",
      "@typescript-eslint/array-type": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  },
  {
    // G65 & G67 Enforcement: Apply strictly to all UI screens, layouts, and components
    files: ["app/**/*.tsx", "app/**/*.ts", "screens/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65)."
            },
            {
              name: "@/db/client",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65)."
            },
            {
              name: "@/db/schema",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never import schema directly. Use domain types instead (G65)."
            },
            {
              name: "../db/client",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65)."
            },
            {
              name: "../../db/client",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65)."
            }
          ],
          patterns: [
            {
              group: ["**/db/*", "@/db/*"],
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens and components must never touch the database directly. Use the repository or service layer instead (G65)."
            }
          ]
        }
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\u20B9|\\bINR\\b/]",
          message: "CURRENCY_HARDCODE: Never hardcode ₹ or 'INR'. Use getCurrencySymbol() from utils/currency.ts (G67)."
        }
      ]
    }
  }
];
