import { expect, test } from "@playwright/test";

test("configured but unreachable PostgreSQL keeps authentication fail-closed", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveURL("/auth");

  await expect(
    page.getByText("The authentication database is configured but cannot be reached."),
  ).toBeVisible();
  await expect(page.getByText("The PostgreSQL database is not configured.")).toHaveCount(0);
  await expect(page.getByText("The public authentication URL is not configured.")).toHaveCount(0);
  await expect(page.getByText("The authentication signing secret is not configured.")).toHaveCount(
    0,
  );

  await expect(
    page.getByText(
      "Verify PostgreSQL availability, TLS settings, network access and the DATABASE_URL credentials.",
    ),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeDisabled();

  const health = await page.request.get("/api/auth/health");
  expect(health.status()).toBe(503);
  await expect(health.json()).resolves.toMatchObject({
    status: "unavailable",
    configured: true,
    operational: false,
    runtimeIssue: "database_unavailable",
    requirements: {
      databaseUrl: "ready",
      betterAuthUrl: "ready",
      betterAuthSecret: "ready",
    },
  });
});
