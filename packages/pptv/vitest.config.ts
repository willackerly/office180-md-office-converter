// Architecture: CONTRACT:C4-PPTV-SOURCE.1.0

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "node_modules/**"],
  },
});
