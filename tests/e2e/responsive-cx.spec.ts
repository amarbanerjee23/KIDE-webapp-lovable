import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 240_000 });

test("mobile and tablet navigation remains usable across engineering and management screens", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  await page.goto("/auth");
  await signUpThroughUi(page, `mobile-qa-${id}@example.com`, "Kide-Mobile-QA!Aa1");
  await page.getByPlaceholder("Acme Robotics").fill(`Mobile QA ${id}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Mobile QA ${id}` })).toBeVisible();
  await page.getByPlaceholder("New project name").fill(`Mobile Project ${id}`);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(`Mobile Project ${id}`)).toBeVisible();

  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    for (const route of [
      "/projects",
      "/overview",
      "/models",
      "/designer",
      "/workbench",
      "/synthesis",
      "/trust",
      "/release",
      "/team",
      "/billing",
      "/reviews",
      "/notifications",
      "/checkpoints",
      "/profile",
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(route);
      await expect(page.locator("main").first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `horizontal page overflow at ${width}px on ${route}`).toBeLessThanOrEqual(1);
    }
    await page.goto("/overview");
    await page.getByRole("button", { name: "More workspace destinations" }).click();
    await expect(page.getByRole("menuitem", { name: "Checkpoints" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Checkpoints" }).click();
    await expect(page).toHaveURL("/checkpoints");
  }

  for (const route of ["/overview", "/team", "/billing", "/checkpoints"]) {
    await page.goto(route);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = audit.violations.filter((item) =>
      ["serious", "critical"].includes(item.impact ?? ""),
    );
    expect(serious, `serious WCAG A/AA violations on ${route}`).toEqual([]);
  }
});
