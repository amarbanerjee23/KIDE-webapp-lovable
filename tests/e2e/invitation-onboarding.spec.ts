import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

test("new invitee follows a secure invitation through signup and accepts once", async ({
  page,
  browser,
}) => {
  const suffix = randomBytes(10).toString("hex");
  const orgName = `Invitation Systems ${suffix}`;
  const inviteeEmail = `invitee-${suffix}@example.com`;
  await page.goto("/auth");
  await signUpThroughUi(page, `inviter-${suffix}@example.com`, "Kide-Inviter-E2e!Aa1");
  await expect(page).toHaveURL("/projects");
  await page.getByPlaceholder("Acme Robotics").fill(orgName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await page.getByRole("textbox", { name: "Invitee email" }).fill(inviteeEmail);
  await page.getByRole("combobox", { name: "Invitation role" }).selectOption("reviewer");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const inviteUrl = await page.getByRole("textbox", { name: "Invitation link" }).inputValue();

  const guest = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const invited = await guest.newPage();
    await invited.setViewportSize({ width: 375, height: 812 });
    await invited.goto(inviteUrl);
    await expect(invited.getByRole("heading", { name: "Your KIDE invitation" })).toBeVisible();
    await expect(invited.getByText(orgName)).toHaveCount(0);
    await expect(invited.getByText(inviteeEmail)).toHaveCount(0);
    await expect(invited.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    await invited.reload();
    await invited.getByRole("link", { name: "Sign in or create account" }).click();
    await expect(invited).toHaveURL(/\/auth\?returnTo=/);
    await signUpThroughUi(invited, inviteeEmail, "Kide-Invitee-E2e!Aa1");
    await expect(invited).toHaveURL(new URL(inviteUrl).pathname);
    await expect(invited.getByRole("heading", { name: `Join ${orgName}` })).toBeVisible();
    await expect(invited.getByText(inviteeEmail)).toBeVisible();
    await invited.getByRole("button", { name: "Accept invitation" }).click();
    await expect(invited).toHaveURL("/team");
    await expect(invited.getByRole("heading", { name: orgName })).toBeVisible();
    await expect(invited.getByText("you are reviewer")).toBeVisible();
    await invited.goto(inviteUrl);
    await expect(invited.getByText("This invitation has already been accepted.")).toBeVisible();
    await expect(invited.getByRole("button", { name: "Accept invitation" })).toBeDisabled();

    await invited.goto("/profile");
    await invited.getByRole("button", { name: "Sign out" }).click();
    await expect(invited).toHaveURL("/");
    await invited.goto("/projects");
    await expect(invited).toHaveURL("/");
  } finally {
    await guest.close();
  }
});

test("invalid invitation paths never expose protected workspace data", async ({ page }) => {
  await page.goto("/invite/not-a-valid-token");
  await expect(page).toHaveURL("/");
  await page.goto("/invite/" + "a".repeat(48));
  await expect(page.getByRole("heading", { name: "Your KIDE invitation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
});
