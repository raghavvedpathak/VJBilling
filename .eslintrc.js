// v7.6 G65 HARDENING: Layer Hierarchy Machine Enforcement
module.exports = {
  root: true,
  extends: ['universe/native'],
  overrides: [
    {
      // Apply this rule strictly to all UI screens, layouts, and components
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
  ]
};