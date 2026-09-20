import { BaseParser, ParseError } from "./parser-base";
import type {
  ActionNode,
  ActionRefNode,
  CapabilitiesOutcomeNode,
  CapabilityFileNode,
  CapabilityNode,
  ControlCapabilitiesNode,
  ParseResult,
} from "./ast";

/**
 * Parser for `com.capability.Capability` (`.cap`).
 *
 * A capability binds an abstract device ability to concrete MNC interface
 * items: the commands it can fire, the events/alarms/data points it observes,
 * and the outcomes it reports back.
 */
class CapabilityParser extends BaseParser {
  parse(): CapabilityFileNode {
    const file: CapabilityFileNode = { node: "CapabilityFile", capabilities: [] };
    const seen = new Set<string>();

    while (!this.atEnd) {
      if (!this.isKw("Capability")) {
        this.report(
          this.cur,
          `Expected 'Capability' but found '${this.cur.value}'.`,
          "cap.unexpected-top-level",
        );
        this.recoverTo(["Capability"]);
        continue;
      }
      try {
        const capability = this.capability();
        if (seen.has(capability.name)) {
          this.diagnostics.push({
            severity: "error",
            message: `Capability '${capability.name}' is declared more than once.`,
            code: "cap.duplicate-capability",
            line: capability.line,
            column: capability.column,
            offset: capability.offset,
            length: capability.length,
          });
        }
        seen.add(capability.name);
        file.capabilities.push(capability);
      } catch (error) {
        if (error instanceof ParseError) {
          this.report(error.token, error.message, error.code);
          this.recoverTo(["Capability"]);
        } else {
          throw error;
        }
      }
    }

    return file;
  }

  private capability(): CapabilityNode {
    this.expectKw("Capability");
    const nameToken = this.eString("capability name");
    this.expectKw("compatible");
    this.expectKw("component");
    this.expectKw("interface");
    const componentInterface = this.qualifiedRefList("interface");
    this.expectPunct("{");

    const node: CapabilityNode = {
      node: "Capability",
      componentInterface,
      ...this.range(nameToken),
    };

    if (this.isKw("Init")) node.requiredInitProcess = this.initAction();
    if (this.acceptKw("providesControlCapabilities")) {
      node.providesControlCapabilities = this.controlCapabilities();
    }
    if (this.acceptKw("providesOutcomes")) {
      node.providesOutcomes = this.capabilitiesOutcome();
    }

    if (!this.isPunct("}")) {
      throw new ParseError(
        this.cur,
        `Unexpected '${this.cur.value}' in capability '${nameToken.value}'. Expected Init, providesControlCapabilities, providesOutcomes or '}'.`,
      );
    }
    this.expectPunct("}");

    if (!node.providesControlCapabilities && !node.providesOutcomes) {
      this.diagnostics.push({
        severity: "warning",
        message: `Capability '${nameToken.value}' provides neither control capabilities nor outcomes, so no activity can use it.`,
        code: "cap.empty-capability",
        line: node.line,
        column: node.column,
        offset: node.offset,
        length: node.length,
      });
    }

    return node;
  }

  /**
   * Action returns mncModel::Action: 'Init' '{' (unordered sections)? '}'
   */
  private initAction(): ActionNode {
    this.expectKw("Init");
    this.expectPunct("{");
    const action: ActionNode = {
      node: "Action",
      raiseAlarm: [],
      fireCommand: [],
      publishEvent: [],
      triggerDataPoint: [],
      executeOperation: [],
      transitionStates: [],
    };

    while (!this.isPunct("}") && !this.atEnd) {
      if (this.isKw("subscribe")) {
        this.next();
        if (this.acceptKw("alarms")) {
          action.raiseAlarm.push(...this.actionRefList("alarm"));
        } else if (this.acceptKw("events")) {
          action.publishEvent.push(...this.actionRefList("event"));
        } else if (this.acceptKw("data")) {
          action.triggerDataPoint.push(...this.actionRefList("dataPoint"));
        } else {
          throw new ParseError(
            this.cur,
            `Expected 'alarms', 'events' or 'data' after 'subscribe' but found '${this.cur.value}'.`,
          );
        }
      } else if (this.acceptKw("fire")) {
        this.expectKw("Commands");
        action.fireCommand.push(...this.actionRefList("command", true));
      } else if (this.acceptKw("execute")) {
        this.expectKw("Operations");
        action.executeOperation.push(...this.actionRefList("operation"));
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in the Init process. Expected 'subscribe', 'fire' or 'execute'.`,
        );
      }
    }
    this.expectPunct("}");
    return action;
  }

  private actionRefList(
    kind: "alarm" | "command" | "event" | "dataPoint" | "operation",
    allowResponses = false,
  ): ActionRefNode[] {
    this.expectPunct("[");
    const out: ActionRefNode[] = [];
    while (!this.isPunct("]") && !this.atEnd) {
      const ref = this.qualifiedRef(kind);
      this.expectPunct("(");
      const item: ActionRefNode = { ref, parameterValues: [], parameterMappings: [] };
      if (!this.isPunct(")")) {
        item.parameterValues.push(this.primitiveValue());
        while (this.acceptPunct(",")) item.parameterValues.push(this.primitiveValue());
      }
      this.expectPunct(")");

      // 'responses=>' '{' ResponseBlock (',' ResponseBlock)* '}'
      if (allowResponses && this.isKw("responses") && this.isPunct("=>", 1)) {
        this.next();
        this.next();
        this.expectPunct("{");
        const handling: ActionRefNode["responseHandling"] = [];
        while (!this.isPunct("}") && !this.atEnd) {
          const response = this.qualifiedRef("response");
          handling.push({
            node: "ResponseBlock",
            response,
            validationRules: [],
            responseAggregationRules: [],
          });
          this.acceptPunct(",");
        }
        this.expectPunct("}");
        item.responseHandling = handling;
      }

      out.push(item);
      this.acceptPunct(",");
    }
    this.expectPunct("]");
    return out;
  }

  private controlCapabilities(): ControlCapabilitiesNode {
    this.expectPunct("{");
    const node: ControlCapabilitiesNode = {
      node: "ControlCapabilities",
      commands: [],
      events: [],
      alarms: [],
      dataPoints: [],
    };
    const seen = new Set<string>();

    while (!this.isPunct("}") && !this.atEnd) {
      if (this.acceptKw("fireable")) {
        this.expectKw("commands");
        this.expectPunct(":");
        if (seen.has("commands")) this.duplicate(this.cur, "fireable commands");
        seen.add("commands");
        node.commands.push(...this.qualifiedRefList("command"));
      } else if (this.acceptKw("receivable")) {
        this.expectKw("events");
        this.expectPunct(":");
        if (seen.has("events")) this.duplicate(this.cur, "receivable events");
        seen.add("events");
        node.events.push(...this.qualifiedRefList("event"));
      } else if (this.acceptKw("raised")) {
        this.expectKw("alarms");
        this.expectPunct(":");
        if (seen.has("alarms")) this.duplicate(this.cur, "raised alarms");
        seen.add("alarms");
        node.alarms.push(...this.qualifiedRefList("alarm"));
      } else if (this.acceptKw("subscribable")) {
        this.expectKw("DataPoints");
        this.expectPunct(":");
        if (seen.has("dataPoints")) this.duplicate(this.cur, "subscribable DataPoints");
        seen.add("dataPoints");
        node.dataPoints.push(...this.qualifiedRefList("dataPoint"));
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}'. Expected 'fireable commands', 'receivable events', 'raised alarms' or 'subscribable DataPoints'.`,
        );
      }
    }
    this.expectPunct("}");
    return node;
  }

  private capabilitiesOutcome(): CapabilitiesOutcomeNode {
    this.expectPunct("{");
    const node: CapabilitiesOutcomeNode = {
      node: "CapabilitiesOutcome",
      responses: [],
      events: [],
      alarms: [],
      dataPoints: [],
    };
    const seen = new Set<string>();

    while (!this.isPunct("}") && !this.atEnd) {
      this.expectKw("receivable");
      if (this.acceptKw("responses")) {
        if (seen.has("responses")) this.duplicate(this.cur, "receivable responses");
        seen.add("responses");
        node.responses.push(...this.qualifiedRefList("response"));
      } else if (this.acceptKw("events")) {
        if (seen.has("events")) this.duplicate(this.cur, "receivable events");
        seen.add("events");
        node.events.push(...this.qualifiedRefList("event"));
      } else if (this.acceptKw("alarms")) {
        if (seen.has("alarms")) this.duplicate(this.cur, "receivable alarms");
        seen.add("alarms");
        node.alarms.push(...this.qualifiedRefList("alarm"));
      } else if (this.acceptKw("dataPoints")) {
        if (seen.has("dataPoints")) this.duplicate(this.cur, "receivable dataPoints");
        seen.add("dataPoints");
        node.dataPoints.push(...this.qualifiedRefList("dataPoint"));
      } else {
        throw new ParseError(
          this.cur,
          `Expected 'responses', 'events', 'alarms' or 'dataPoints' after 'receivable' but found '${this.cur.value}'.`,
        );
      }
    }
    this.expectPunct("}");
    return node;
  }
}

export function parseCapability(source: string): ParseResult<CapabilityFileNode> {
  const parser = new CapabilityParser(source);
  let ast: CapabilityFileNode | null = null;
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
    kind: "cap",
    ast,
    diagnostics: parser.diagnostics,
    references: parser.references,
  };
}
