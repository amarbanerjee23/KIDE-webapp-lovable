import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("password auth rejects bad credentials and preserves workspace after re-login", async ({
  page,
}, testInfo) => {
  const runId = process.env["KIDE_E2E_RUN_ID"] ?? `${Date.now()}`;
  const email = `persistence-${runId}-r${testInfo.retry}@example.com`;
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

test("project UX keeps context truthful and confirms destructive example replacement", async ({
  page,
}) => {
  const email = `ux-flow-${Date.now()}@example.com`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr39-Ux-Flow-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill("UX Aerospace");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "UX Aerospace" })).toBeVisible();

  await page.getByPlaceholder("New project name").fill("Flight Control UX");
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText("Flight Control UX")).toBeVisible();

  // Empty projects must not pretend that the warehouse example files already exist.
  await expect(page.getByText("Ecre.dml")).toHaveCount(0);
  await expect(page.getByText("MissionPlanning.activity")).toHaveCount(0);

  await page.getByRole("link", { name: "Open overview" }).click();
  await expect(page).toHaveURL("/overview");
  await expect(page.getByRole("heading", { name: "Flight Control UX" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);

  await page.getByRole("button", { name: "More workspace destinations" }).click();
  await expect(page.getByRole("menuitem", { name: "Trust centre" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/workbench");
  await expect(page.getByRole("heading", { name: "Flight Control UX" })).toBeVisible();
  await expect(page.getByText("Warehouse Fleet")).toHaveCount(0);
  await expect(page.getByText("Optimize fleet route")).toHaveCount(0);
  await expect(page.getByText("No model files yet")).toBeVisible();

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await page.getByRole("button", { name: /Load Autonomous warehouse fleet/i }).click();
  await expect(page.getByText("Ecre.dml")).toBeVisible();

  // A second load would replace authored/saved files, so it must require explicit confirmation.
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Replace this project workspace?")).toBeVisible();
  await page.getByRole("button", { name: "Keep current workspace" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("Ecre.dml")).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/overview");
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);
});

test("saved UI preferences and designer persistence state survive real workflow changes", async ({
  page,
}) => {
  const email = `ux-preferences-${Date.now()}@example.com`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr40-Ux-Preferences-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill("Preference Systems");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByPlaceholder("New project name").fill("Preference Controller");
  await page.getByRole("button", { name: /project/i }).click();

  await page.goto("/models");
  const loadExample = page.getByRole("button", { name: "Load selected" });
  await expect(loadExample).toBeEnabled();
  await loadExample.click();
  await expect(page.getByText("Ecre.dml")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/profile");
  await page.getByLabel("Theme").selectOption("light");
  await page.getByLabel("Density").selectOption("comfortable");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");

  await page.goto("/overview");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");

  await page.goto("/designer");
  await expect(page.getByRole("heading", { name: "Activity designer" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 800, height: 900 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.context().setOffline(true);
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();

  const navigateCapability = page.getByRole("button", { name: /Navigate/ }).first();
  await expect(navigateCapability).toBeEnabled();
  await navigateCapability.click();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/profile");
  await page.getByLabel("Theme").selectOption("high-contrast");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "high-contrast");

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);
});

test("engineering page Back control returns to the previous protected page", async ({ page }) => {
  const email = `back-navigation-${Date.now()}@example.com`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr55-Back-Navigation-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill("Back Navigation Systems");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByPlaceholder("New project name").fill("Navigation Controller");
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText("Navigation Controller")).toBeVisible();

  await page.goto("/models");
  await expect(page).toHaveURL("/models");
  await page.goto("/scenario");
  await expect(page).toHaveURL("/scenario");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/models");

  await page.goto("/qualification");
  await expect(page).toHaveURL("/qualification");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL("/models");
});

