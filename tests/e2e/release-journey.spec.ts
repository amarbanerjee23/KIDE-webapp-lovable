import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function createProject(page: Page, prefix: string) {
  const emailPrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const email = `${emailPrefix}-${Date.now()}@example.com`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("Pr57-Release-Journey-Password!");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill(`${prefix} Organization`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: `${prefix} Organization` })).toBeVisible();

  await page.getByPlaceholder("New project name").fill(`${prefix} Project`);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(`${prefix} Project`)).toBeVisible();

  return { email };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return inner;
  });
}

test("customer can go from an empty project to a verified generated release bundle", async ({
  page,
}) => {
  await createProject(page, "Release Journey");

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();

  const loadExample = page.getByRole("button", { name: /Load Autonomous warehouse fleet/i });
  await expect(loadExample).toBeEnabled();
  await loadExample.click();
  await expect(page.getByText("Ecre.dml")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/synthesis");
  await expect(page.getByRole("radiogroup", { name: "Synthesis candidates" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Generated control model", exact: true }),
  ).toBeVisible();
  await expect(page.locator("pre")).toContainText("ControlNode");
  await expect(page.getByText("Independently re-checked, no errors").first()).toBeVisible();

  const approve = page.getByRole("button", { name: "Approve design" });
  await expect(approve).toBeEnabled();
  await approve.click();

  await page.goto("/trust");
  await expect(page.getByText("Ready for release", { exact: true })).toBeVisible();
  await expect(page.getByText(/100% traced/)).toBeVisible();

  await page.goto("/release");
  const exportBundle = page.getByRole("button", { name: "Export bundle" });
  await expect(exportBundle).toBeEnabled();
  await expect(page.getByText("A reviewer approved this exact design")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await exportBundle.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("kide-release-1.0.0.json");

  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const payload = JSON.parse(await readFile(downloadedPath!, "utf8")) as {
    manifest: {
      releasable: boolean;
      blockedBy: string[];
      design: string | null;
      artifacts: Array<{ path: string; kind: string; bytes: number; sha256: string }>;
    };
    manifestSha256: string;
    approvedBy: { candidateId: string; candidateName: string; fingerprint: string } | null;
    artifacts: Array<{
      path: string;
      kind: string;
      bytes: number;
      sha256: string;
      content: string;
    }>;
  };

  expect(payload.manifest.releasable).toBe(true);
  expect(payload.manifest.blockedBy).toEqual([]);
  expect(payload.manifest.design).toBeTruthy();
  expect(payload.approvedBy?.candidateId).toBeTruthy();
  expect(payload.approvedBy?.candidateName).toBe(payload.manifest.design);
  expect(payload.manifestSha256).toHaveLength(64);
  expect(sha256(canonical(payload.manifest))).toBe(payload.manifestSha256);

  expect(payload.artifacts.length).toBe(payload.manifest.artifacts.length);
  for (const artifact of payload.artifacts) {
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }

  const generated = payload.artifacts.find(
    (artifact) => artifact.kind === "generated" && artifact.path.endsWith(".mncspec"),
  );
  expect(generated).toBeDefined();
  expect(generated!.content).toContain("ControlNode");
  expect(generated!.content).toContain("implements interface");

  const validation = payload.artifacts.find(
    (artifact) => artifact.path === "evidence/validation.json",
  );
  expect(validation).toBeDefined();
  expect(JSON.parse(validation!.content).independentValidation).toMatchObject({
    independentlyParsed: true,
    errors: 0,
  });

  const qualification = payload.artifacts.find(
    (artifact) => artifact.path === "evidence/qualification.json",
  );
  expect(qualification).toBeDefined();
  expect(JSON.parse(qualification!.content).qualified).toBe(true);

  const traceability = payload.artifacts.find(
    (artifact) => artifact.path === "reports/traceability.json",
  );
  expect(traceability).toBeDefined();
  const rows = JSON.parse(traceability!.content) as Array<{ status: string }>;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.status === "traced")).toBe(true);
});

test("empty or unapproved projects fail closed and cannot export a release", async ({ page }) => {
  await createProject(page, "Blocked Release");

  await page.goto("/synthesis");
  await expect(page.getByText(/Synthesis is blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve design" })).toBeDisabled();

  await page.goto("/release");
  await expect(page.getByText("Release blocked", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeDisabled();
  await expect(page.getByText("A reviewer approved this exact design")).toBeVisible();
});

test("approval is invalidated after replacing the approved workspace", async ({ page }) => {
  await createProject(page, "Approval Drift");

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  const loadExample = page.getByRole("button", { name: /Load Autonomous warehouse fleet/i });
  await expect(loadExample).toBeEnabled();
  await loadExample.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/synthesis");
  await expect(page.getByRole("button", { name: "Approve design" })).toBeEnabled();
  await page.getByRole("button", { name: "Approve design" }).click();

  await page.goto("/release");
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeEnabled();

  await page.goto("/models");
  await page.getByLabel("Reference example workspace").selectOption("precision-irrigation");
  await page.getByRole("button", { name: "Load selected" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Replace with example" }).click();
  await expect(page.getByText("Agri.dml")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/release");
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeDisabled();
  await expect(
    page.getByText("The models changed after approval, so the approval no longer applies."),
  ).toBeVisible();
});

test("core engineering journey remains usable on a compact viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProject(page, "Compact CX");

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  const loadExample = page.getByRole("button", { name: /Load Autonomous warehouse fleet/i });
  await expect(loadExample).toBeEnabled();
  await loadExample.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  for (const route of ["/models", "/synthesis", "/trust", "/release"]) {
    await page.goto(route);
    await expect(page).toHaveURL(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.goto("/synthesis");
  await expect(page.getByRole("button", { name: "Approve design" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Generated control model", exact: true }),
  ).toBeVisible();

  await page.goto("/trust");
  await expect(page.getByRole("link", { name: "Release centre" })).toBeVisible();

  await page.goto("/release");
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeVisible();
});
