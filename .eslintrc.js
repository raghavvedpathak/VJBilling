// v7.6 G65 HARDENING: Layer Hierarchy Machine Enforcement
module.exports = {
  root: true,
  extends: ['universe/native'],
  overrides: [
    {
      // Apply this rule ONLY to UI files
      files: ["app/**/*.tsx", "app/**/*.ts", "screens/**/*.tsx"],
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
  ]
};