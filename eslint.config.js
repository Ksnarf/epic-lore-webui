// Flat ESLint config (ESLint 9+), shared across the workspace.
//
// Boundary rule: `packages/lore-client` holds server-side-only, buf-generated
// gRPC clients (docs/design/stack-decision.md, "Monorepo" section -- "the
// browser never speaks gRPC," enforced structurally, not just by convention).
// The `no-restricted-imports` block below makes any import of
// `@epic-lore-webui/lore-client` from `apps/web` a lint error.
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

const restrictedLoreClientImport = {
  paths: [
    {
      name: "@epic-lore-webui/lore-client",
      message:
        "apps/web must never import packages/lore-client -- it is server-side-only " +
        "(buf-generated gRPC clients used only inside apps/bff). See " +
        "docs/design/stack-decision.md, 'Monorepo' section.",
    },
  ],
  patterns: [
    {
      group: ["@epic-lore-webui/lore-client/*"],
      message:
        "apps/web must never import packages/lore-client -- it is server-side-only " +
        "(buf-generated gRPC clients used only inside apps/bff). See " +
        "docs/design/stack-decision.md, 'Monorepo' section.",
    },
  ],
};

export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/generated/**",
      "packages/lore-client/src/gen/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The boundary rule: only apps/web is restricted from importing
    // packages/lore-client. apps/bff and packages/api-types are unaffected.
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", restrictedLoreClientImport],
    },
  },
];
