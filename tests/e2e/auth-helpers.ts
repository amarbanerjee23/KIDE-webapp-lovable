import { expect, type Page } from "@playwright/test";

export async function signUpThroughUi(
  page: Page,
  email: string,
  password: string,
) {
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);

  const submit = page.getByRole("button", { name: "Create account" }).first();
  const submitOnce = async () => {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/auth/sign-up/email",
    );
    await submit.click();
    return responsePromise;
  };

  let response = await submitOnce();
  if (response.status() === 429) {
    const retryAfter = Number(response.headers()["x-retry-after"] ?? "10");
    await expect(page.getByRole("status")).toContainText(/too many requests/i);
    await page.waitForTimeout(Math.max(1, retryAfter) * 1_000 + 250);
    response = await submitOnce();
  }

  expect(response.status()).toBeLessThan(400);
}
