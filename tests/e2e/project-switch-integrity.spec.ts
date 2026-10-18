import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

test("a cross-tab storage event cannot switch away from unsaved engineering models", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  const org = `Switch Guard ${id}`;
  const first = `First ${id}`;
  const second = `Second ${id}`;

  await page.goto("/auth");
  await signUpThroughUi(page, `switch-${id}@example.com`, "Kide-Switch-Guard!Aa1");
  await expect(page).toHaveURL("/projects");
  await page.getByPlaceholder("Acme Robotics").fill(org);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const activeSelection = () =>
    page.evaluate(() => window.localStorage.getItem("kide:active-project"));

  await page.getByPlaceholder("New project name").fill(first);
  await page.getByRole("button", { name: "Project", exact: true }).click();

  // The project is created on the server before the active-project selection
  // is committed in the browser. A button click is not a creation acknowledgement.
  await expect(
    page.getByRole("listitem").filter({ hasText: first }),
  ).toBeVisible();
  await expect.poll(activeSelection).not.toBeNull();
  const firstSelection = (await activeSelection())!;
  const firstProject = JSON.parse(firstSelection) as {
    projectId: string;
    organizationId: string;
  };

  await page.getByPlaceholder("New project name").fill(second);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: second }),
  ).toBeVisible();
  await expect.poll(activeSelection).not.toBe(firstSelection);
  const secondSelection = (await activeSelection())!;
  const secondProject = JSON.parse(secondSelection) as {
    projectId: string;
    organizationId: string;
  };
  expect(secondProject.projectId).not.toBe(firstProject.projectId);
  expect(secondProject.organizationId).toBe(firstProject.organizationId);

  await page
    .getByRole("listitem")
    .filter({ hasText: first })
    .getByRole("link", { name: "Open models" })
    .click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  try {
    await page.context().setOffline(true);
    await page
      .getByRole("combobox", { name: "Reference example workspace" })
      .selectOption("precision-irrigation");
    await page.getByRole("button", { name: "Load selected" }).click();
    await page.getByRole("button", { name: "Replace with example" }).click();
    await expect(page.getByRole("button", { name: /^Agri\.dml/ })).toBeVisible();
    await expect(
      page.getByRole("alert").filter({
        hasText: "These models are still in this browser and are not safely saved.",
      }),
    ).toBeVisible();

    // Simulate the native cross-tab StorageEvent in this authenticated tab.
    // This avoids a second tab's auth/network navigation failing while offline,
    // yet exercises the same synchronous event handler and changed storage.
    await page.evaluate((selection) => {
      window.localStorage.setItem("kide:active-project", selection);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "kide:active-project",
          newValue: selection,
          storageArea: window.localStorage,
        }),
      );
    }, secondSelection!);
    await expect(page.getByRole("button", { name: /^Agri\.dml/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
  }

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.evaluate((selection) => {
    window.localStorage.setItem("kide:active-project", selection);
  }, firstSelection!);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Agri\.dml/ })).toBeVisible();

  // Once saved, ordinary explicit selection of the other blank project works.
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: second })
    .getByRole("link", { name: "Open models" })
    .click();
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
});
