import { defineConfig, devices } from "@playwright/test";

const configuredBase = process.env["KIDE_E2E_URL"] ?? "http://127.0.0.1:8080";
const unconfiguredBase =
  process.env["KIDE_E2E_UNCONFIGURED_URL"] ?? "http://127.0.0.1:8081";

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
      testMatch: ["**/configured-auth.spec.ts", "**/auth-lifecycle.spec.ts"],
      use: { ...devices["Desktop Chrome"], baseURL: configuredBase },
    },
    {
      name: "unconfigured-auth",
      testMatch: "**/unconfigured-auth.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: unconfiguredBase },
    },
    {
      name: "compat-chromium",
      testMatch: "**/browser-smoke.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: configuredBase },
    },
    {
      name: "compat-firefox",
      testMatch: "**/browser-smoke.spec.ts",
      use: { ...devices["Desktop Firefox"], baseURL: configuredBase },
    },
    {
      name: "compat-webkit",
      testMatch: "**/browser-smoke.spec.ts",
      use: { ...devices["Desktop Safari"], baseURL: configuredBase },
    },
  ],
});
