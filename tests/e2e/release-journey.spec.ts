import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 90_000 });

async function createProject(page: Page, prefix: string) {
  const emailPrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const email = `${emailPrefix}-${Date.now()}@example.com`;

  await page.goto("/auth");
  await signUpThroughUi(page, email, "Pr57-Release-Journey-Password!");
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
  const downloadCode = page.getByRole("button", { name: "Download code" });
  await expect(exportBundle).toBeEnabled();
  await expect(downloadCode).toBeEnabled();
  await expect(page.getByLabel("Deployment target")).toHaveValue("ros2-python");
  await expect(page.getByText("Generated deployment code")).toBeVisible();
  await expect(page.getByText("validated", { exact: true })).toBeVisible();
  await expect(page.getByText("A reviewer approved this exact design")).toBeVisible();

  // Invalid user-entered versions must never create a releasable manifest or
  // a download filename, even though all engineering approval gates passed.
  const releaseVersion = page.getByRole("textbox", { name: "Version" });
  for (const value of ["../1.0.0", "1.2.3-rc.01", ""]) {
    await releaseVersion.fill(value);
    await expect(releaseVersion).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Enter a valid semantic version/)).toBeVisible();
    await expect(exportBundle).toBeDisabled();
    await expect(downloadCode).toBeDisabled();
  }
  await releaseVersion.fill("1.2.3-rc.1");
  await expect(releaseVersion).toHaveAttribute("aria-invalid", "false");
  await expect(exportBundle).toBeEnabled();
  const previewWait = page.waitForEvent("download");
  await exportBundle.click();
  const preview = await previewWait;
  expect(preview.suggestedFilename()).toBe("kide-release-1.2.3-rc.1.json");
  const previewContents = JSON.parse(await readFile((await preview.path())!, "utf8")) as {
    manifest: { version: string; releasable: boolean };
  };
  expect(previewContents.manifest.version).toBe("1.2.3-rc.1");
  expect(previewContents.manifest.releasable).toBe(true);

  await releaseVersion.fill("1.0.0");
  await expect(exportBundle).toBeEnabled();
  await expect(downloadCode).toBeEnabled();

  const codeDownloadPromise = page.waitForEvent("download");
  await downloadCode.click();
  const codeDownload = await codeDownloadPromise;
  expect(codeDownload.suggestedFilename()).toBe("kide-code-ros2-python-1.0.0.json");
  const codePath = await codeDownload.path();
  expect(codePath).not.toBeNull();
  const codePayload = JSON.parse(await readFile(codePath!, "utf8")) as {
    target: string;
    modelFingerprint: string;
    bundleFingerprint: string;
    artifacts: Array<{ path: string; sha256: string; bytes: number; content: string }>;
  };
  expect(codePayload.target).toBe("ros2-python");
  expect(codePayload.modelFingerprint).toHaveLength(64);
  expect(codePayload.bundleFingerprint).toHaveLength(64);
  expect(codePayload.artifacts.some((entry) => entry.path.endsWith("/controller.py"))).toBe(true);
  for (const artifact of codePayload.artifacts) {
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }

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
      codegen: Array<{
        target: string;
        bundleFingerprint: string;
        modelFingerprint: string;
        ready: boolean;
      }>;
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
  expect(payload.manifest.codegen).toEqual([
    expect.objectContaining({
      target: "ros2-python",
      bundleFingerprint: codePayload.bundleFingerprint,
      modelFingerprint: codePayload.modelFingerprint,
      ready: true,
    }),
  ]);
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

  const generatedCode = payload.artifacts.find(
    (artifact) => artifact.kind === "code" && artifact.path.endsWith("/controller.py"),
  );
  expect(generatedCode).toBeDefined();
  expect(generatedCode!.content).toContain("class ");
  expect(generatedCode!.content).toContain("create_publisher");

  const codegenEvidence = payload.artifacts.find(
    (artifact) => artifact.path === "evidence/codegen-ros2-python.json",
  );
  expect(codegenEvidence).toBeDefined();
  expect(JSON.parse(codegenEvidence!.content)).toMatchObject({
    target: "ros2-python",
    bundleFingerprint: codePayload.bundleFingerprint,
    validation: { ready: true, errors: [] },
  });

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
  await expect(page.getByRole("button", { name: "Download code" })).toBeDisabled();
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
    expect(overflow, `${route} should not overflow a 390px viewport`).toBeLessThanOrEqual(1);
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

test("approval remains scoped to the project that created it", async ({ page }) => {
  await createProject(page, "Project A Approval");

  await page.goto("/models");
  const loadExample = page.getByRole("button", { name: /Load Autonomous warehouse fleet/i });
  await expect(loadExample).toBeEnabled();
  await loadExample.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/synthesis");
  const approve = page.getByRole("button", { name: "Approve design" });
  await expect(approve).toBeEnabled();
  await approve.click();

  await page.goto("/release");
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeEnabled();

  await page.goto("/projects");
  await page.getByPlaceholder("New project name").fill("Project B Controller");
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText("Project B Controller")).toBeVisible();

  const projectB = page.getByRole("listitem").filter({ hasText: "Project B Controller" });
  await projectB.getByRole("link", { name: "Open models" }).click();
  await expect(page).toHaveURL("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();

  await page.goto("/release");
  await expect(page.getByRole("button", { name: "Export bundle" })).toBeDisabled();
  await expect(
    page.getByText("Approve a design in the synthesis review before releasing."),
  ).toBeVisible();
});
