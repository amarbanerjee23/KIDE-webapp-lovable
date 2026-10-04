import { describe, expect, it } from "vitest";
import { EXAMPLE_WORKSPACES, linkWorkspace } from "@/lib/dsl";
import { sha256 } from "./sha256";
import { synthesize } from "./synthesis";
import {
  buildSemanticCodegenModel,
  CODEGEN_TARGETS,
  generateCode,
  type CodegenTarget,
} from "./codegen";

describe("semantic multi-target code generation", () => {
  for (const example of EXAMPLE_WORKSPACES) {
    it.each(CODEGEN_TARGETS)(
      `generates deterministic %s artifacts for ${example.domain}: ${example.title}`,
      (target: CodegenTarget) => {
        const workspace = linkWorkspace(example.files.map((file) => ({ ...file })));
        const report = synthesize(workspace);
        expect(report.ready).toBe(true);
        const candidate = report.candidates[0]!;

        const first = generateCode(workspace, candidate, target);
        const second = generateCode(
          linkWorkspace(example.files.map((file) => ({ ...file }))),
          {
            ...candidate,
            bindings: [...candidate.bindings].reverse(),
            controlNodes: [...candidate.controlNodes].reverse(),
          },
          target,
        );

        expect(first.validation.errors).toEqual([]);
        expect(first.validation.ready).toBe(true);
        expect(first.artifacts.length).toBeGreaterThan(0);
        expect(first.bundleFingerprint).toHaveLength(64);
        expect(first.modelFingerprint).toHaveLength(64);
        expect(second.bundleFingerprint).toBe(first.bundleFingerprint);
        expect(second.artifacts).toEqual(first.artifacts);

        for (const artifact of first.artifacts) {
          expect(artifact.sha256).toBe(sha256(artifact.content));
          expect(artifact.bytes).toBe(new TextEncoder().encode(artifact.content).length);
          expect(artifact.path.length).toBeGreaterThan(0);
        }
      },
    );
  }

  it("builds a typed semantic IR from source interface parameters", () => {
    const example = EXAMPLE_WORKSPACES[0]!;
    const workspace = linkWorkspace(example.files.map((file) => ({ ...file })));
    const candidate = synthesize(workspace).candidates[0]!;

    const { model, validation } = buildSemanticCodegenModel(workspace, candidate);

    expect(validation.ready).toBe(true);
    expect(model).not.toBeNull();
    expect(model!.nodes.length).toBeGreaterThan(0);
    expect(model!.nodes.some((node) => node.commands.length > 0)).toBe(true);
    expect(
      model!.nodes
        .flatMap((node) => node.commands)
        .every((command) =>
          command.parameters.every(
            (parameter) => parameter.name.length > 0 && parameter.type.length > 0,
          ),
        ),
    ).toBe(true);
  });

  it("fails closed when the candidate is not independently valid", () => {
    const example = EXAMPLE_WORKSPACES[0]!;
    const workspace = linkWorkspace(example.files.map((file) => ({ ...file })));
    const candidate = synthesize(workspace).candidates[0]!;
    const invalid = {
      ...candidate,
      validation: {
        ...candidate.validation,
        errors: 1,
        messages: ["synthetic validation failure"],
      },
    };

    for (const target of CODEGEN_TARGETS) {
      const bundle = generateCode(workspace, invalid, target);
      expect(bundle.validation.ready).toBe(false);
      expect(bundle.artifacts).toEqual([]);
      expect(bundle.validation.errors).toContain(
        "The selected synthesis candidate has validation errors.",
      );
    }
  });

  it("does not invent undeclared commands", () => {
    const example = EXAMPLE_WORKSPACES[0]!;
    const workspace = linkWorkspace(example.files.map((file) => ({ ...file })));
    const candidate = synthesize(workspace).candidates[0]!;
    const commandNames = new Set(
      workspace.files.flatMap((file) =>
        file.result.ast?.node === "Model"
          ? file.result.ast.interfaces.flatMap((iface) => iface.commands.map((command) => command.name))
          : [],
      ),
    );

    const { model } = buildSemanticCodegenModel(workspace, candidate);
    expect(model).not.toBeNull();
    for (const command of model!.nodes.flatMap((node) => node.commands)) {
      expect(commandNames.has(command.name)).toBe(true);
    }
  });
});
