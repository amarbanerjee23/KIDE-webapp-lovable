import { expect, test } from "@playwright/test";

test("public landing still works when auth infrastructure is absent", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});

test("auth page fails closed with actionable configuration guidance", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveURL("/auth");
  await expect(page.getByText(/DATABASE_URL, BETTER_AUTH_URL and a 32\+ character BETTER_AUTH_SECRET/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeDisabled();
});

test("protected direct navigation returns to home without auth infrastructure", async ({ page }) => {
  await page.goto("/designer");
  await expect(page).toHaveURL("/");
  await page.goto("/projects");
  await expect(page).toHaveURL("/");
});
