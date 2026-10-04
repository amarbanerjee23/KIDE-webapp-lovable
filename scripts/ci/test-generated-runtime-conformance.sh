#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "Generated runtime conformance failure: $*" >&2
  exit 1
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

bun scripts/ci/emit-codegen-fixture.ts "$tmp/generated" >/dev/null

# --- ROS 2 Python runtime contract -----------------------------------------
controller_file="$(find "$tmp/generated/ros2" -type f -name controller.py | head -n 1)"
[[ -n "$controller_file" ]] || fail "ROS 2 fixture is missing controller.py"
package_root="$(dirname "$(dirname "$controller_file")")"
module_name="$(basename "$(dirname "$controller_file")").controller"

mkdir -p "$tmp/python-stubs/rclpy" "$tmp/python-stubs/std_msgs/msg"
cat >"$tmp/python-stubs/rclpy/__init__.py" <<'PY'
def init(args=None):
    return None

def spin(node):
    return None

def shutdown():
    return None
PY

cat >"$tmp/python-stubs/rclpy/node.py" <<'PY'
class _Publisher:
    def __init__(self, topic):
        self.topic = topic
        self.messages = []

    def publish(self, message):
        self.messages.append(message)

class _Logger:
    def __init__(self):
        self.entries = []

    def info(self, message):
        self.entries.append(message)

class Node:
    def __init__(self, name):
        self.node_name = name
        self._created_publishers = []
        self._created_subscriptions = []
        self._logger = _Logger()

    def create_publisher(self, message_type, topic, qos):
        publisher = _Publisher(topic)
        self._created_publishers.append(publisher)
        return publisher

    def create_subscription(self, message_type, topic, callback, qos):
        subscription = {
            "message_type": message_type,
            "topic": topic,
            "callback": callback,
            "qos": qos,
        }
        self._created_subscriptions.append(subscription)
        return subscription

    def get_logger(self):
        return self._logger

    def destroy_node(self):
        return None
PY

cat >"$tmp/python-stubs/std_msgs/__init__.py" <<'PY'
PY

cat >"$tmp/python-stubs/std_msgs/msg/__init__.py" <<'PY'
class String:
    def __init__(self):
        self.data = ""
PY

cat >"$tmp/ros_runtime_runner.py" <<'PY'
import importlib
import inspect
import json
import os

from rclpy.node import Node
from std_msgs.msg import String

module = importlib.import_module(os.environ["KIDE_ROS_MODULE"])
controller_types = [
    value
    for value in module.__dict__.values()
    if inspect.isclass(value) and issubclass(value, Node) and value is not Node
]
assert len(controller_types) == 1, f"expected one generated controller class, got {controller_types}"
controller = controller_types[0]()
assert controller.node_name
assert controller._created_publishers, "generated ROS controller created no command publishers"

send_methods = [
    getattr(controller, name)
    for name in dir(controller)
    if name.startswith("send_") and callable(getattr(controller, name))
]
assert send_methods, "generated ROS controller exposes no send_* command methods"

def sample(annotation):
    name = str(annotation)
    if "bool" in name:
        return True
    if "int" in name:
        return 7
    if "float" in name:
        return 1.5
    if "list" in name:
        return [{"sample": True}]
    if "object" in name:
        return {"sample": True}
    return "sample"

before = sum(len(p.messages) for p in controller._created_publishers)
for method in send_methods:
    values = [sample(parameter.annotation) for parameter in inspect.signature(method).parameters.values()]
    method(*values)

after = sum(len(p.messages) for p in controller._created_publishers)
assert after - before == len(send_methods), "each generated command must publish exactly one message"

for publisher in controller._created_publishers:
    assert publisher.topic.startswith("/"), publisher.topic
    for message in publisher.messages:
        assert isinstance(message, String)
        payload = json.loads(message.data)
        assert isinstance(payload, dict)

event_methods = [
    getattr(controller, name)
    for name in dir(controller)
    if name.startswith("on_") and callable(getattr(controller, name))
]
if controller._created_subscriptions:
    assert event_methods, "subscriptions exist but generated event handlers are missing"
    probe = String()
    probe.data = '{"sample": true}'
    for method in event_methods:
        method(probe)
    assert len(controller._logger.entries) == len(event_methods)

print(
    json.dumps(
        {
            "commandsExecuted": len(send_methods),
            "publishers": len(controller._created_publishers),
            "subscriptions": len(controller._created_subscriptions),
            "eventHandlersExecuted": len(event_methods),
        },
        sort_keys=True,
    )
)
PY

PYTHONPATH="$tmp/python-stubs:$package_root" \
  KIDE_ROS_MODULE="$module_name" \
  python3 "$tmp/ros_runtime_runner.py" >"$tmp/ros-runtime.json"

node -e '
const result = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (result.commandsExecuted < 1 || result.publishers < 1) {
  throw new Error("ROS runtime contract did not execute generated commands.");
}
' "$tmp/ros-runtime.json"

# --- Zetta Node.js runtime contract ----------------------------------------
mkdir -p "$tmp/generated/zetta/node_modules/zetta-device"
cat >"$tmp/generated/zetta/node_modules/zetta-device/index.js" <<'JS'
"use strict";
const util = require("util");
const EventEmitter = require("events");

function Device() {
  EventEmitter.call(this);
}

util.inherits(Device, EventEmitter);
module.exports = Device;
JS

node - "$tmp/generated/zetta/index.js" <<'JS'
"use strict";
const path = require("path");

const driverPath = path.resolve(process.argv[2]);
const Driver = require(driverPath);
const device = new Driver();

const mapped = [];
const config = {
  typeValue: null,
  nameValue: null,
  stateValue: null,
  allowed: [],
  type(value) { this.typeValue = value; return this; },
  name(value) { this.nameValue = value; return this; },
  state(value) { this.stateValue = value; return this; },
  when(state, contract) {
    if (state !== "ready") throw new Error(`unexpected state mapping: ${state}`);
    this.allowed = contract.allow || [];
    return this;
  },
  map(name, handler, fields = []) {
    mapped.push({ name, handler, fields });
    return this;
  },
};

device.init(config);
if (!config.typeValue || !config.nameValue || config.stateValue !== "ready") {
  throw new Error("generated Zetta driver did not configure type/name/ready state");
}
if (mapped.length === 0) {
  throw new Error("generated Zetta driver exposes no mapped commands");
}
if (config.allowed.length !== mapped.length) {
  throw new Error("allowed command set does not match mapped commands");
}

for (const entry of mapped) {
  if (!config.allowed.includes(entry.name)) {
    throw new Error(`mapped command ${entry.name} is not allowed in ready state`);
  }
  const args = entry.fields.map((field) => {
    if (!["number", "boolean", "string"].includes(field.type)) {
      throw new Error(`unsupported generated Zetta field type: ${field.type}`);
    }
    return field.type === "number" ? 7 : field.type === "boolean" ? true : "sample";
  });
  let called = false;
  entry.handler.call(device, ...args, () => {
    called = true;
  });
  if (!called) throw new Error(`generated command ${entry.name} did not invoke callback`);
}

const emitted = [];
device.emit = (name, payload) => {
  emitted.push({ name, payload });
  return true;
};

const eventMethods = Object.getOwnPropertyNames(Driver.prototype).filter(
  (name) => name.startsWith("on_") && typeof device[name] === "function",
);
for (const name of eventMethods) {
  device[name]({ sample: true });
}
for (const item of emitted) {
  if (!/^(event|response|alarm):/.test(item.name)) {
    throw new Error(`unexpected generated event name: ${item.name}`);
  }
}

console.log(
  JSON.stringify({
    mappedCommands: mapped.length,
    eventHooksExecuted: eventMethods.length,
    emittedSignals: emitted.length,
  }),
);
JS

# --- IEC 61131-3 Structured Text semantic contract -------------------------
st_file="$(find "$tmp/generated/plc" -type f -name '*.st' | head -n 1)"
[[ -n "$st_file" ]] || fail "Structured Text fixture is missing"

node - "$st_file" <<'JS'
"use strict";
const fs = require("fs");

const source = fs.readFileSync(process.argv[2], "utf8");
const blocks = [...source.matchAll(/FUNCTION_BLOCK\s+([A-Z0-9_]+)([\s\S]*?)END_FUNCTION_BLOCK/g)];
if (blocks.length === 0) throw new Error("no Structured Text function blocks found");

const seen = new Set();
let commands = 0;
for (const [, name, body] of blocks) {
  if (seen.has(name)) throw new Error(`duplicate function block: ${name}`);
  seen.add(name);

  const inputMatch = body.match(/VAR_INPUT([\s\S]*?)END_VAR/);
  const outputMatch = body.match(/VAR_OUTPUT([\s\S]*?)END_VAR/);
  if (!inputMatch || !outputMatch) {
    throw new Error(`${name} must contain VAR_INPUT and VAR_OUTPUT sections`);
  }

  const triggers = new Set(
    [...inputMatch[1].matchAll(/CMD_([A-Z0-9_]+)\s*:\s*BOOL\s*;/g)].map((match) => match[1]),
  );
  const dispatches = [...body.matchAll(/IF\s+CMD_([A-Z0-9_]+)\s+THEN/g)].map(
    (match) => match[1],
  );

  if (triggers.size !== dispatches.length) {
    throw new Error(`${name} command trigger/dispatch count mismatch`);
  }
  for (const command of dispatches) {
    if (!triggers.has(command)) {
      throw new Error(`${name} dispatches undeclared command ${command}`);
    }
  }

  const typedInputs = [...inputMatch[1].matchAll(
    /^\s+[A-Z0-9_]+\s*:\s*(BOOL|DINT|LREAL|STRING)\s*;/gm,
  )];
  if (typedInputs.length < triggers.size) {
    throw new Error(`${name} has malformed command parameter declarations`);
  }
  commands += dispatches.length;
}

if (commands < 1) throw new Error("Structured Text runtime contract found no command dispatches");
console.log(JSON.stringify({ functionBlocks: blocks.length, commands }));
JS

echo "Generated ROS 2, Zetta and Structured Text runtime contracts executed successfully."
