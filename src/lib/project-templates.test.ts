import { describe, expect, it } from "vitest";
import {
  PROJECT_TEMPLATE_CATALOG,
  projectTemplateById,
  projectTemplateSources,
} from "./project-templates";
import { validateWorkingCopySources, WORKING_COPY_LABEL } from "./project-working-copy";
import { linkSources } from "./kide/workspace-sources";

describe("progressive real-world starter projects", () => {
  it("provides exactly five explicitly ordered cross-domain examples", () => {
    expect(PROJECT_TEMPLATE_CATALOG).toHaveLength(5);
    expect(PROJECT_TEMPLATE_CATALOG.map((example) => example.level)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(PROJECT_TEMPLATE_CATALOG.map((example) => example.domain)).size).toBe(5);
    expect(new Set(PROJECT_TEMPLATE_CATALOG.map((example) => example.id)).size).toBe(5);
  });

  it.each(PROJECT_TEMPLATE_CATALOG)(
    "creates a complete valid independent five-language source map for $id",
    (example) => {
      const sources = validateWorkingCopySources(projectTemplateSources(example.id));
      expect(Object.keys(sources)).toHaveLength(5);
      for (const extension of [".dml", ".op", ".mncspec", ".cap", ".activity"]) {
        expect(Object.keys(sources).some((path) => path.endsWith(extension))).toBe(true);
      }
      expect(Object.keys(sources)).not.toContain(WORKING_COPY_LABEL);
      const workspace = linkSources(sources);
      expect(workspace.files).toHaveLength(5);
      expect(
        workspace.files.flatMap((file) =>
          file.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
        ),
      ).toHaveLength(0);

      const next = projectTemplateSources(example.id);
      expect(next).not.toBe(sources);
      expect(next).toEqual(sources);
    },
  );

  it("rejects unknown templates before any database insert can occur", () => {
    expect(() => projectTemplateById("not-in-the-gallery")).toThrow("valid starter example");
    expect(() => projectTemplateSources("wrong")).toThrow("valid starter example");
  });
});
