import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 360_000 });

const examples = [
  { title: "Commercial building air-quality control", file: "Building.dml", level: "1" },
  { title: "Precision irrigation controller", file: "Agri.dml", level: "2" },
  { title: "Municipal water treatment process", file: "WaterPlant.dml", level: "3" },
  { title: "Solar microgrid orchestration", file: "Microgrid.dml", level: "4" },
  { title: "Autonomous warehouse fleet", file: "Ecre.dml", level: "5" },
];

type ExportedFile = {
  path: string;
  kind: string;
  source: string;
  sha256: string;
};

async function exportVerifiedWorkingCopy(page: Page): Promise<ExportedFile[]> {
  await page.goto("/checkpoints");
  const button = page.getByRole("button", { name: "Export model set" });
  await expect(button).toBeEnabled();
  const nextDownload = page.waitForEvent("download");
  await button.click();
  const download = await nextDownload;
  expect(download.suggestedFilename()).toBe("kide-model-set.json");
  const savedPath = await download.path();
  expect(savedPath).not.toBeNull();

  const document = JSON.parse(await readFile(savedPath!, "utf8")) as {
    format: string;
    files: ExportedFile[];
  };
  expect(document.format).toBe("kide.modelset/1");
  expect(Array.isArray(document.files)).toBe(true);
  expect(new Set(document.files.map((file) => file.path)).size).toBe(document.files.length);
  for (const file of document.files) {
    expect(file.source.length).toBeGreaterThan(0);
    expect(file.sha256).toBe(createHash("sha256").update(file.source, "utf8").digest("hex"));
    expect(file.path.endsWith(`.${file.kind}`)).toBe(true);
  }
  return document.files;
}

test("new and existing projects plus five prebuilt examples persist in PostgreSQL", async ({
  page,
}) => {
  const id = randomBytes(8).toString("hex");
  const org = `Example gallery QA ${id}`;

  await page.goto("/auth");
  await signUpThroughUi(page, `example-qa-${id}@example.com`, "Kide-Example-Gallery!Aa1");
  await expect(page).toHaveURL("/projects");
  await page.getByRole("textbox", { name: "Organization name" }).fill(org);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: org })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Explore five real-world control systems" }),
  ).toBeVisible();

  // The original defect: project creation must also work in an existing org.
  for (const name of [`First blank ${id}`, `Second blank ${id}`]) {
    await page.getByRole("textbox", { name: `New project name for ${org}` }).fill(name);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.getByText("Project created successfully.", { exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  for (const template of examples) {
    await expect(page.getByText(`Level ${template.level} of 5`, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: `Use ${template.title} example` }).click();
    await expect(page.getByText("Project created successfully.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Open new project" }).click();
    await expect(page).toHaveURL("/models");
    await expect(
      page.getByRole("button", { name: new RegExp(`^${template.file.replace(".", "\\.")}`) }),
    ).toBeVisible();
    // Check complete file source contents and their SHA-256 hashes, not just tabs.
    const beforeReload = await exportVerifiedWorkingCopy(page);
    expect(beforeReload).toHaveLength(5);
    expect(beforeReload.map((file) => file.kind).sort()).toEqual([
      "activity",
      "cap",
      "dml",
      "mncspec",
      "op",
    ]);
    expect(beforeReload.some((file) => file.path === template.file)).toBe(true);

    await page.reload();
    await page.goto("/models");
    await expect(
      page.getByRole("button", { name: new RegExp(`^${template.file.replace(".", "\\.")}`) }),
    ).toBeVisible();
    const afterReload = await exportVerifiedWorkingCopy(page);
    expect(afterReload).toEqual(beforeReload);
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: template.title })).toBeVisible();
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: org })).toBeVisible();
  }

  // Empty projects remain empty and cannot inherit the last example's files.
  await page
    .locator("li")
    .filter({ hasText: `First blank ${id}` })
    .getByRole("link", { name: "Open models" })
    .click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toHaveCount(0);
  expect(await exportVerifiedWorkingCopy(page)).toEqual([]);
});
