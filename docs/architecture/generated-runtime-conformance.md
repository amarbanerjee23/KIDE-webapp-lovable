# Generated Deployment Runtime Conformance

PR59 extends KIDE's governed semantic code generation with execution-level CI contracts.

PR58 established deterministic, checksummed multi-target generation for ROS 2 Python, IEC 61131-3
Structured Text and Zetta Node.js. Its dedicated toolchain gate proves generated source syntax,
package structure and cross-domain determinism.

PR59 adds the next assurance layer: generated adapters are executed against deterministic target
runtime contracts before production browser E2E is allowed to run.

## ROS 2 Python

CI materializes the generated ROS 2 package and provides minimal contract-faithful stubs for
`rclpy.node.Node` and `std_msgs.msg.String`.

The harness imports the generated controller and requires:

- exactly one generated controller class;
- at least one generated command publisher;
- every generated `send_*` command method to execute;
- each command invocation to publish exactly one `String` message;
- published payloads to contain valid JSON objects;
- generated topics to be absolute ROS-style topics;
- subscriptions to have corresponding generated event/response/alarm handlers;
- generated observation handlers to execute without error.

This proves the generated Python adapter is executable and its command/event surface is internally
coherent. It does not replace testing against a specific ROS 2 distribution, DDS implementation or
physical device adapter.

## Zetta Node.js

CI loads the generated driver against a minimal `zetta-device` contract and requires:

- driver construction;
- type, name and `ready` state configuration;
- every allowed command to have a mapped handler;
- mapped parameter types to be valid Zetta input types;
- every generated command handler to invoke its callback;
- generated event/response/alarm hooks to emit the correct semantic event category.

This moves validation beyond `node --check`: generated driver behavior is actually executed.

## IEC 61131-3 Structured Text

CI parses the generated Structured Text at the semantic-contract level and requires:

- unique `FUNCTION_BLOCK` names;
- balanced function blocks;
- `VAR_INPUT` and `VAR_OUTPUT` sections per block;
- every generated `CMD_*` dispatch to have a declared BOOL trigger;
- trigger and dispatch counts to match;
- generated command parameters to use supported IEC primitive types;
- at least one executable command dispatch in the reference fixture.

This is deliberately stricter than marker counting, while remaining vendor-neutral. Final deployment
to a PLC still requires compilation with the selected vendor/OpenPLC toolchain and target hardware
acceptance testing.

## CI ordering

The release pipeline now layers code-generation assurance as:

1. semantic multi-target generation and syntax/toolchain checks;
2. generated deployment runtime conformance;
3. production container + Better Auth + browser E2E.

A failure in generated deployment behavior blocks the production browser gate and therefore blocks
release publication.
