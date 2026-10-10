import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 180_000 });

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return inner;
  });
}

test("production customer can qualify and export real generated code, then sign out", async ({
  page,
}) => {
  const suffix = randomBytes(12).toString("hex");
  const email = `kide-qualification-${suffix}@example.com`;
  const password = `Kide-Q-${randomBytes(24).toString("hex")}!Aa1`;
  const orgName = `Release Qualification ${suffix}`;
  const projectName = `Qualification Project ${suffix}`;

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/auth");
  await signUpThroughUi(page, email, password);
  await expect(page).toHaveURL("/projects");

  await page.getByPlaceholder("Acme Robotics").fill(orgName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();

  await page.getByPlaceholder("New project name").fill(projectName);
  await page.getByRole("button", { name: /project/i }).click();
  await expect(page.getByText(projectName)).toBeVisible();

  await page.goto("/models");
  await expect(page.getByText("This project has no model files yet")).toBeVisible();
  await page.getByRole("button", { name: /Load Autonomous warehouse fleet/i }).click();
  await expect(page.getByText("Ecre.dml")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/synthesis");
  await expect(page.getByText("Independently re-checked, no errors").first()).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve design" });
  await expect(approve).toBeEnabled();
  await approve.click();

  await page.goto("/trust");
  await expect(page.getByText("Ready for release", { exact: true })).toBeVisible();

  await page.goto("/release");
  const downloadCode = page.getByRole("button", { name: "Download code" });
  const exportBundle = page.getByRole("button", { name: "Export bundle" });
  await expect(downloadCode).toBeEnabled();
  await expect(exportBundle).toBeEnabled();

  const codeWait = page.waitForEvent("download");
  await downloadCode.click();
  const codeDownload = await codeWait;
  expect(codeDownload.suggestedFilename()).toBe("kide-code-ros2-python-1.0.0.json");
  const codePath = await codeDownload.path();
  expect(codePath).not.toBeNull();
  const code = JSON.parse(await readFile(codePath!, "utf8")) as {
    target: string;
    modelFingerprint: string;
    bundleFingerprint: string;
    artifacts: Array<{ path: string; sha256: string; bytes: number; content: string }>;
  };
  expect(code.target).toBe("ros2-python");
  expect(code.modelFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(code.bundleFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(code.artifacts.length).toBeGreaterThan(0);
  for (const artifact of code.artifacts) {
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }
  expect(
    code.artifacts.some(
      (artifact) => artifact.path.endsWith("/controller.py") && artifact.content.includes("class "),
    ),
  ).toBe(true);

  const bundleWait = page.waitForEvent("download");
  await exportBundle.click();
  const bundleDownload = await bundleWait;
  expect(bundleDownload.suggestedFilename()).toBe("kide-release-1.0.0.json");
  const bundlePath = await bundleDownload.path();
  expect(bundlePath).not.toBeNull();
  const bundle = JSON.parse(await readFile(bundlePath!, "utf8")) as {
    manifest: {
      releasable: boolean;
      blockedBy: string[];
      codegen: Array<{ target: string; bundleFingerprint: string; ready: boolean }>;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
    };
    manifestSha256: string;
    artifacts: Array<{ path: string; sha256: string; bytes: number; content: string }>;
  };
  expect(bundle.manifest.releasable).toBe(true);
  expect(bundle.manifest.blockedBy).toEqual([]);
  expect(bundle.manifestSha256).toBe(sha256(canonical(bundle.manifest)));
  expect(bundle.manifest.codegen).toContainEqual(
    expect.objectContaining({
      target: "ros2-python",
      bundleFingerprint: code.bundleFingerprint,
      ready: true,
    }),
  );
  expect(bundle.artifacts.length).toBe(bundle.manifest.artifacts.length);
  for (const artifact of bundle.artifacts) {
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }
  expect(
    bundle.artifacts.some(
      (artifact) => artifact.path.endsWith("/controller.py") && artifact.content.includes("class "),
    ),
  ).toBe(true);

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/projects");
  await expect(page).toHaveURL("/");
  expect(errors).toEqual([]);
});
