import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Worker threads, not forks: Bun's child processes have no `channel.unref()`, which vitest 5.1.1's fork pool calls.
    pool: "threads",
  },
});
