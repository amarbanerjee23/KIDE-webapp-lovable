import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const protectedRoutes = [
  "/projects",
  "/overview",
  "/designer",
  "/models",
  "/workbench",
  "/synthesis",
  "/scenario",
  "/trust",
  "/release",
  "/qualification",
  "/catalogue",
  "/billing",
  "/team",
  "/profile",
  "/reviews",
  "/notifications",
  "/checkpoints",
];

test("configured production auth health is operational", async ({ page }) => {
  const health = await page.request.get("/api/public/auth-health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({
    status: "ready",
    configured: true,
    operational: true,
    runtimeIssue: null,
    requirements: {
      databaseUrl: "ready",
      betterAuthUrl: "ready",
      betterAuthSecret: "ready",
    },
  });
});

test("anonymous users cannot land on protected application routes", async ({ page }) => {
  for (const route of protectedRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL("/");
  }
});

test("new user can sign up, create organization/project, open it, and sign out", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  await page.getByRole("link", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/auth");

  await page.getByRole("button", { name: "Create account" }).last().click();
  const email = `ci-${Date.now()}@example.com`;
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr26-Enterprise-Test-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();

  await expect(page).toHaveURL("/projects");
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();

  await page.getByPlaceholder("Acme Robotics").fill("CI Robotics");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "CI Robotics" })).toBeVisible();

  await page.getByPlaceholder("New project name").fill("CI Flight Controller");
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText("CI Flight Controller")).toBeVisible();

  await page.getByRole("link", { name: "Open overview" }).click();
  await expect(page).toHaveURL("/overview");

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/projects");
  await expect(page).toHaveURL("/");
  expect(pageErrors).toEqual([]);
});

test("public surfaces have no serious WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  const home = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    home.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);

  await page.goto("/auth");
  const auth = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    auth.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);
});
