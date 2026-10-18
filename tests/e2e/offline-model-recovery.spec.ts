import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

test("offline edits remain visible, can be exported locally, and save on reconnect", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  await page.goto("/auth");
  await signUpThroughUi(page, `offline-${id}@example.com`, "Kide-Offline-Recovery!Aa1");
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill(`Offline Org ${id}`);
  await page.getByRole("button", { name: "Create" }).click();
  const projectName = `Offline Project ${id}`;
  await page.getByPlaceholder("New project name").fill(projectName);
  await page.getByRole("button", { name: "Project", exact: true }).click();
  // Do not navigate while the server-side create and active-selection write
  // are still pending: that would cancel the response and lose this test's
  // project context before the workspace persistence coordinator starts.
  await expect(
    page.getByRole("listitem").filter({ hasText: projectName }),
  ).toBeVisible();
  const activeSelection = () =>
    page.evaluate(() => window.localStorage.getItem("kide:active-project"));
  await expect.poll(activeSelection).not.toBeNull();

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.context().setOffline(true);
  try {
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
    await expect(page.getByText("Project workspace could not be loaded")).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export local backup" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile((await download.path())!, "utf8")) as {
      format: string;
      files: Array<{ path: string }>;
    };
    expect(exported.format).toBe("kide.modelset/1");
    expect(exported.files.some((file) => file.path === "Agri.dml")).toBe(true);
  } finally {
    await page.context().setOffline(false);
  }

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Agri\.dml/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toHaveCount(0);
});
