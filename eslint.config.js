/* global __dirname */
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname
});

module.exports = [
  ...compat.extends("eslint-config-expo"),
  {
    // Apply global rule overrides to keep the console clean and warning-free
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      
      // Silence stylistic and unused variable warnings to remove noise
      "@typescript-eslint/no-unused-vars": "off",
      "import/first": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react/display-name": "off",
      "@typescript-eslint/array-type": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  },
  {
    // Apply G65 & G67 rules ONLY to UI layout and component files
    files: ["app/**/*.tsx", "app/**/*.ts", "screens/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens must never touch the database directly. Use the repository or service layer instead."
            },
            {
              name: "../db/client",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens must never touch the database directly. Use the repository or service layer instead."
            },
            {
              name: "../../db/client",
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens must never touch the database directly. Use the repository or service layer instead."
            }
          ],
          patterns: [
            {
              group: ["**/db/*"],
              message: "PHASE 1 CONSTITUTIONAL VIOLATION: UI screens must never touch the database directly. Use the repository or service layer instead."
            }
          ]
        }
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\u20B9|\\bINR\\b/]",
          message: "CURRENCY_HARDCODE: Never hardcode ₹ or 'INR'. Use getCurrencySymbol() from utils/currency.ts (G67)",
        }
      ]
    }
  }
];
