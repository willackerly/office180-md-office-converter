// Architecture: CONTRACT:C4-PPTV-SOURCE.2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "e2e/**", "node_modules/**"],
  },
});
