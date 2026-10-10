import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 240_000 });

async function capture(page: Page, name: string) {
  await mkdir("test-results/ux-gallery", { recursive: true });
  await page.screenshot({
    path: `test-results/ux-gallery/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

async function expectNoPageOverflow(page: Page, width: number, route: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow at ${width}px on ${route}`).toBeLessThanOrEqual(1);
}

test("first visitor sees accessible home, a working signup CTA and clear sign-in", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Engineer control systems with evidence/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
    await expectNoPageOverflow(page, width, "/");
    await capture(page, `01-home-${width}`);
  }

  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\?mode=signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await capture(page, "02-signup-375");

  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/auth");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    audit.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("new engineer creates the first project, loads linked models and navigates on mobile", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  const orgName = `First Run QA ${id}`;
  const projectName = `First Design ${id}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/auth");
  await signUpThroughUi(page, `first-run-${id}@example.com`, "Kide-First-Run-QA!Aa1");
  await expect(page).toHaveURL("/projects");
  await expect(page.getByRole("heading", { name: "Create your first organization" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Organization name" })).toBeVisible();
  await capture(page, "03-empty-account");

  await page.getByRole("textbox", { name: "Organization name" }).fill(orgName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build your first engineering project" }),
  ).toBeVisible();
  await capture(page, "04-empty-organization");

  await page.getByRole("textbox", { name: `New project name for ${orgName}` }).fill(projectName);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(projectName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start your first design" })).toBeVisible();
  await capture(page, "05-first-project");

  await page.getByRole("link", { name: "Start modelling" }).click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await capture(page, "06-empty-models");
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Engineering flow" })).toBeVisible();
  await capture(page, "07-populated-overview");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expectNoPageOverflow(page, 375, "/overview");
  await page.getByRole("button", { name: "More workspace destinations" }).click();
  await expect(page.getByRole("menuitem", { name: "Model languages" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Checkpoints" })).toBeVisible();
  await capture(page, "08-mobile-workspace-menu");
  await page.getByRole("menuitem", { name: "Model languages" }).click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toBeVisible();
  await capture(page, "09-mobile-models");

  const auditRoutes = [
    "/designer",
    "/workbench",
    "/synthesis",
    "/scenario",
    "/qualification",
    "/catalogue",
    "/trust",
    "/release",
    "/reviews",
    "/checkpoints",
    "/team",
    "/notifications",
    "/billing",
    "/profile",
  ];
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of auditRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expectNoPageOverflow(page, width, route);
      await capture(page, `10-${width}-${route.slice(1)}`);
    }
  }
  expect(errors).toEqual([]);
});
