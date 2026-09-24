import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", ".output/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/auth/session-policy.ts",
        "src/lib/auth/post-auth-redirect.ts",
        "src/lib/auth/active-session.ts",
        "src/lib/data-access.server.ts",
        "src/lib/project-working-copy.ts",
        "src/lib/active-project.ts",
        "src/lib/kide/workspace-access.ts",
        "src/lib/kide/workspace-files.ts",
        "src/lib/kide/workspace-sources.ts",
        "src/lib/kide/synthesis.ts",
        "src/lib/kide/qualification.ts",
        "src/lib/kide/assurance.ts",
        "src/lib/kide/release.ts",
        "src/lib/kide/catalogue.ts",
        "src/lib/kide/scenario.ts",
        "src/lib/kide/activity-graph.ts",
        "src/lib/kide/sha256.ts",
      ],
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 65,
        lines: 65,
      },
    },
  },
});
