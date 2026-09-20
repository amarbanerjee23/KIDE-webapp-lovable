import type {
  ActivityCheckConditionNode,
  ActivityDiagramNode,
  ActivityFileNode,
  ActivityNode,
  ConditionalActivityNode,
  OutcomeNode,
} from "./ast";

/**
 * Deterministic printer for the activity language. The same tree always
 * prints byte-identical source, so canvas edits produce diff-friendly files.
 */
export function printActivityFile(file: ActivityFileNode): string {
  return file.diagrams.map(printActivityDiagram).join("\n");
}

export function printActivityDiagram(diagram: ActivityDiagramNode): string {
  const lines: string[] = [`ActivityDiagram ${diagram.name}`];
  if (diagram.dataObjects.length > 0) {
    lines.push(`uses Objects [ ${diagram.dataObjects.join(", ")} ]`);
  }
  if (diagram.contextDataModel.length > 0) {
    lines.push(`on context ${diagram.contextDataModel.join(", ")}`);
  }
  if (diagram.physicalContext.length > 0) {
    lines.push(`physical contexts ${diagram.physicalContext.map((item) => `"${item}"`).join(", ")}`);
  }
  if (diagram.results.length > 0) {
    lines.push(
      `produces results ( ${diagram.results.map(printParameter).join(", ")} )`,
    );
  }
  lines.push("has activities {");
  lines.push(diagram.activities.map((activity) => printActivity(activity)).join(",\n"));
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function printActivity(activity: ActivityNode): string {
  const body: string[] = [];
  if (activity.description) body.push(`    description : "${activity.description}"`);
  if (activity.inputParameters.length > 0) {
    body.push(`    inputData { ${activity.inputParameters.join(", ")} }`);
  }

  if (activity.requiredCapability) {
    body.push(`    requireCapability : "${activity.requiredCapability}"`);
  } else if (activity.bindCapability) {
    const controls = activity.useControlCapabilities.length > 0
      ? ` { ${activity.useControlCapabilities.join(", ")} }`
      : "";
    body.push(`    requireCapability : ${activity.bindCapability}${controls}`);
  } else if (activity.requiresOperation.length > 0) {
    body.push(`    requireOperation ( ${activity.requiresOperation.join(", ")} )`);
  } else if (activity.childActivityDiagram) {
    body.push(`    childActivityDiagram : ${activity.childActivityDiagram}`);
  }

  if (activity.conditionalActivity.length > 0) {
    body.push("    conditions {");
    body.push(
      activity.conditionalActivity
        .map((condition) => `      ${printCondition(condition)}`)
        .join(",\n"),
    );
    body.push("    }");
  } else if (activity.nextActivity) {
    body.push(`    nextActivity : ${activity.nextActivity}`);
  } else if (activity.nextActivityDiagram) {
    body.push(`    nextActivityDiagram : ${activity.nextActivityDiagram}`);
  }

  if (activity.time !== undefined && activity.unit) {
    body.push(`    time : ${activity.time.toFixed(1)} ${activity.unit}`);
  }
  if (activity.interruptedBy.length > 0) {
    body.push(`    interruptedBy ( ${activity.interruptedBy.join(", ")} )`);
  }
  if (activity.interrupts.length > 0) {
    body.push(`    interrupts ( ${activity.interrupts.join(", ")} )`);
  }

  return `  Activity ${activity.name} {\n${body.join("\n")}\n  }`;
}

function printCondition(condition: ConditionalActivityNode): string {
  const parts: string[] = [printOutcome(condition.outcomes[0]!)];
  condition.operators.forEach((operator, index) => {
    const outcome = condition.outcomes[index + 1];
    if (outcome) parts.push(`${operator} ${printOutcome(outcome)}`);
  });
  const head = parts.join(" ");
  if (condition.onTrueNextActivity) return `${head} => nextActivity : ${condition.onTrueNextActivity}`;
  return `${head} final result : ${condition.onTrueFinalResult}`;
}

function printOutcome(outcome: OutcomeNode): string {
  const parts: string[] = [];
  if (outcome.capabilityOutcome) parts.push(`from ${outcome.capabilityOutcome}`);
  for (const validation of outcome.validations) parts.push(printCheck(validation));
  return parts.join(" ");
}

function printCheck(check: ActivityCheckConditionNode): string {
  const conditions: string[] = [];
  if (check.checkMaxValue !== undefined) conditions.push(`> ${format(check.checkMaxValue)}`);
  if (check.checkMinValue !== undefined) conditions.push(`< ${format(check.checkMinValue)}`);
  if (check.checkValues.length > 0) {
    conditions.push(`= ( ${check.checkValues.map(format).join(", ")} )`);
  }
  return `if outcome ${check.parameter} is ( ${conditions.join(" ")} )`;
}

function format(value: import("./ast").PrimitiveValue): string {
  switch (value.kind) {
    case "int":
    case "float":
      return String(value.value);
    case "string":
      return `"${value.value}"`;
    case "bool":
      return value.value ? "true" : "false";
    case "date":
      return `${value.day}/${value.month}/${value.year}`;
    case "array":
      return `[ ${value.values.map(format).join(", ")} ]`;
    case "object":
      return value.value;
  }
}

function printParameter(parameter: import("./ast").ParameterNode): string {
  if (parameter.node === "SimpleType") return `${parameter.type} ${parameter.name}`;
  if (parameter.node === "AbstractType") return `${parameter.typeRef} ${parameter.name}`;
  const base = parameter.primitiveType ?? parameter.dataModelType ?? "object";
  return `${base} [] ${parameter.name}`;
}
