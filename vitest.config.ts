import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/core-runtime/*.test.ts",
      "src/core-runtime/{scope-runtime,readers,evolve,learning,review,reconstruct,discovery,govern,cli,llm,mock,translate,onboard,config,install,observability}/**/*.test.ts",
      "src/core-api/**/*.test.ts",
    ],
    testTimeout: 30000,
  },
});
