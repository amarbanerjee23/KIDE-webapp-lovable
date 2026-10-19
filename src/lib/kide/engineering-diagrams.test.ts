/* eslint-disable prettier/prettier -- The ZIP-byte assertions and multi-domain matrices use deliberately explicit test formatting. */
import { describe, expect, it } from "vitest";
import { EXAMPLE_WORKSPACES } from "@/lib/dsl";
import { buildEngineeringDiagramBundle, renderEngineeringSvg } from "./engineering-diagrams";
import { exampleWorkspaceSources, linkSources } from "./workspace-sources";

const context = {
  projectId: "project-123",
  organizationId: "org-456",
  saveStatus: "saved",
  exportedAt: "2026-10-19T00:00:00.000Z",
};

/** Read stored ZIP local records; verifies that every exported item is a real file. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let cursor = 0;
  while (cursor + 4 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    expect(view.getUint16(cursor + 6, true)).toBe(0x0800);
    expect(view.getUint16(cursor + 8, true)).toBe(0);
    const length = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const start = cursor + 30;
    const filename = decoder.decode(bytes.subarray(start, start + nameLength));
    const body = start + nameLength + extraLength;
    expect(body + length).toBeLessThanOrEqual(bytes.length);
    files.set(filename, decoder.decode(bytes.subarray(body, body + length)));
    cursor = body + length;
  }
  expect(view.getUint32(cursor, true)).toBe(0x02014b50);
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return files;
}

describe("engineering diagram ZIP export", () => {
  it.each(EXAMPLE_WORKSPACES.map((example) => [example.id, example] as const))(
    "exports all five language models from real %s engineering ASTs",
    (_id, example) => {
      const workspace = linkSources(exampleWorkspaceSources(example.id));
      expect(workspace.errorCount).toBe(0);
      const bundle = buildEngineeringDiagramBundle(workspace, context);
      const zip = readZip(bundle.bytes);
      expect(bundle.filename).toBe("kide-engineering-diagrams-project-123.zip");
      expect(bundle.manifest.diagrams).toHaveLength(workspace.files.length + 1);
      expect(zip.size).toBe(workspace.files.length + 3);
      expect(zip.has("diagrams/00-system-architecture.svg")).toBe(true);
      expect(zip.has("modelset.json")).toBe(true);
      expect(zip.has("manifest.json")).toBe(true);
      const exportedKinds = bundle.manifest.sources.map((source) => source.kind).sort();
      expect(exportedKinds).toEqual(["activity", "cap", "dml", "mncspec", "op"]);
      const manifest = JSON.parse(zip.get("manifest.json")!);
      expect(manifest.projectId).toBe(context.projectId);
      expect(manifest.organizationId).toBe(context.organizationId);
      expect(manifest.status).toBe("snapshot-not-release-approved");
      expect(
        manifest.diagrams.every((diagram: { nodeCount: number }) => diagram.nodeCount > 0),
      ).toBe(true);
      for (const diagram of bundle.manifest.diagrams) {
        const svg = zip.get(diagram.file)!;
        expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain("Source-derived architecture");
        expect(svg).not.toContain("<script");
      }
      const modelset = JSON.parse(zip.get("modelset.json")!);
      expect(modelset.format).toBe("kide.modelset/1");
      expect(modelset.files).toHaveLength(5);
      expect(modelset.files.map((file: { path: string }) => file.path).sort()).toEqual(
        workspace.files.map((file) => file.path).sort(),
      );
      const activity = bundle.manifest.diagrams.find((diagram) =>
        diagram.sourceModel?.endsWith(".activity"),
      )!;
      expect(zip.get(activity.file)).toContain("Activity:");
      expect(zip.get(activity.file)).toContain("Capability:");
      const control = bundle.manifest.diagrams.find((diagram) =>
        diagram.sourceModel?.endsWith(".mncspec"),
      )!;
      expect(zip.get(control.file)).toContain("Control node:");
      expect(zip.get(control.file)).toContain("Interface:");
    },
  );

  it("does not export incomplete, invalid or inaccessible project state", () => {
    const empty = linkSources({});
    expect(() => buildEngineeringDiagramBundle(empty, context)).toThrow(
      "Select a loaded project",
    );
    const populated = linkSources(exampleWorkspaceSources("precision-irrigation"));
    expect(() => buildEngineeringDiagramBundle(populated, { ...context, projectId: "" })).toThrow(
      "Select a loaded project",
    );
    const bad = linkSources({ "broken.dml": "DataModel Bad { invalid syntax" });
    expect(bad.errorCount).toBeGreaterThan(0);
    expect(() => buildEngineeringDiagramBundle(bad, context)).toThrow("Resolve model syntax");
  });

  it("escapes SVG markup and preserves labels in text, not executable markup", () => {
    const svg = renderEngineeringSvg({
      title: '<script>alert("bad")</script>',
      subtitle: "& unsafe <svg>",
      nodes: [
        {
          id: "n0",
          label: '<foreignObject onload="bad">',
          description: "& <tag>",
          kind: "signal",
          lane: 0,
        },
      ],
      edges: [],
    });
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;foreignObject");
    expect(svg).toContain("&amp; unsafe &lt;svg&gt;");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<foreignObject");
  });

  it("does not mistake browser draft exports for signed engineering approvals", () => {
    const workspace = linkSources(exampleWorkspaceSources("precision-irrigation"));
    const bundle = buildEngineeringDiagramBundle(workspace, {
      ...context,
      saveStatus: "offline",
    });
    expect(bundle.manifest.saveStatus).toBe("offline");
    expect(bundle.manifest.status).toBe("snapshot-not-release-approved");
    expect(bundle.manifest.note).toMatch(/unsaved edits/i);
  });
});
