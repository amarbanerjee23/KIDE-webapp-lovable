import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 300_000 });

const examples = [
  { title: "Commercial building air-quality control", file: "Building.dml", level: "1" },
  { title: "Precision irrigation controller", file: "Agri.dml", level: "2" },
  { title: "Municipal water treatment process", file: "WaterPlant.dml", level: "3" },
  { title: "Solar microgrid orchestration", file: "Microgrid.dml", level: "4" },
  { title: "Autonomous warehouse fleet", file: "Ecre.dml", level: "5" },
];

test("new and existing projects plus five prebuilt examples persist in PostgreSQL", async ({ page }) => {
  const id = randomBytes(8).toString("hex");
  const org = `Example gallery QA ${id}`;

  await page.goto("/auth");
  await signUpThroughUi(page, `example-qa-${id}@example.com`, "Kide-Example-Gallery!Aa1");
  await expect(page).toHaveURL("/projects");
  await page.getByRole("textbox", { name: "Organization name" }).fill(org);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: org })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explore five real-world control systems" })).toBeVisible();

  // The original defect: project creation must also work in an existing org.
  for (const name of [`First blank ${id}`, `Second blank ${id}`]) {
    await page.getByRole("textbox", { name: `New project name for ${org}` }).fill(name);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.getByText(`Project created: ${name}`)).toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  for (const template of examples) {
    await expect(page.getByText(`Level ${template.level} of 5`, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: `Use ${template.title} example` }).click();
    await expect(page.getByText(`Project created: ${template.title}`)).toBeVisible();
    await page.getByRole("link", { name: "Open new project" }).click();
    await expect(page).toHaveURL("/models");
    await expect(page.getByRole("button", { name: new RegExp(`^${template.file.replace(".", "\\.")}`) })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: new RegExp(`^${template.file.replace(".", "\\.")}`) })).toBeVisible();
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: template.title })).toBeVisible();
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: org })).toBeVisible();
  }

  // Reopening a different project must not silently reuse the previous copy.
  await page.getByRole("link", { name: "Open new project" }).click();
  await expect(page.getByRole("button", { name: /^Ecre\.dml/ })).toBeVisible();
});
