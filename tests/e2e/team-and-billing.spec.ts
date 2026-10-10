import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

test("invitation link is shareable, reviewer access is restricted, and acceptance notifies owner", async ({
  page,
  browser,
}) => {
  const id = randomBytes(8).toString("hex");
  const ownerEmail = `org-owner-${id}@example.com`;
  const reviewerEmail = `org-reviewer-${id}@example.com`;
  const orgName = `Membership Systems ${id}`;

  await page.goto("/auth");
  await signUpThroughUi(page, ownerEmail, "Kide-Owner-E2e!Aa1");
  await expect(page).toHaveURL("/projects");
  await page.getByPlaceholder("Acme Robotics").fill(orgName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();

  await page.goto("/team");
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await page.getByRole("textbox", { name: "Invitee email" }).fill(reviewerEmail);
  await page.getByRole("combobox", { name: "Invitation role" }).selectOption("reviewer");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = page.getByRole("textbox", { name: "Invitation link" });
  await expect(link).toHaveValue(/\/invite\/[0-9a-f]{48}$/);
  const inviteUrl = await link.inputValue();
  await expect(page.getByText("Invitation links are not emailed automatically.")).toBeVisible();

  const reviewerContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const reviewer = await reviewerContext.newPage();
    await reviewer.goto("/auth");
    await signUpThroughUi(reviewer, reviewerEmail, "Kide-Reviewer-E2e!Aa1");
    await expect(reviewer).toHaveURL("/projects");

    await reviewer.goto(inviteUrl);
    await expect(reviewer.getByRole("heading", { name: `Join ${orgName}` })).toBeVisible();
    await reviewer.getByRole("button", { name: "Accept invitation" }).click();
    await expect(reviewer).toHaveURL("/team");
    await expect(reviewer.getByRole("heading", { name: orgName })).toBeVisible();
    await expect(reviewer.getByText("you are reviewer")).toBeVisible();
    await expect(reviewer.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
    await expect(reviewer.getByRole("button", { name: "Remove" })).toHaveCount(0);

    await page.goto("/notifications");
    await expect(page.getByText(`${reviewerEmail} joined the organization`)).toBeVisible();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("You are up to date.")).toBeVisible();

    await reviewer.goto(inviteUrl);
    await expect(reviewer.getByText("This invitation has already been accepted.")).toBeVisible();
    await expect(reviewer.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
  } finally {
    await reviewerContext.close();
  }
});

test("v1.0.0 free evaluation is truthful and paid checkout stays unavailable", async ({ page }) => {
  const id = randomBytes(8).toString("hex");
  await page.goto("/auth");
  await signUpThroughUi(page, `billing-${id}@example.com`, "Kide-Billing-E2e!Aa1");
  await expect(page).toHaveURL("/projects");

  // A direct deep link must never open the payment widget, even before
  // organization onboarding or when the user has no eligible role.
  await page.goto("/checkout?plan=professional");
  await expect(page.getByRole("heading", { name: "Paid checkout is unavailable" })).toBeVisible();
  await expect(page.getByText("KIDE v1.0.0 is a free evaluation.", { exact: false })).toBeVisible();
  await expect(page.locator("#hyper-payment-element")).toHaveCount(0);
  await expect(page.getByText("Preparing your checkout…")).toHaveCount(0);

  await page.goto("/projects");
  await page.getByPlaceholder("Acme Robotics").fill(`Billing Org ${id}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Billing Org ${id}` })).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evaluation access" })).toBeVisible();
  await expect(page.getByText("No payment is required", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upgrade" })).toHaveCount(0);
  await expect(page.getByText("3 projects", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 organization", { exact: true })).toHaveCount(0);
  await expect(page.getByText("5 team members", { exact: true })).toHaveCount(0);

  // The direct checkout route must stay unavailable to an organization owner.
  await page.goto("/checkout?plan=professional");
  await expect(page.getByRole("heading", { name: "Paid checkout is unavailable" })).toBeVisible();
  await page.getByRole("link", { name: "Back to plan & billing" }).click();
  await expect(page).toHaveURL("/billing");
});
