import { expect, test } from "@playwright/test";

test("auth page identifies DATABASE_URL as the only missing production dependency", async ({
  page,
}) => {
  await page.goto("/auth");
  await expect(page).toHaveURL("/auth");

  await expect(page.getByText("The PostgreSQL database is not configured.")).toBeVisible();
  await expect(page.getByText("The public authentication URL is not configured.")).toHaveCount(0);
  await expect(
    page.getByText("The authentication signing secret is not configured."),
  ).toHaveCount(0);
  await expect(page.getByText(/signing secret is configured but too short/i)).toHaveCount(0);

  await expect(
    page.getByText("Set DATABASE_URL to a reachable PostgreSQL connection string."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeDisabled();
});
