import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

test("checkpoint restore removes extra files and a custom model set imports completely", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");

  await page.goto("/auth");
  await signUpThroughUi(page, `checkpoint-${id}@example.com`, "Kide-Checkpoint-E2e!Aa1");
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill(`Checkpoint Org ${id}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `Checkpoint Org ${id}` })).toBeVisible();
  await page.getByPlaceholder("New project name").fill(`Checkpoint Project ${id}`);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(`Checkpoint Project ${id}`)).toBeVisible();

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await page.getByRole("button", { name: /Load Autonomous warehouse fleet/i }).click();
  await expect(page.getByRole("button", { name: /^Ecre\\.dml/ })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/checkpoints");
  await expect(page.getByRole("button", { name: "Save checkpoint" })).toBeEnabled();
  await page.getByRole("textbox", { name: "Checkpoint name" }).fill("Warehouse baseline");
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  await expect(page.getByText("Warehouse baseline")).toBeVisible();

  await page.goto("/models");
  await page
    .getByRole("combobox", { name: "Reference example workspace" })
    .selectOption("precision-irrigation");
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Replace with example" }).click();
  await expect(page.getByRole("button", { name: /^Agri\\.dml/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ecre\\.dml/ })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/checkpoints");
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("alertdialog")).toContainText('Restore "Warehouse baseline" exactly');
  await page.getByRole("button", { name: "Keep current workspace" }).click();
  await page.goto("/models");
  await expect(page.getByRole("button", { name: /^Agri\\.dml/ })).toBeVisible();

  await page.goto("/checkpoints");
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await page.getByRole("link", { name: "Model languages" }).click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByRole("button", { name: /^Ecre\\.dml/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Agri\\.dml/ })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const source = "DataModel CustomTelemetry {\n}\n";
  const customSet = {
    format: "kide.modelset/1",
    exportedAt: "2026-10-10T00:00:00Z",
    files: [
      {
        path: "custom/Telemetry.dml",
        kind: "dml",
        source,
        sha256: digest(source),
      },
    ],
  };

  await page.goto("/checkpoints");
  await page.locator('input[type="file"][accept="application/json"]').setInputFiles({
    name: "custom-model-set.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(customSet)),
  });
  await expect(page.getByRole("alertdialog")).toContainText("Import 1 verified model files");
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await page.getByRole("link", { name: "Model languages" }).click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByRole("button", { name: /^custom\\/Telemetry\\.dml/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ecre\\.dml/ })).toHaveCount(0);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /^custom\\/Telemetry\\.dml/ })).toBeVisible();

  await page.goto("/checkpoints");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export model set" }).click();
  const download = await downloadPromise;
  const readFile = (await import("node:fs/promises")).readFile;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8")) as typeof customSet;
  expect(exported.files).toHaveLength(1);
  expect(exported.files[0]).toMatchObject({
    path: "custom/Telemetry.dml",
    source,
    sha256: digest(source),
  });
});
