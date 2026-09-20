import { BaseParser, ParseError } from "./parser-base";
import type {
  ActionNode,
  ActionRefNode,
  AlarmNode,
  CheckParameterConditionNode,
  CommandNode,
  CommandResponseBlockNode,
  ControlNodeNode,
  DataPointNode,
  EventNode,
  HandlerBlockNode,
  InterfaceDescriptionNode,
  MncModelNode,
  OperatingStateNode,
  OperatingStateUtilityNode,
  ParameterNode,
  ParameterTranslationNode,
  ParseResult,
  PortNode,
  PrimitiveValue,
  ResponseAggregationRuleNode,
  ResponseBlockNode,
  ResponseNode,
  SubscribableItemListNode,
  TransitionNode,
  ValidationNode,
} from "./ast";

/**
 * Parser for `com.mncml.dsl.Mnc` (`.mncspec`) — the Monitoring aNd Control
 * design language that describes device interfaces and control nodes.
 */
class MncParser extends BaseParser {
  parse(): MncModelNode {
    const imports: string[] = [];
    while (this.isKw("import")) {
      this.next();
      const { value } = this.qualifiedName();
      let name = value;
      if (this.isPunct(".*")) {
        this.next();
        name += ".*";
      }
      imports.push(name);
    }

    this.expectKw("Model");
    const nameToken = this.eString("model name");

    const interfaces: InterfaceDescriptionNode[] = [];
    const controlNodes: ControlNodeNode[] = [];

    while (!this.atEnd) {
      try {
        if (this.isKw("InterfaceDescription")) {
          interfaces.push(this.interfaceDescription());
          continue;
        }
        if (this.isKw("ControlNode")) {
          controlNodes.push(this.controlNode());
          continue;
        }
        this.report(
          this.cur,
          `Expected 'InterfaceDescription' or 'ControlNode' but found '${this.cur.value}'.`,
          "mnc.unexpected-top-level",
        );
        this.recoverTo(["InterfaceDescription", "ControlNode"]);
      } catch (error) {
        if (error instanceof ParseError) {
          this.report(error.token, error.message, error.code);
          this.recoverTo(["InterfaceDescription", "ControlNode"]);
        } else {
          throw error;
        }
      }
    }

    if (interfaces.length === 0 && imports.length === 0) {
      this.report(
        nameToken,
        `Model '${nameToken.value}' declares no InterfaceDescription and imports none. A control model must describe at least one component interface.`,
        "mnc.missing-interface",
      );
    }

    return {
      node: "Model",
      imports,
      name: nameToken.value,
      interfaces,
      controlNodes,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Interface description                                             */
  /* ---------------------------------------------------------------- */

  private interfaceDescription(): InterfaceDescriptionNode {
    this.expectKw("InterfaceDescription");
    const nameToken = this.eString("interface name");
    const uses: string[] = [];
    if (this.acceptKw("uses")) {
      uses.push(...this.qualifiedRefList("interface"));
    }
    this.expectPunct("{");

    const node: InterfaceDescriptionNode = {
      node: "InterfaceDescription",
      uses,
      dataPoints: [],
      alarms: [],
      commands: [],
      events: [],
      responses: [],
      ...this.range(nameToken),
    };

    const seen = new Set<string>();
    const once = (section: string) => {
      if (seen.has(section)) this.duplicate(this.cur, section);
      seen.add(section);
    };

    while (!this.isPunct("}") && !this.atEnd) {
      if (this.isKw("port")) {
        once("port");
        node.port = this.port();
      } else if (this.isKw("dataPoints")) {
        once("dataPoints");
        this.next();
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) node.dataPoints.push(this.dataPoint());
        this.expectPunct("}");
      } else if (this.isKw("alarms")) {
        once("alarms");
        this.next();
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) node.alarms.push(this.alarm());
        this.expectPunct("}");
      } else if (this.isKw("commands")) {
        once("commands");
        this.next();
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) node.commands.push(this.command());
        this.expectPunct("}");
      } else if (this.isKw("events")) {
        once("events");
        this.next();
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) node.events.push(this.event());
        this.expectPunct("}");
      } else if (this.isKw("responses")) {
        once("responses");
        this.next();
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) node.responses.push(this.response());
        this.expectPunct("}");
      } else if (this.isKw("operatingStates")) {
        once("operatingStates");
        this.next();
        this.expectPunct("{");
        node.operatingStates = this.operatingStateUtility();
        this.expectPunct("}");
      } else if (this.isKw("SubscribableItemList")) {
        once("SubscribableItemList");
        node.subscribedItems = this.subscribableItemList();
      } else if (this.isKw("IPaddress")) {
        once("IPaddress");
        this.next();
        this.expectPunct(":");
        node.ipaddress = this.addressFormat();
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in interface '${nameToken.value}'. Expected one of: port, dataPoints, alarms, commands, events, responses, operatingStates, SubscribableItemList, IPaddress.`,
        );
      }
    }

    this.expectPunct("}");
    this.checkUniqueNames(nameToken.value, [
      ...node.commands,
      ...node.events,
      ...node.alarms,
      ...node.responses,
      ...node.dataPoints,
    ]);
    return node;
  }

  private checkUniqueNames(scope: string, items: { name: string; line: number; column: number; offset: number; length: number }[]): void {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    for (const item of items) {
      if ((counts.get(item.name) ?? 0) > 1) {
        counts.set(item.name, 0);
        this.diagnostics.push({
          severity: "error",
          message: `'${item.name}' is declared more than once in interface '${scope}'. Interface item names must be unique so capabilities and control nodes can reference them unambiguously.`,
          code: "mnc.duplicate-interface-item",
          line: item.line,
          column: item.column,
          offset: item.offset,
          length: item.length,
        });
      }
    }
  }

  private port(): PortNode {
    this.expectKw("port");
    const nameToken = this.eString("port name");
    const node: PortNode = { node: "Port", ...this.range(nameToken) };
    if (this.acceptPunct("=")) node.value = this.eInt();
    return node;
  }

  private addressFormat(): string {
    const parts: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      if (index > 0) this.expectPunct(".");
      if (this.cur.type !== "int") {
        throw new ParseError(this.cur, "Expected an IPv4 address in the form a.b.c.d.");
      }
      parts.push(this.next().value);
    }
    const address = parts.join(".");
    if (parts.some((part) => Number.parseInt(part, 10) > 255)) {
      this.report(
        this.peek(-1),
        `'${address}' is not a valid IPv4 address; each octet must be 0-255.`,
        "mnc.invalid-ip-address",
      );
    }
    return address;
  }

  /** Space- or comma-separated parameter list terminated by `]`. */
  private bracketParameters(): ParameterNode[] {
    this.expectPunct("[");
    const params: ParameterNode[] = [];
    while (!this.isPunct("]") && !this.atEnd) {
      params.push(this.parameter());
      this.acceptPunct(",");
    }
    this.expectPunct("]");
    return params;
  }

  private command(): CommandNode {
    const asynch = this.acceptKw("async");
    const nameToken = this.eString("command name");
    return {
      node: "Command",
      asynch,
      parameters: this.bracketParameters(),
      ...this.range(nameToken),
    };
  }

  private event(): EventNode {
    const publish = this.acceptKw("Publish");
    const nameToken = this.eString("event name");
    return {
      node: "Event",
      publish,
      parameters: this.bracketParameters(),
      ...this.range(nameToken),
    };
  }

  private response(): ResponseNode {
    const nameToken = this.eString("response name");
    return {
      node: "Response",
      parameters: this.bracketParameters(),
      ...this.range(nameToken),
    };
  }

  private alarm(): AlarmNode {
    const publish = this.acceptKw("Publish");
    const nameToken = this.eString("alarm name");
    this.expectPunct("[");
    const parameters: ParameterNode[] = [];
    let level: number | undefined;
    while (!this.isPunct("]") && !this.atEnd) {
      if (this.isKw("level")) {
        this.next();
        this.expectPunct("=");
        level = this.eInt();
        continue;
      }
      parameters.push(this.parameter());
      this.acceptPunct(",");
    }
    this.expectPunct("]");
    const node: AlarmNode = {
      node: "Alarm",
      publish,
      parameters,
      ...this.range(nameToken),
    };
    if (level !== undefined) {
      node.level = level;
      if (level < 0) {
        this.report(
          this.peek(-1),
          `Alarm '${nameToken.value}' has a negative severity level; alarm levels must be zero or greater.`,
          "mnc.invalid-alarm-level",
        );
      }
    }
    return node;
  }

  private dataPoint(): DataPointNode {
    const publish = this.acceptKw("Publish");
    const node: DataPointNode = {
      node: "DataPoint",
      publish,
      parameters: [],
      name: "",
      line: this.cur.line,
      column: this.cur.column,
      offset: this.cur.offset,
      length: 1,
    };
    if (this.isPrimitiveValueType() && !this.isPunct("[", 1)) {
      node.type = this.primitiveValueType();
    }
    const nameToken = this.eString("data point name");
    Object.assign(node, this.range(nameToken));
    if (this.acceptPunct("=")) node.value = this.primitiveValue();
    node.parameters = this.bracketParameters();
    return node;
  }

  private operatingStateUtility(): OperatingStateUtilityNode {
    const operatingStates: OperatingStateNode[] = [];
    while (!this.isKw("startStates") && !this.isKw("endStates") && !this.isPunct("}") && !this.atEnd) {
      const nameToken = this.eString("operating state name");
      this.expectPunct("[");
      const parameters: ParameterNode[] = [];
      while (!this.isPunct("]") && !this.atEnd) {
        parameters.push(this.parameter());
        this.acceptPunct(",");
      }
      this.expectPunct("]");
      operatingStates.push({
        node: "OperatingState",
        parameters,
        ...this.range(nameToken),
      });
    }

    const startStates: string[] = [];
    const endStates: string[] = [];
    if (this.acceptKw("startStates")) {
      this.expectPunct(":");
      startStates.push(...this.qualifiedRefList("operatingState"));
    }
    if (this.acceptKw("endStates")) {
      this.expectPunct(":");
      endStates.push(...this.qualifiedRefList("operatingState"));
    }

    const declared = new Set(operatingStates.map((state) => state.name));
    for (const state of [...startStates, ...endStates]) {
      if (!declared.has(state)) {
        const ref = this.references.find((candidate) => candidate.name === state);
        this.diagnostics.push({
          severity: "error",
          message: `Operating state '${state}' is referenced but never declared in this interface.`,
          code: "mnc.unknown-operating-state",
          line: ref?.line ?? 1,
          column: ref?.column ?? 1,
          offset: ref?.offset ?? 0,
          length: ref?.length ?? state.length,
        });
      }
    }

    return { node: "OperatingStateUtility", operatingStates, startStates, endStates };
  }

  private subscribableItemList(): SubscribableItemListNode {
    this.expectKw("SubscribableItemList");
    this.expectPunct("{");
    const node: SubscribableItemListNode = {
      node: "SubscribableItemList",
      subscribedEvents: [],
      subscribedAlarms: [],
      subscribedDataPoints: [],
    };
    while (!this.isPunct("}") && !this.atEnd) {
      if (this.acceptKw("subscribedEvents")) {
        this.expectPunct(":");
        node.subscribedEvents.push(...this.qualifiedRefList("event"));
      } else if (this.acceptKw("subscribedAlarms")) {
        this.expectPunct(":");
        node.subscribedAlarms.push(...this.qualifiedRefList("alarm"));
      } else if (this.acceptKw("subscribedDataPoints")) {
        this.expectPunct(":");
        node.subscribedDataPoints.push(...this.qualifiedRefList("dataPoint"));
      } else {
        throw new ParseError(
          this.cur,
          `Expected 'subscribedEvents', 'subscribedAlarms' or 'subscribedDataPoints' but found '${this.cur.value}'.`,
        );
      }
    }
    this.expectPunct("}");
    return node;
  }

  /* ---------------------------------------------------------------- */
  /* Control node                                                      */
  /* ---------------------------------------------------------------- */

  private controlNode(): ControlNodeNode {
    this.expectKw("ControlNode");
    const nameToken = this.eString("control node name");
    this.expectKw("implements");
    this.expectKw("interface");
    const interfaceDescription = this.qualifiedRef("interface");
    this.expectPunct("{");

    const node: ControlNodeNode = {
      node: "ControlNode",
      interfaceDescription,
      childNodes: [],
      commandResponseBlocks: [],
      eventBlocks: [],
      alarmBlocks: [],
      dataPointBlocks: [],
      ...this.range(nameToken),
    };

    while (!this.isPunct("}") && !this.atEnd) {
      if (this.acceptKw("childNodes")) {
        this.expectPunct("(");
        node.childNodes.push(...this.qualifiedRefList("controlNode"));
        this.expectPunct(")");
      } else if (this.acceptKw("CommandResponseBlock")) {
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) {
          node.commandResponseBlocks.push(this.commandResponseBlock());
        }
        this.expectPunct("}");
      } else if (this.acceptKw("EventBlock")) {
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) {
          node.eventBlocks.push(this.handlerBlock("EventBlock", "Event", "event"));
        }
        this.expectPunct("}");
      } else if (this.acceptKw("AlarmBlock")) {
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) {
          node.alarmBlocks.push(this.handlerBlock("AlarmBlock", "Alarm", "alarm"));
        }
        this.expectPunct("}");
      } else if (this.acceptKw("DataPointBlock")) {
        this.expectPunct("{");
        while (!this.isPunct("}") && !this.atEnd) {
          node.dataPointBlocks.push(
            this.handlerBlock("DataPointBlock", "DataPoint", "dataPoint"),
          );
        }
        this.expectPunct("}");
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in control node '${nameToken.value}'. Expected childNodes, CommandResponseBlock, EventBlock, AlarmBlock or DataPointBlock.`,
        );
      }
    }
    this.expectPunct("}");
    return node;
  }

  private commandResponseBlock(): CommandResponseBlockNode {
    this.expectKw("Command");
    const command = this.qualifiedRef("command");
    this.expectPunct("{");
    const block: CommandResponseBlockNode = {
      node: "CommandResponseBlock",
      command,
      validationRules: [],
      responseBlocks: [],
    };
    if (this.isKw("Action")) block.action = this.action();
    while (this.isKw("Validate")) block.validationRules.push(this.validation());
    if (this.acceptKw("Generate")) {
      this.expectKw("Response");
      this.expectPunct("{");
      while (!this.isPunct("}") && !this.atEnd) {
        block.responseBlocks.push(this.responseBlock());
      }
      this.expectPunct("}");
    }
    this.expectPunct("}");
    return block;
  }

  private responseBlock(): ResponseBlockNode {
    this.expectKw("expectedResponse");
    const response = this.qualifiedRef("response");
    this.expectPunct("{");
    const block: ResponseBlockNode = {
      node: "ResponseBlock",
      response,
      validationRules: [],
      responseAggregationRules: [],
    };
    if (this.isKw("Action")) block.action = this.action();
    while (this.isKw("Validate")) block.validationRules.push(this.validation());
    if (this.acceptKw("ResponseAggregation")) {
      this.expectPunct("{");
      while (!this.isPunct("}") && !this.atEnd) {
        block.responseAggregationRules.push(this.responseAggregationRule());
      }
      this.expectPunct("}");
    }
    this.expectPunct("}");
    return block;
  }

  private responseAggregationRule(): ResponseAggregationRuleNode {
    this.expectKw("received");
    this.expectKw("Responses");
    this.expectPunct("(");
    const inputResponses: string[] = [this.qualifiedRef("response")];
    const operators: string[] = [];
    while (this.isKw("and") || this.isKw("or")) {
      operators.push(this.next().value);
      inputResponses.push(this.qualifiedRef("response"));
    }
    this.expectPunct(")");

    const parameterTranslations: ParameterTranslationNode[] = [];
    if (this.acceptPunct("{")) {
      this.expectKw("parameterTranslations");
      this.expectPunct("{");
      while (!this.isPunct("}") && !this.atEnd) {
        parameterTranslations.push(this.parameterTranslation());
      }
      this.expectPunct("}");
      this.expectPunct("}");
    }

    return {
      node: "ResponseAggregationRule",
      inputResponses,
      operators,
      parameterTranslations,
    };
  }

  private parameterTranslation(): ParameterTranslationNode {
    this.expectKw("inputParameters");
    this.expectPunct("(");
    const inputParameters = this.qualifiedRefList("parameter");
    this.expectPunct(")");
    this.expectPunct("=>");
    this.expectKw("translatedParameters");
    this.expectPunct("(");
    const translatedParameter = this.qualifiedRef("parameter");
    this.expectPunct(")");
    return {
      node: "ParameterTranslation",
      inputParameters,
      translatedParameter,
    };
  }

  private handlerBlock(
    node: HandlerBlockNode["node"],
    keyword: string,
    refKind: "event" | "alarm" | "dataPoint",
  ): HandlerBlockNode {
    this.expectKw(keyword);
    const refs = this.qualifiedRefList(refKind);
    if (node !== "DataPointBlock" && refs.length > 1) {
      this.report(
        this.peek(-1),
        `A ${keyword} block handles exactly one ${keyword.toLowerCase()}.`,
        "mnc.too-many-handler-refs",
      );
    }
    this.expectPunct("{");
    const block: HandlerBlockNode = { node, refs, validationRules: [] };
    if (this.isKw("Action")) block.action = this.action();
    while (this.isKw("Validate")) block.validationRules.push(this.validation());
    this.expectPunct("}");
    return block;
  }

  /* ---------------------------------------------------------------- */
  /* Actions and validations                                           */
  /* ---------------------------------------------------------------- */

  private action(): ActionNode {
    this.expectKw("Action");
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
      if (this.acceptKw("raise")) {
        this.expectKw("alarms");
        action.raiseAlarm.push(...this.actionRefList("alarm"));
      } else if (this.acceptKw("fire")) {
        this.expectKw("commands");
        action.fireCommand.push(...this.actionRefList("command", true));
      } else if (this.acceptKw("generate")) {
        this.expectKw("events");
        action.publishEvent.push(...this.actionRefList("event"));
      } else if (this.acceptKw("trigger")) {
        this.expectKw("data");
        action.triggerDataPoint.push(...this.actionRefList("dataPoint"));
      } else if (this.acceptKw("execute")) {
        this.expectKw("operations");
        action.executeOperation.push(...this.actionRefList("operation"));
      } else if (this.acceptKw("transition")) {
        this.expectKw("states");
        this.expectPunct("[");
        while (!this.isPunct("]") && !this.atEnd) {
          action.transitionStates.push(this.transition());
          this.acceptPunct(",");
        }
        this.expectPunct("]");
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in Action. Expected raise, fire, generate, trigger, execute or transition.`,
        );
      }
    }
    this.expectPunct("}");
    return action;
  }

  private actionRefList(
    kind: "alarm" | "command" | "event" | "dataPoint" | "operation",
    allowExpected = false,
  ): ActionRefNode[] {
    this.expectPunct("[");
    const out: ActionRefNode[] = [];
    while (!this.isPunct("]") && !this.atEnd) {
      const ref = this.qualifiedRef(kind);
      this.expectPunct("(");
      const item: ActionRefNode = { ref, parameterValues: [], parameterMappings: [] };
      if (!this.isPunct(")")) {
        if (this.isKw("inputParameters")) {
          item.parameterMappings.push(this.parameterTranslation());
          while (this.acceptPunct(",")) {
            item.parameterMappings.push(this.parameterTranslation());
          }
        } else {
          item.parameterValues.push(this.primitiveValue());
          while (this.acceptPunct(",")) {
            item.parameterValues.push(this.primitiveValue());
          }
        }
      }
      this.expectPunct(")");
      if (allowExpected && this.isPunct("->")) {
        this.next();
        this.expectKw("expected");
        const handling: ResponseBlockNode[] = [];
        while (this.isKw("expectedResponse")) handling.push(this.responseBlock());
        item.responseHandling = handling;
      }
      out.push(item);
      this.acceptPunct(",");
    }
    this.expectPunct("]");
    return out;
  }

  private transition(): TransitionNode {
    this.expectKw("currentState");
    const currentState: string[] = [];
    let any = false;
    if (this.acceptKw("any")) {
      any = true;
    } else {
      currentState.push(...this.qualifiedRefList("operatingState"));
    }
    const transition: TransitionNode = {
      node: "Transition",
      currentState,
      any,
      nextState: "",
    };
    if (this.isPunct("(") && this.isKw("exitAction", 1)) {
      this.next();
      this.next();
      transition.exitAction = this.action();
      this.expectPunct(")");
    }
    this.expectPunct("=>");
    this.expectKw("nextState");
    transition.nextState = this.qualifiedRef("operatingState");
    if (this.isPunct("(") && this.isKw("entryAction", 1)) {
      this.next();
      this.next();
      transition.entryAction = this.action();
      this.expectPunct(")");
    }
    return transition;
  }

  private validation(): ValidationNode {
    this.expectKw("Validate");
    this.expectPunct("{");
    const validation: ValidationNode = {
      node: "Validation",
      rules: [],
      operators: [],
    };
    if (this.isKw("parameters") || this.isKw("operation")) {
      validation.rules.push(this.checkParameterCondition());
      while (this.isKw("and") || this.isKw("or")) {
        validation.operators.push(this.next().value);
        validation.rules.push(this.checkParameterCondition());
      }
    }
    while (!this.isPunct("}") && !this.atEnd) {
      if (this.acceptKw("onFail")) {
        validation.onFail = this.action();
      } else if (this.acceptKw("onSuccess")) {
        validation.onSuccess = this.action();
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in Validate. Expected 'onFail' or 'onSuccess'.`,
        );
      }
    }
    this.expectPunct("}");

    if (validation.rules.length > 0 && !validation.onFail) {
      this.report(
        this.peek(-1),
        "This validation has no 'onFail' action, so a failed check has no defined outcome. Safety-relevant designs must state what happens when a check fails.",
        "mnc.validation-without-onfail",
        "warning",
      );
    }
    return validation;
  }

  private checkParameterCondition(): CheckParameterConditionNode {
    const condition: CheckParameterConditionNode = {
      node: "CheckParameterCondition",
      mode: "parameters",
      parameters: [],
      checkValues: [],
    };

    if (this.acceptKw("parameters")) {
      condition.parameters.push(this.qualifiedRef("parameter"));
      while (this.isKw("and") || this.isKw("or") || this.isPunct(",")) {
        this.next();
        condition.parameters.push(this.qualifiedRef("parameter"));
      }
    } else {
      this.expectKw("operation");
      condition.mode = "operation";
      condition.operation = this.qualifiedRef("operation");
      this.expectPunct("(");
      condition.parameters.push(...this.qualifiedRefList("parameter"));
      this.expectPunct(")");
    }

    this.expectPunct("[");
    while (!this.isPunct("]") && !this.atEnd) {
      if (this.acceptKw("Max")) {
        this.expectKw("Value");
        this.expectPunct("=");
        condition.checkMaxValue = this.primitiveValue();
      } else if (this.acceptKw("Min")) {
        this.expectKw("Value");
        this.expectPunct("=");
        condition.checkMinValue = this.primitiveValue();
      } else if (this.acceptKw("Possible")) {
        this.expectKw("Values");
        this.expectPunct("=");
        this.expectPunct("(");
        condition.checkValues.push(this.primitiveValue());
        while (this.acceptPunct(",")) condition.checkValues.push(this.primitiveValue());
        this.expectPunct(")");
      } else {
        throw new ParseError(
          this.cur,
          `Unexpected '${this.cur.value}' in a parameter check. Expected 'Max Value', 'Min Value' or 'Possible Values'.`,
        );
      }
    }
    this.expectPunct("]");

    if (
      condition.checkMaxValue === undefined &&
      condition.checkMinValue === undefined &&
      condition.checkValues.length === 0
    ) {
      this.report(
        this.peek(-1),
        "This parameter check states no bound or allowed values, so it always passes.",
        "mnc.empty-parameter-check",
        "warning",
      );
    }

    const min = numericValue(condition.checkMinValue);
    const max = numericValue(condition.checkMaxValue);
    if (min !== undefined && max !== undefined && min > max) {
      this.report(
        this.peek(-1),
        `The minimum value (${min}) is greater than the maximum value (${max}), so this check can never pass.`,
        "mnc.contradictory-parameter-check",
      );
    }

    return condition;
  }
}

function numericValue(value: PrimitiveValue | undefined): number | undefined {
  if (!value) return undefined;
  if (value.kind === "int" || value.kind === "float") return value.value;
  return undefined;
}

export function parseMnc(source: string): ParseResult<MncModelNode> {
  const parser = new MncParser(source);
  let ast: MncModelNode | null = null;
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
    kind: "mncspec",
    ast,
    diagnostics: parser.diagnostics,
    references: parser.references,
  };
}
