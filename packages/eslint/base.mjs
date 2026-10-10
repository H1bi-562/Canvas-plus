import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/.wxt/**", "**/.output/**", "**/drizzle/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { "quotes": ["error", "double", { avoidEscape: true }], "semi": ["error", "always"], "comma-dangle": ["error", "never"], "indent": ["error", 2, { SwitchCase: 1, ignoredNodes: ["TSTypeParameterInstantiation", "TSUnionType", "TSIntersectionType"] }], "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } }
];
