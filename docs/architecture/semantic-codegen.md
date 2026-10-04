# Semantic multi-target code generation

KIDE code generation remains browser-side TypeScript domain computation. The backend is not used to
interpret KIDE models or generate target code.

## Pipeline

1. A project workspace is parsed and linked.
2. Deterministic synthesis produces a candidate MNC control design.
3. The candidate is independently re-parsed and must contain zero validation errors.
4. KIDE builds a canonical semantic code-generation IR from:
   - the approved candidate;
   - its control nodes and activity bindings;
   - the original interface definitions;
   - typed command, event, response and alarm parameters.
5. A target renderer produces deterministic source artifacts.
6. Every artifact receives SHA-256 and byte-count provenance.
7. The selected target bundle is embedded in the normal release manifest and is therefore covered by
   the release manifest checksum.

Code generation fails closed if the synthesized candidate is invalid, an interface cannot be
resolved, or the generated target bundle fails validation.

## Targets

### ROS 2 Python

KIDE generates an `ament_python`-style package containing:

- `package.xml`;
- `setup.py`;
- Python package initialization;
- a generated `rclpy` controller node.

Because the KIDE interface DSL does not declare ROS custom message types, the generated ROS adapter
uses `std_msgs/String` with deterministic JSON payloads. Commands are publishers; events, responses
and alarms are subscriptions. The semantic names and typed payload contracts remain traceable to the
KIDE interface model.

This is an explicit transport boundary. A deployment that requires custom ROS messages or
device-specific topics must bind those details in the device adapter rather than inventing them in
the generator.

### IEC 61131-3 Structured Text

KIDE generates one Structured Text source with a `FUNCTION_BLOCK` for each synthesized control
node. Commands become input triggers and typed input values. Events, responses and alarms become
output signals. Command bodies expose deterministic device-adapter dispatch hooks.

### Zetta Node.js

KIDE generates a `zetta-device` package with deterministic command handlers and semantic
event/response/alarm hooks. KIDE primitive types are translated to target-native input types.

## Release governance

Generated target code is not a side download outside release governance. The selected code bundle
is added under `deploy/` in the KIDE release and a corresponding
`evidence/codegen-<target>.json` artifact records:

- target;
- code generator version;
- semantic model fingerprint;
- target bundle fingerprint;
- validation result;
- generated file paths, byte counts and SHA-256 hashes.

An invalid target bundle adds `Generated deployment code` to the release blockers.

## CI verification

The dedicated semantic-codegen CI gate:

- generates all three targets from a real reference workspace;
- executes the cross-domain codegen conformance matrix over all shipped examples;
- compiles generated Python with `python3 -m py_compile`;
- checks generated JavaScript with `node --check`;
- parses the generated package JSON;
- checks Structured Text `FUNCTION_BLOCK` balance and generated command inputs.

Production-container browser E2E depends on this gate and verifies code-package download from the
Release Centre.
