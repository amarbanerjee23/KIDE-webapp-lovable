import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("password auth rejects bad credentials and preserves workspace after re-login", async ({
  page,
}) => {
  const runId = process.env["KIDE_E2E_RUN_ID"] ?? `${Date.now()}`;
  const email = `persistence-${runId}@example.com`;
  const password = "Pr26-Lifecycle-Password!";

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill("Persistent Robotics");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Persistent Robotics" })).toBeVisible();

  await page.getByPlaceholder("New project name").fill("Persistent Controller");
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText("Persistent Controller")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/auth");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page).toHaveURL("/auth");
  await expect(page.getByRole("status")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(page).toHaveURL("/projects");
  await expect(page.getByRole("heading", { name: "Persistent Robotics" })).toBeVisible();
  await expect(page.getByText("Persistent Controller")).toBeVisible();

  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { user?: { email?: string } } | null;
  expect(session?.user?.email).toBe(email);
});

test("explicit sign-out invalidates server session and protected navigation", async ({ page }) => {
  const email = `logout-${Date.now()}@example.com`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr26-Logout-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.ok()).toBe(true);
  expect(await sessionResponse.json()).toBeNull();

  await page.goto("/models");
  await expect(page).toHaveURL("/");
});

test("authenticated user can traverse every protected product surface without page exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const email = `navigation-${Date.now()}@example.com`;
  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr26-Navigation-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill("Navigation Robotics");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByPlaceholder("New project name").fill("Navigation Controller");
  await page.getByRole("button", { name: /project/i }).click();
  await page.getByRole("link", { name: "Open overview" }).click();
  await expect(page).toHaveURL("/overview");

  const routes = [
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

  for (const route of routes) {
    await page.goto(route);
    await expect(page).toHaveURL(route);
    await expect(page.locator("main")).toBeVisible();
  }

  expect(errors).toEqual([]);
});
