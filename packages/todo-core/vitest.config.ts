import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Atlas Todo's app definition, which core's scope engine reads (src/app.ts).
    setupFiles: ["./src/register.ts"],
  },
});
