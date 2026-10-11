import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { signUpThroughUi } from "./auth-helpers";

test.describe.configure({ timeout: 600_000 });

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

const targets = ["ros2-python", "iec61131-st", "zetta-node"] as const;

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

// This is exercised by the protected production qualification as well as local CI.
// It verifies real generated downloads, not only a banner claiming readiness.
async function qualifyExampleGeneration(
  page: Page,
  template: (typeof examples)[number],
  savedSources: ExportedFile[],
  target: (typeof targets)[number],
) {
  await page.goto("/synthesis");
  await expect(page.getByText("Independently re-checked, no errors").first()).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve design" });
  await expect(approve).toBeEnabled();
  await approve.click();

  await page.goto("/trust");
  await expect(page.getByText("Ready for release", { exact: true })).toBeVisible();
  await page.goto("/release");
  await page.getByLabel("Deployment target").selectOption(target);
  const downloadCode = page.getByRole("button", { name: "Download code" });
  const exportBundle = page.getByRole("button", { name: "Export bundle" });
  await expect(downloadCode).toBeEnabled();
  await expect(exportBundle).toBeEnabled();

  const codeWait = page.waitForEvent("download");
  await downloadCode.click();
  const codeDownload = await codeWait;
  expect(codeDownload.suggestedFilename()).toBe(`kide-code-${target}-1.0.0.json`);
  const codePath = await codeDownload.path();
  expect(codePath).not.toBeNull();
  const code = JSON.parse(await readFile(codePath!, "utf8")) as {
    target: string;
    modelFingerprint: string;
    bundleFingerprint: string;
    artifacts: Array<{ path: string; sha256: string; bytes: number; content: string }>;
  };
  expect(code.target).toBe(target);
  expect(code.modelFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(code.bundleFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(code.artifacts.length).toBeGreaterThan(0);

  // ROS 2 requires two zero-byte packaging markers: the resource-index entry
  // and Python's __init__.py. They are intentional, not missing source code.
  // Require their *exact* paths and still verify the SHA-256 of the empty bytes.
  const emptyPaths = code.artifacts
    .filter((artifact) => artifact.content.length === 0)
    .map((artifact) => artifact.path)
    .sort();
  if (target === "ros2-python") {
    const controller = code.artifacts.find((artifact) => artifact.path.endsWith("/controller.py"));
    const packageName = controller?.path.split("/")[1] ?? "";
    expect(packageName).not.toBe("");
    expect(controller?.path).toBe(`ros2/${packageName}/${packageName}/controller.py`);
    expect(controller?.content).toContain("class ");
    expect(controller?.content).toContain("create_publisher");
    expect(emptyPaths).toEqual(
      [
        `ros2/${packageName}/resource/${packageName}`,
        `ros2/${packageName}/${packageName}/__init__.py`,
      ].sort(),
    );
  } else {
    expect(emptyPaths).toEqual([]);
    expect(
      code.artifacts.some((artifact) =>
        target === "iec61131-st"
          ? artifact.path.endsWith(".st") && artifact.content.includes("FUNCTION_BLOCK")
          : artifact.path.endsWith("index.js") && artifact.content.includes("module.exports"),
      ),
    ).toBe(true);
  }

  for (const artifact of code.artifacts) {
    if (!emptyPaths.includes(artifact.path)) {
      expect(artifact.content.length).toBeGreaterThan(0);
    }
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }

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
      codegen: Array<{ target: string; ready: boolean; bundleFingerprint: string }>;
      artifacts: Array<{ path: string; kind: string; bytes: number; sha256: string }>;
    };
    manifestSha256: string;
    artifacts: Array<{
      path: string;
      kind: string;
      bytes: number;
      sha256: string;
      content: string;
    }>;
  };
  expect(bundle.manifest.releasable).toBe(true);
  expect(bundle.manifest.blockedBy).toEqual([]);
  expect(bundle.manifestSha256).toBe(sha256(canonical(bundle.manifest)));
  expect(bundle.manifest.codegen).toContainEqual(
    expect.objectContaining({
      target,
      ready: true,
      bundleFingerprint: code.bundleFingerprint,
    }),
  );
  expect(bundle.manifest.artifacts).toEqual(
    bundle.artifacts.map(({ path, kind, bytes, sha256: hash }) => ({
      path,
      kind,
      bytes,
      sha256: hash,
    })),
  );
  expect(new Set(bundle.artifacts.map((entry) => entry.path)).size).toBe(bundle.artifacts.length);
  for (const artifact of bundle.artifacts) {
    expect(artifact.sha256).toBe(sha256(artifact.content));
    expect(artifact.bytes).toBe(Buffer.byteLength(artifact.content, "utf8"));
  }
  const releasedModels = bundle.artifacts
    .filter((artifact) => artifact.kind === "model")
    .map(({ path, content, sha256: hash }) => ({
      path: path.replace(/^models\//, ""),
      source: content,
      sha256: hash,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  expect(releasedModels).toHaveLength(5);
  expect(releasedModels).toEqual(
    savedSources
      .map(({ path, source, sha256: hash }) => ({ path, source, sha256: hash }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
  expect(releasedModels.some((file) => file.path === template.file)).toBe(true);
  expect(
    bundle.artifacts.some(
      (artifact) => artifact.kind === "generated" && artifact.path.endsWith(".mncspec"),
    ),
  ).toBe(true);
  for (const codeArtifact of code.artifacts) {
    expect(bundle.artifacts).toContainEqual(
      expect.objectContaining({
        kind: "code",
        path: `deploy/${codeArtifact.path}`,
        content: codeArtifact.content,
        sha256: codeArtifact.sha256,
        bytes: codeArtifact.bytes,
      }),
    );
  }
}

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

test("all five persisted examples synthesize, approve and export verified code and releases", async ({
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

  for (const [index, template] of examples.entries()) {
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
    await qualifyExampleGeneration(page, template, afterReload, targets[index % targets.length]!);
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
