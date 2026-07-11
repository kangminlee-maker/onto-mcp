import { defineConfig } from "vitest/config";

export default defineConfig({
  // The TUI uses React/Ink (.tsx) with the automatic JSX runtime.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    include: [
      "src/core-runtime/*.test.ts",
      "src/core-runtime/{scope-runtime,readers,evolve,learning,review,reconstruct,discovery,govern,cli,llm,mock,translate,onboard,config,install,observability}/**/*.test.ts",
      "src/core-api/**/*.test.ts",
      "src/mcp/**/*.test.ts",
      "src/tui/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
    ],
    testTimeout: 30000,
  },
});
