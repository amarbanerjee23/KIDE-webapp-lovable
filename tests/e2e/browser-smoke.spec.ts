import { expect, test } from "@playwright/test";

test("public home and auth surfaces boot without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();

  await page.goto("/auth");
  await expect(page.getByLabel("Work email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  expect(errors).toEqual([]);
});

test("anonymous protected navigation is fail-closed", async ({ page }) => {
  for (const route of ["/projects", "/models", "/designer", "/release"]) {
    await page.goto(route);
    await expect(page).toHaveURL("/");
  }
});
