import { BaseParser, ParseError } from "./parser-base";
import type {
  ActivityCheckConditionNode,
  ActivityDiagramNode,
  ActivityFileNode,
  ActivityNode,
  ConditionalActivityNode,
  OutcomeNode,
  ParameterNode,
  ParseResult,
  UnitTime,
} from "./ast";

const UNITS: UnitTime[] = ["secs", "mins", "hrs", "days"];

/**
 * Parser for `com.smr.activity.dsl.ActivityDiagram` (`.activity`) — the
 * workflow language that sequences capability-backed activities.
 */
class ActivityParser extends BaseParser {
  parse(): ActivityFileNode {
    const file: ActivityFileNode = { node: "ActivityFile", diagrams: [] };
    const seen = new Set<string>();

    while (!this.atEnd) {
      if (!this.isKw("ActivityDiagram")) {
        this.report(
          this.cur,
          `Expected 'ActivityDiagram' but found '${this.cur.value}'.`,
          "activity.unexpected-top-level",
        );
        this.recoverTo(["ActivityDiagram"]);
        continue;
      }
      try {
        const diagram = this.activityDiagram();
        if (seen.has(diagram.name)) {
          this.diagnostics.push({
            severity: "error",
            message: `Activity diagram '${diagram.name}' is declared more than once.`,
            code: "activity.duplicate-diagram",
            line: diagram.line,
            column: diagram.column,
            offset: diagram.offset,
            length: diagram.length,
          });
        }
        seen.add(diagram.name);
        file.diagrams.push(diagram);
      } catch (error) {
        if (error instanceof ParseError) {
          this.report(error.token, error.message, error.code);
          this.recoverTo(["ActivityDiagram"]);
        } else {
          throw error;
        }
      }
    }

    return file;
  }

  private activityDiagram(): ActivityDiagramNode {
    this.expectKw("ActivityDiagram");
    const nameToken = this.eString("activity diagram name");

    const dataObjects: string[] = [];
    const contextDataModel: string[] = [];
    const physicalContext: string[] = [];
    const results: ParameterNode[] = [];
    const activities: ActivityNode[] = [];

    if (this.isKw("uses") && this.isKw("Objects", 1)) {
      this.next();
      this.next();
      this.expectPunct("[");
      if (!this.isPunct("]")) dataObjects.push(...this.qualifiedRefList("parameter"));
      this.expectPunct("]");
    }

    if (this.isKw("on") && this.isKw("context", 1)) {
      this.next();
      this.next();
      contextDataModel.push(...this.qualifiedRefList("dataModel"));
    }

    if (this.isKw("physical") && this.isKw("contexts", 1)) {
      this.next();
      this.next();
      do {
        if (this.cur.type !== "string") {
          throw new ParseError(
            this.cur,
            "A physical context must be written as a quoted string.",
          );
        }
        physicalContext.push(this.next().value);
      } while (this.acceptPunct(","));
    }

    if (this.isKw("produces") && this.isKw("results", 1)) {
      this.next();
      this.next();
      this.expectPunct("(");
      results.push(this.parameter());
      while (this.acceptPunct(",")) results.push(this.parameter());
      this.expectPunct(")");
    }

    if (this.isKw("has") && this.isKw("activities", 1)) {
      this.next();
      this.next();
      this.expectPunct("{");
      if (!this.isPunct("}")) {
        activities.push(this.activity());
        while (this.acceptPunct(",") || this.isKw("Activity")) {
          if (this.isPunct("}")) break;
          activities.push(this.activity());
        }
      }
      this.expectPunct("}");
    }

    const diagram: ActivityDiagramNode = {
      node: "ActivityDiagram",
      dataObjects,
      contextDataModel,
      physicalContext,
      results,
      activities,
      ...this.range(nameToken),
    };

    this.checkWorkflow(diagram);
    return diagram;
  }

  private activity(): ActivityNode {
    this.expectKw("Activity");
    const nameToken = this.eString("activity name");
    this.expectPunct("{");

    const node: ActivityNode = {
      node: "Activity",
      inputParameters: [],
      useControlCapabilities: [],
      requiresOperation: [],
      conditionalActivity: [],
      interruptedBy: [],
      interrupts: [],
      ...this.range(nameToken),
    };

    if (this.isKw("description")) {
      this.next();
      this.expectPunct(":");
      node.description = this.eString("description").value;
    }

    if (this.isKw("inputData")) {
      this.next();
      this.expectPunct("{");
      if (!this.isPunct("}")) {
        node.inputParameters.push(...this.qualifiedRefList("parameter"));
      }
      this.expectPunct("}");
    }

    // Exactly one of requireCapability | requireOperation | childActivityDiagram
    if (this.acceptKw("requireCapability")) {
      this.expectPunct(":");
      if (this.cur.type === "string") {
        node.requiredCapability = this.next().value;
      } else {
        node.bindCapability = this.qualifiedRef("capability");
      }
      if (this.acceptPunct("{")) {
        node.useControlCapabilities.push(...this.qualifiedRefList("interfaceItem"));
        this.expectPunct("}");
      }
    } else if (this.acceptKw("requireOperation")) {
      this.expectPunct("(");
      node.requiresOperation.push(...this.qualifiedRefList("operation"));
      this.expectPunct(")");
    } else if (this.acceptKw("childActivityDiagram")) {
      this.expectPunct(":");
      node.childActivityDiagram = this.qualifiedRef("activityDiagram");
    } else {
      throw new ParseError(
        this.cur,
        `Activity '${nameToken.value}' must state what performs it: 'requireCapability', 'requireOperation' or 'childActivityDiagram'.`,
        "activity.missing-performer",
      );
    }

    // Exactly one continuation
    if (this.acceptKw("conditions")) {
      this.expectPunct("{");
      node.conditionalActivity.push(this.conditionalActivity());
      while (this.acceptPunct(",")) {
        node.conditionalActivity.push(this.conditionalActivity());
      }
      this.expectPunct("}");
    } else if (this.acceptKw("nextActivity")) {
      this.expectPunct(":");
      node.nextActivity = this.qualifiedRef("activity");
    } else if (this.acceptKw("nextActivityDiagram")) {
      this.expectPunct(":");
      node.nextActivityDiagram = this.qualifiedRef("activityDiagram");
    }

    if (this.acceptKw("time")) {
      this.expectPunct(":");
      const time = this.eFloat();
      node.time = time;
      if (this.cur.type === "id" && UNITS.includes(this.cur.value as UnitTime)) {
        node.unit = this.next().value as UnitTime;
      } else {
        throw new ParseError(
          this.cur,
          "Expected a time unit: secs, mins, hrs or days.",
          "activity.missing-time-unit",
        );
      }
      if (time < 0) {
        this.report(
          this.peek(-1),
          `Activity '${nameToken.value}' declares a negative duration.`,
          "activity.negative-duration",
        );
      }
    }

    if (this.acceptKw("interruptedBy")) {
      this.expectPunct("(");
      node.interruptedBy.push(...this.qualifiedRefList("activity"));
      this.expectPunct(")");
    }
    if (this.acceptKw("interrupts")) {
      this.expectPunct("(");
      node.interrupts.push(...this.qualifiedRefList("activity"));
      this.expectPunct(")");
    }

    if (!this.isPunct("}")) {
      throw new ParseError(
        this.cur,
        `Unexpected '${this.cur.value}' in activity '${nameToken.value}'.`,
      );
    }
    this.expectPunct("}");
    return node;
  }

  private conditionalActivity(): ConditionalActivityNode {
    const node: ConditionalActivityNode = {
      node: "ConditionalActivity",
      outcomes: [],
      operators: [],
    };

    node.outcomes.push(this.outcome());
    while (this.isKw("and") || this.isKw("or")) {
      node.operators.push(this.next().value);
      node.outcomes.push(this.outcome());
    }

    if (this.acceptPunct("=>")) {
      this.expectKw("nextActivity");
      this.expectPunct(":");
      node.onTrueNextActivity = this.qualifiedRef("activity");
    } else if (this.acceptKw("final")) {
      this.expectKw("result");
      this.expectPunct(":");
      node.onTrueFinalResult = this.qualifiedRef("parameter");
    } else {
      throw new ParseError(
        this.cur,
        "A condition must end with '=> nextActivity : <activity>' or 'final result : <parameter>'.",
        "activity.condition-without-outcome",
      );
    }

    return node;
  }

  private outcome(): OutcomeNode {
    const node: OutcomeNode = { node: "Outcome", validations: [] };
    if (this.acceptKw("from")) {
      node.capabilityOutcome = this.qualifiedRef("outcomeItem");
    }
    while (this.isKw("if")) {
      node.validations.push(this.checkParameterCondition());
    }
    if (!node.capabilityOutcome && node.validations.length === 0) {
      throw new ParseError(
        this.cur,
        "An outcome must reference a capability outcome with 'from' or state at least one 'if outcome ...' check.",
        "activity.empty-outcome",
      );
    }
    return node;
  }

  /**
   * CheckParameterCondition: 'if' 'outcome' parameter 'is'
   *   '(' ('>' max)? & ('<' min)? & ('=' '(' values ')')? ')'
   */
  private checkParameterCondition(): ActivityCheckConditionNode {
    this.expectKw("if");
    this.expectKw("outcome");
    const parameter = this.qualifiedRef("parameter");
    this.expectKw("is");
    this.expectPunct("(");

    const node: ActivityCheckConditionNode = {
      node: "ActivityCheckParameterCondition",
      parameter,
      checkValues: [],
    };

    while (!this.isPunct(")") && !this.atEnd) {
      if (this.acceptPunct(">")) {
        node.checkMaxValue = this.primitiveValue();
      } else if (this.acceptPunct("<")) {
        node.checkMinValue = this.primitiveValue();
      } else if (this.acceptPunct("=")) {
        this.expectPunct("(");
        node.checkValues.push(this.primitiveValue());
        while (this.acceptPunct(",")) node.checkValues.push(this.primitiveValue());
        this.expectPunct(")");
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in an outcome check. Expected '>', '<' or '='.`,
        );
      }
    }
    this.expectPunct(")");

    if (
      node.checkMaxValue === undefined &&
      node.checkMinValue === undefined &&
      node.checkValues.length === 0
    ) {
      this.report(
        this.peek(-1),
        "This outcome check states no condition, so it always passes.",
        "activity.empty-outcome-check",
        "warning",
      );
    }

    return node;
  }

  /** Workflow-level checks that the grammar alone cannot express. */
  private checkWorkflow(diagram: ActivityDiagramNode): void {
    const byName = new Map(diagram.activities.map((activity) => [activity.name, activity]));

    for (const activity of diagram.activities) {
      const targets = [
        activity.nextActivity,
        ...activity.conditionalActivity.map((c) => c.onTrueNextActivity),
      ].filter((value): value is string => Boolean(value));

      for (const target of targets) {
        if (!byName.has(target) && !target.includes(".")) {
          this.diagnostics.push({
            severity: "error",
            message: `Activity '${activity.name}' continues to '${target}', which is not declared in diagram '${diagram.name}'.`,
            code: "activity.unknown-next-activity",
            line: activity.line,
            column: activity.column,
            offset: activity.offset,
            length: activity.length,
          });
        }
      }

      const terminates =
        !activity.nextActivity &&
        !activity.nextActivityDiagram &&
        (activity.conditionalActivity.length === 0 ||
          activity.conditionalActivity.some((c) => c.onTrueFinalResult));

      if (
        activity.conditionalActivity.length > 0 &&
        !terminates &&
        !activity.conditionalActivity.some((c) => c.onTrueNextActivity || c.onTrueFinalResult)
      ) {
        this.diagnostics.push({
          severity: "error",
          message: `Activity '${activity.name}' has conditions but no reachable outcome.`,
          code: "activity.unreachable-outcome",
          line: activity.line,
          column: activity.column,
          offset: activity.offset,
          length: activity.length,
        });
      }
    }

    // Reachability from the first declared activity.
    const first = diagram.activities[0];
    if (first) {
      const reachable = new Set<string>();
      const queue: string[] = [first.name];
      while (queue.length > 0) {
        const name = queue.pop();
        if (!name || reachable.has(name)) continue;
        reachable.add(name);
        const activity = byName.get(name);
        if (!activity) continue;
        const next = [
          activity.nextActivity,
          ...activity.conditionalActivity.map((c) => c.onTrueNextActivity),
          ...activity.interruptedBy,
        ].filter((value): value is string => Boolean(value));
        queue.push(...next);
      }
      for (const activity of diagram.activities) {
        if (!reachable.has(activity.name)) {
          this.diagnostics.push({
            severity: "warning",
            message: `Activity '${activity.name}' cannot be reached from '${first.name}', so it will never run.`,
            code: "activity.unreachable-activity",
            line: activity.line,
            column: activity.column,
            offset: activity.offset,
            length: activity.length,
          });
        }
      }
    }
  }
}

export function parseActivity(source: string): ParseResult<ActivityFileNode> {
  const parser = new ActivityParser(source);
  let ast: ActivityFileNode | null = null;
  try {
    ast = parser.parse();
  } catch (error) {
    if (error instanceof ParseError) {
      parser.diagnostics.push({
        severity: "error",
        message: error.message,
        code: error.code,
        line: error.token.line,
        column: error.token.column,
        offset: error.token.offset,
        length: Math.max(error.token.length, 1),
      });
    } else {
      throw error;
    }
  }
  return {
    kind: "activity",
    ast,
    diagnostics: parser.diagnostics,
    references: parser.references,
  };
}
