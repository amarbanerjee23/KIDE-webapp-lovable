import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

async function makeOrganizationAndProject(page: Page, org: string, project: string) {
  await page.getByPlaceholder("Acme Robotics").fill(org);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: org })).toBeVisible();
  await page.getByPlaceholder("New project name").fill(project);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(project)).toBeVisible();
}

test("Reviews and Checkpoints cannot reuse another organization’s projects or role", async ({
  page,
  browser,
}) => {
  const id = randomBytes(9).toString("hex");
  const orgA = `Tenant Alpha ${id}`;
  const orgB = `Tenant Beta ${id}`;
  const projectA = `Alpha Model ${id}`;
  const projectB = `Beta Model ${id}`;
  const userA = `alpha-${id}@example.com`;

  await page.goto("/auth");
  await signUpThroughUi(page, userA, "Kide-Tenant-Alpha!Aa1");
  await expect(page).toHaveURL("/projects");
  await makeOrganizationAndProject(page, orgA, projectA);

  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const other = await otherContext.newPage();
    await other.goto("/auth");
    await signUpThroughUi(other, `beta-${id}@example.com`, "Kide-Tenant-Beta!Aa1");
    await expect(other).toHaveURL("/projects");
    await makeOrganizationAndProject(other, orgB, projectB);

    // Separate authenticated organizations must never enumerate one another.
    await other.goto("/projects");
    await expect(other.getByText(projectA, { exact: true })).toHaveCount(0);
    await page.goto("/projects");
    await expect(page.getByText(projectB, { exact: true })).toHaveCount(0);

    await other.goto("/team");
    await expect(other.getByRole("heading", { name: orgB })).toBeVisible();
    await other.getByRole("textbox", { name: "Invitee email" }).fill(userA);
    await other.getByRole("combobox", { name: "Invitation role" }).selectOption("reviewer");
    await other.getByRole("button", { name: "Create invite link" }).click();
    const invite = await other.getByRole("textbox", { name: "Invitation link" }).inputValue();

    await page.goto(invite);
    await expect(page.getByRole("heading", { name: `Join ${orgB}` })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL("/team");

    for (const route of ["/reviews", "/checkpoints"]) {
      await page.goto(route);
      const organization = page.getByRole("combobox", {
        name: route === "/reviews" ? "Review organization" : "Checkpoint organization",
      });
      const projects = page.getByRole("combobox", {
        name: route === "/reviews" ? "Review project" : "Checkpoint project",
      });
      await expect(organization).toHaveValue(/.+/);
      await organization.selectOption({ label: orgA });
      await organization.selectOption({ label: orgB });
      await organization.selectOption({ label: orgA });
      await organization.selectOption({ label: orgB });
      await expect(projects).toBeEnabled();
      await expect(projects.locator("option", { hasText: projectB })).toHaveCount(1);
      await expect(projects.locator("option", { hasText: projectA })).toHaveCount(0);
      await expect(projects).toHaveValue("");
      if (route === "/reviews") {
        await expect(page.getByRole("button", { name: "Request review" })).toBeDisabled();
      } else {
        await expect(page.getByRole("button", { name: "Save checkpoint" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
      }

      await organization.selectOption({ label: orgA });
      await expect(projects).toBeEnabled();
      await expect(projects.locator("option", { hasText: projectA })).toHaveCount(1);
      await expect(projects.locator("option", { hasText: projectB })).toHaveCount(0);
      await projects.selectOption({ label: projectA });
      if (route === "/checkpoints") {
        await expect(page.getByRole("button", { name: "Save checkpoint" })).toBeEnabled();
      }
    }
  } finally {
    await otherContext.close();
  }
});
