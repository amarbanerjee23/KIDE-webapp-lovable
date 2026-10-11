import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

test("two tabs cannot both create a hidden working copy for an initially empty project", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  await page.goto("/auth");
  await signUpThroughUi(page, `initial-race-${id}@example.com`, "Kide-Initial-Save-Race!Aa1");
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill(`Save Race Org ${id}`);
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByPlaceholder("New project name").fill(`Save Race Project ${id}`);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(`Save Race Project ${id}`)).toBeVisible();

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();

  const second = await page.context().newPage();
  try {
    await second.goto("/models");
    await expect(second.getByText("This project has no model files yet")).toBeVisible();
    await second
      .getByRole("combobox", { name: "Reference example workspace" })
      .selectOption("precision-irrigation");

    // Both browser tabs loaded an identical null CAS revision and now
    // attempt the first write at approximately the same time.
    await Promise.all([
      page.getByRole("button", { name: "Load selected" }).click(),
      second.getByRole("button", { name: "Load selected" }).click(),
    ]);

    await expect
      .poll(
        async () =>
          Number(await page.getByText("Save conflict", { exact: true }).isVisible()) +
          Number(await second.getByText("Save conflict", { exact: true }).isVisible()),
        { timeout: 30_000 },
      )
      .toBe(1);

    const firstWon = await page.getByText("Save conflict", { exact: true }).isHidden();
    const winningFile = firstWon ? /^Ecre\.dml/ : /^Agri\.dml/;
    const losingFile = firstWon ? /^Agri\.dml/ : /^Ecre\.dml/;

    const winner = firstWon ? page : second;
    await expect(winner.getByText("Saved", { exact: true })).toBeVisible();
    await Promise.all([page.reload(), second.reload()]);
    for (const tab of [page, second]) {
      await expect(tab.getByRole("button", { name: winningFile })).toBeVisible();
      await expect(tab.getByRole("button", { name: losingFile })).toHaveCount(0);
    }
  } finally {
    await second.close();
  }
});
