import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "configured-auth",
      testMatch: /configured-auth\.spec\.ts/,
      use: { baseURL: process.env["KIDE_E2E_URL"] ?? "http://127.0.0.1:8080" },
    },
    {
      name: "unconfigured-auth",
      testMatch: /unconfigured-auth\.spec\.ts/,
      use: { baseURL: process.env["KIDE_E2E_UNCONFIGURED_URL"] ?? "http://127.0.0.1:8081" },
    },
  ],
});
