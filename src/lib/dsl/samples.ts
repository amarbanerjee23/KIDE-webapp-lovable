import type { DslKind } from "./ast";

export interface SampleFile {
  path: string;
  kind: DslKind;
  source: string;
}

export interface ExampleWorkspace {
  id: string;
  title: string;
  domain: string;
  summary: string;
  engineeringChallenge: string;
  demonstrates: string[];
  tags: string[];
  files: SampleFile[];
}

interface ExampleConfig {
  id: string;
  title: string;
  domain: string;
  summary: string;
  engineeringChallenge: string;
  demonstrates: string[];
  tags: string[];
  fileStem: string;
  activityFile: string;
  packageName: string;
  telemetryModel: string;
  planModel: string;
  contextModel: string;
  planIdField: string;
  targetCountField: string;
  contextIdField: string;
  primaryMetric: string;
  rateMetric: string;
  locationMetric: string;
  evaluateOperation: string;
  checkOperation: string;
  interfaceName: string;
  controllerName: string;
  startCommand: string;
  actionCommand: string;
  stopCommand: string;
  readyEvent: string;
  outcomeEvent: string;
  alarm: string;
  acceptedResponse: string;
  rejectedResponse: string;
  idleState: string;
  activeState: string;
  safeState: string;
  primaryCapability: string;
  recoveryCapability: string;
  diagramName: string;
  prepareActivity: string;
  actionActivity: string;
  recoveryActivity: string;
  prepareDescription: string;
  physicalContext: string;
  finalResult: string;
  ipAddress: string;
  maxSetpoint: number;
  recoveryThreshold: number;
  defaultPrimaryMetric: number;
}

function buildExample(config: ExampleConfig): ExampleWorkspace {
  const dml = `Package ${config.packageName}

DataModel ${config.telemetryModel} {
  primitives { int ${config.primaryMetric}, float ${config.rateMetric}, string ${config.locationMetric} }
}

DataModel ${config.planModel} {
  primitives { string ${config.planIdField}, int ${config.targetCountField} }
}

DataModel ${config.contextModel} {
  primitives { string ${config.contextIdField} }
  composites { ${config.telemetryModel}, ${config.planModel} }
}
`;

  const operations = `Operation ${config.evaluateOperation}(${config.telemetryModel} telemetry, int ${config.targetCountField}) {
  execute "com.kide.examples.${config.id}.${config.evaluateOperation}"
  return float evaluationScore
}

Operation ${config.checkOperation}(int ${config.primaryMetric}) {
  return boolean acceptable
}
`;

  const mnc = `Model ${config.packageName}System

InterfaceDescription ${config.interfaceName} {
  port control = 8443
  commands {
    ${config.startCommand}[]
    async ${config.actionCommand}[ int targetId, float setpoint ]
    ${config.stopCommand}[]
  }
  events {
    Publish ${config.readyEvent}[]
    Publish ${config.outcomeEvent}[ int targetId ]
  }
  alarms {
    Publish ${config.alarm}[ int level, level = 2 ]
  }
  responses {
    ${config.acceptedResponse}[ int targetId ]
    ${config.rejectedResponse}[ string reason ]
  }
  dataPoints {
    Publish int ${config.primaryMetric} = ${config.defaultPrimaryMetric} []
  }
  operatingStates {
    ${config.idleState}[]
    ${config.activeState}[]
    ${config.safeState}[]
    startStates : ${config.idleState}
    endStates : ${config.idleState}
  }
  IPaddress : ${config.ipAddress}
}

ControlNode ${config.controllerName} implements interface ${config.interfaceName} {
  CommandResponseBlock {
    Command ${config.actionCommand} {
      Action {
        transition states [ currentState ${config.idleState} => nextState ${config.activeState} ]
      }
      Validate {
        parameters setpoint [ Min Value = 0 Max Value = ${config.maxSetpoint} ]
        onFail Action { raise alarms [ ${config.alarm} ( 0 ) ] }
      }
      Generate Response {
        expectedResponse ${config.acceptedResponse} {
          Action { generate events [ ${config.outcomeEvent} ( 1 ) ] }
        }
      }
    }
  }
  AlarmBlock {
    Alarm ${config.alarm} {
      Action { fire commands [ ${config.stopCommand} ( ) ] }
    }
  }
}
`;

  const capability = `Capability ${config.primaryCapability} compatible component interface ${config.interfaceName} {
  Init {
    fire Commands [ ${config.startCommand} ( ) ]
    subscribe events [ ${config.readyEvent} ( ) ]
  }
  providesControlCapabilities {
    fireable commands : ${config.actionCommand}, ${config.stopCommand}
    receivable events : ${config.outcomeEvent}
    raised alarms : ${config.alarm}
    subscribable DataPoints : ${config.primaryMetric}
  }
  providesOutcomes {
    receivable responses ${config.acceptedResponse}, ${config.rejectedResponse}
    receivable events ${config.outcomeEvent}
  }
}

Capability ${config.recoveryCapability} compatible component interface ${config.interfaceName} {
  providesControlCapabilities {
    fireable commands : ${config.stopCommand}
  }
  providesOutcomes {
    receivable dataPoints ${config.primaryMetric}
  }
}
`;

  const activity = `ActivityDiagram ${config.diagramName}
uses Objects [ ${config.primaryMetric}, ${config.rateMetric} ]
on context ${config.contextModel}
physical contexts "${config.physicalContext}"
produces results ( string ${config.finalResult} )
has activities {
  Activity ${config.prepareActivity} {
    description : "${config.prepareDescription}"
    inputData { ${config.primaryMetric} }
    requireOperation ( ${config.evaluateOperation} )
    nextActivity : ${config.actionActivity}
    time : 2.0 secs
  },
  Activity ${config.actionActivity} {
    requireCapability : ${config.primaryCapability} { ${config.actionCommand}, ${config.outcomeEvent} }
    conditions {
      from ${config.outcomeEvent} if outcome targetId is ( > 0 ) => nextActivity : ${config.recoveryActivity},
      from ${config.alarm} => nextActivity : ${config.recoveryActivity}
    }
    time : 30.0 secs
  },
  Activity ${config.recoveryActivity} {
    requireCapability : ${config.recoveryCapability} { ${config.stopCommand} }
    conditions {
      from ${config.primaryMetric} if outcome ${config.primaryMetric} is ( > ${config.recoveryThreshold} ) final result : ${config.finalResult}
    }
  }
}
`;

  return {
    id: config.id,
    title: config.title,
    domain: config.domain,
    summary: config.summary,
    engineeringChallenge: config.engineeringChallenge,
    demonstrates: config.demonstrates,
    tags: config.tags,
    files: [
      { path: `${config.fileStem}.dml`, kind: "dml", source: dml },
      { path: `${config.fileStem}.op`, kind: "op", source: operations },
      { path: `${config.fileStem}.mncspec`, kind: "mncspec", source: mnc },
      { path: `${config.fileStem}.cap`, kind: "cap", source: capability },
      { path: config.activityFile, kind: "activity", source: activity },
    ],
  };
}

// prettier-ignore
const EXAMPLE_CONFIGS: ExampleConfig[] = [
  {
    id: "warehouse-fleet",
    title: "Autonomous warehouse fleet",
    domain: "Industrial robotics",
    summary: "Coordinate autonomous material-handling vehicles through route planning, motion execution, battery-aware fallback, and mission completion.",
    engineeringChallenge: "Bind fleet telemetry, route intent, vehicle commands, alarms, responses, and mission activities into one traceable control model.",
    demonstrates: ["Cross-model vehicle capability binding","Command validation with alarm-driven stop","Activity branching from events and alarms"],
    tags: ["robotics","warehouse","autonomy"],
    fileStem: "Ecre",
    activityFile: "MissionPlanning.activity",
    packageName: "Ecre",
    telemetryModel: "Telemetry",
    planModel: "RoutePlan",
    contextModel: "MissionContext",
    planIdField: "routeId",
    targetCountField: "waypointCount",
    contextIdField: "missionId",
    primaryMetric: "batteryPercent",
    rateMetric: "speed",
    locationMetric: "zone",
    evaluateOperation: "EstimateArrival",
    checkOperation: "CheckBattery",
    interfaceName: "Vehicle",
    controllerName: "FleetController",
    startCommand: "Start",
    actionCommand: "MoveTo",
    stopCommand: "Stop",
    readyEvent: "Ready",
    outcomeEvent: "WaypointReached",
    alarm: "BatteryLow",
    acceptedResponse: "MoveAccepted",
    rejectedResponse: "MoveRejected",
    idleState: "Idle",
    activeState: "Moving",
    safeState: "Charging",
    primaryCapability: "Navigate",
    recoveryCapability: "Recharge",
    diagramName: "MissionPlanning",
    prepareActivity: "PlanRoute",
    actionActivity: "MoveToWaypoint",
    recoveryActivity: "RechargeStep",
    prepareDescription: "Compute the waypoint sequence and verify that the fleet can complete the mission.",
    physicalContext: "Warehouse floor 2",
    finalResult: "missionOutcome",
    ipAddress: "10.0.14.7",
    maxSetpoint: 4,
    recoveryThreshold: 95,
    defaultPrimaryMetric: 100,
  },
  {
    id: "precision-irrigation",
    title: "Precision irrigation controller",
    domain: "Agriculture",
    summary: "Schedule zone irrigation from soil telemetry while enforcing reservoir limits and safe valve shutdown.",
    engineeringChallenge: "Translate field measurements into auditable irrigation actions that remain bounded by water availability and equipment state.",
    demonstrates: ["Sensor-to-actuator traceability","Reservoir alarm handling","Zone-level irrigation workflow"],
    tags: ["agriculture","irrigation","water-efficiency"],
    fileStem: "Agri",
    activityFile: "IrrigationCycle.activity",
    packageName: "Agri",
    telemetryModel: "SoilTelemetry",
    planModel: "IrrigationPlan",
    contextModel: "FieldContext",
    planIdField: "scheduleId",
    targetCountField: "zoneCount",
    contextIdField: "fieldId",
    primaryMetric: "reservoirPercent",
    rateMetric: "flowRate",
    locationMetric: "fieldZone",
    evaluateOperation: "EstimateWaterDemand",
    checkOperation: "CheckReservoir",
    interfaceName: "IrrigationValve",
    controllerName: "FieldIrrigationController",
    startCommand: "Prime",
    actionCommand: "IrrigateZone",
    stopCommand: "CloseValve",
    readyEvent: "ValveReady",
    outcomeEvent: "ZoneIrrigated",
    alarm: "LowReservoir",
    acceptedResponse: "IrrigationAccepted",
    rejectedResponse: "IrrigationRejected",
    idleState: "Closed",
    activeState: "Watering",
    safeState: "Conserving",
    primaryCapability: "PrecisionIrrigation",
    recoveryCapability: "WaterConservation",
    diagramName: "IrrigationCycle",
    prepareActivity: "AssessSoil",
    actionActivity: "IrrigateCropZone",
    recoveryActivity: "ConserveWater",
    prepareDescription: "Estimate zone water demand from current field telemetry and the irrigation schedule.",
    physicalContext: "North greenhouse block",
    finalResult: "irrigationOutcome",
    ipAddress: "10.20.1.14",
    maxSetpoint: 120,
    recoveryThreshold: 35,
    defaultPrimaryMetric: 80,
  },
  {
    id: "infusion-safety",
    title: "Infusion pump safety workflow",
    domain: "Clinical device engineering",
    summary: "Model a simulated infusion pump that validates delivery programs, reports completion, and enters a safe hold on device alarms.",
    engineeringChallenge: "Keep safety-critical device commands, observations, and fallback behavior explicit without embedding clinical dosing decisions.",
    demonstrates: ["Safety-state transitions","Alarm-triggered safe hold","Program acceptance and completion evidence"],
    tags: ["medical-device","safety","simulation"],
    fileStem: "Infusion",
    activityFile: "InfusionSafety.activity",
    packageName: "Infusion",
    telemetryModel: "PumpTelemetry",
    planModel: "DeliveryProgram",
    contextModel: "PumpContext",
    planIdField: "programId",
    targetCountField: "segmentCount",
    contextIdField: "sessionId",
    primaryMetric: "reservoirPercent",
    rateMetric: "deliveryRate",
    locationMetric: "wardZone",
    evaluateOperation: "EvaluateProgramReadiness",
    checkOperation: "CheckReservoir",
    interfaceName: "InfusionPump",
    controllerName: "PumpSafetyController",
    startCommand: "ArmPump",
    actionCommand: "RunProgram",
    stopCommand: "SafeHold",
    readyEvent: "PumpReady",
    outcomeEvent: "ProgramCompleted",
    alarm: "OcclusionAlarm",
    acceptedResponse: "ProgramAccepted",
    rejectedResponse: "ProgramRejected",
    idleState: "Disarmed",
    activeState: "Delivering",
    safeState: "Holding",
    primaryCapability: "ControlledDelivery",
    recoveryCapability: "SafeHoldCapability",
    diagramName: "InfusionSafety",
    prepareActivity: "ValidateProgram",
    actionActivity: "ExecuteProgram",
    recoveryActivity: "EnterSafeHold",
    prepareDescription: "Validate device readiness and program structure before simulated execution.",
    physicalContext: "Clinical simulation ward",
    finalResult: "deliveryOutcome",
    ipAddress: "10.30.5.9",
    maxSetpoint: 50,
    recoveryThreshold: 20,
    defaultPrimaryMetric: 100,
  },
  {
    id: "solar-microgrid",
    title: "Solar microgrid orchestration",
    domain: "Energy systems",
    summary: "Dispatch battery-backed solar power across a local feeder while protecting reserve state and isolating on grid alarms.",
    engineeringChallenge: "Coordinate generation, storage, dispatch, and protective fallback as one inspectable cyber-physical workflow.",
    demonstrates: ["Energy dispatch capability","Reserve-aware protection","Feeder event-driven activity flow"],
    tags: ["energy","microgrid","renewables"],
    fileStem: "Microgrid",
    activityFile: "EnergyDispatch.activity",
    packageName: "Microgrid",
    telemetryModel: "GridTelemetry",
    planModel: "DispatchPlan",
    contextModel: "GridContext",
    planIdField: "dispatchId",
    targetCountField: "intervalCount",
    contextIdField: "siteId",
    primaryMetric: "stateOfCharge",
    rateMetric: "powerKw",
    locationMetric: "feeder",
    evaluateOperation: "ForecastNetDemand",
    checkOperation: "CheckReserve",
    interfaceName: "BatteryInverter",
    controllerName: "MicrogridController",
    startCommand: "Connect",
    actionCommand: "DispatchPower",
    stopCommand: "Isolate",
    readyEvent: "GridReady",
    outcomeEvent: "DispatchCompleted",
    alarm: "ReserveLow",
    acceptedResponse: "DispatchAccepted",
    rejectedResponse: "DispatchRejected",
    idleState: "Standby",
    activeState: "Dispatching",
    safeState: "Islanded",
    primaryCapability: "PowerDispatch",
    recoveryCapability: "ReserveProtection",
    diagramName: "EnergyDispatch",
    prepareActivity: "ForecastDemand",
    actionActivity: "DispatchInterval",
    recoveryActivity: "ProtectReserve",
    prepareDescription: "Forecast local demand and prepare a bounded dispatch interval.",
    physicalContext: "Community microgrid feeder A",
    finalResult: "dispatchOutcome",
    ipAddress: "10.40.3.11",
    maxSetpoint: 500,
    recoveryThreshold: 25,
    defaultPrimaryMetric: 75,
  },
  {
    id: "water-treatment",
    title: "Municipal water treatment process",
    domain: "Water infrastructure",
    summary: "Coordinate treatment basin dosing equipment from process telemetry while enforcing tank-level and quality safeguards.",
    engineeringChallenge: "Connect process data, treatment commands, alarms, and recovery actions across a regulated infrastructure workflow.",
    demonstrates: ["Process-control capability binding","Low-level protection","Treatment-stage sequencing"],
    tags: ["water","infrastructure","process-control"],
    fileStem: "WaterPlant",
    activityFile: "TreatmentCycle.activity",
    packageName: "WaterPlant",
    telemetryModel: "ProcessTelemetry",
    planModel: "TreatmentPlan",
    contextModel: "PlantContext",
    planIdField: "batchId",
    targetCountField: "basinCount",
    contextIdField: "plantId",
    primaryMetric: "tankLevelPercent",
    rateMetric: "flowRate",
    locationMetric: "basin",
    evaluateOperation: "EstimateTreatmentLoad",
    checkOperation: "CheckTankLevel",
    interfaceName: "DosingSkid",
    controllerName: "TreatmentController",
    startCommand: "PrimeSkid",
    actionCommand: "DoseBasin",
    stopCommand: "StopDosing",
    readyEvent: "SkidReady",
    outcomeEvent: "BasinTreated",
    alarm: "TankLevelLow",
    acceptedResponse: "DoseAccepted",
    rejectedResponse: "DoseRejected",
    idleState: "Idle",
    activeState: "Dosing",
    safeState: "Paused",
    primaryCapability: "ControlledDosing",
    recoveryCapability: "ProcessHold",
    diagramName: "TreatmentCycle",
    prepareActivity: "AssessInfluent",
    actionActivity: "TreatBasin",
    recoveryActivity: "HoldProcess",
    prepareDescription: "Estimate treatment load and prepare the next bounded basin operation.",
    physicalContext: "Municipal treatment train 1",
    finalResult: "treatmentOutcome",
    ipAddress: "10.50.2.8",
    maxSetpoint: 200,
    recoveryThreshold: 30,
    defaultPrimaryMetric: 90,
  },
  {
    id: "semiconductor-fab",
    title: "Semiconductor fab material handling",
    domain: "Advanced manufacturing",
    summary: "Coordinate automated material handling between process bays while monitoring buffer capacity and transport faults.",
    engineeringChallenge: "Maintain deterministic wafer-carrier movement across highly constrained production bays with explicit fallback behavior.",
    demonstrates: ["AMHS command modeling","Bay transfer evidence","Buffer-capacity recovery branch"],
    tags: ["semiconductor","manufacturing","automation"],
    fileStem: "Fab",
    activityFile: "CarrierTransfer.activity",
    packageName: "Fab",
    telemetryModel: "FabTelemetry",
    planModel: "TransferPlan",
    contextModel: "FabContext",
    planIdField: "lotRouteId",
    targetCountField: "bayCount",
    contextIdField: "lotId",
    primaryMetric: "bufferCapacityPercent",
    rateMetric: "transportSpeed",
    locationMetric: "processBay",
    evaluateOperation: "EstimateTransferTime",
    checkOperation: "CheckBufferCapacity",
    interfaceName: "CarrierTransport",
    controllerName: "MaterialHandlingController",
    startCommand: "EnableTransport",
    actionCommand: "TransferCarrier",
    stopCommand: "ParkCarrier",
    readyEvent: "TransportReady",
    outcomeEvent: "CarrierArrived",
    alarm: "BufferSaturated",
    acceptedResponse: "TransferAccepted",
    rejectedResponse: "TransferRejected",
    idleState: "Parked",
    activeState: "Transferring",
    safeState: "Buffered",
    primaryCapability: "CarrierTransfer",
    recoveryCapability: "BufferManagement",
    diagramName: "CarrierTransfer",
    prepareActivity: "PlanLotTransfer",
    actionActivity: "MoveCarrier",
    recoveryActivity: "BufferCarrier",
    prepareDescription: "Evaluate the route and buffer capacity before moving the next carrier.",
    physicalContext: "300 mm fab bay network",
    finalResult: "transferOutcome",
    ipAddress: "10.60.7.21",
    maxSetpoint: 8,
    recoveryThreshold: 15,
    defaultPrimaryMetric: 70,
  },
  {
    id: "rail-platform",
    title: "Rail platform approach safety",
    domain: "Rail transportation",
    summary: "Model platform approach coordination using train telemetry, bounded movement commands, and a protective stop path.",
    engineeringChallenge: "Make the relationship between approach state, platform commands, alarms, and safe-stop activities fully traceable.",
    demonstrates: ["Transport safety states","Approach command validation","Alarm-driven protective stop"],
    tags: ["rail","transport","safety"],
    fileStem: "Rail",
    activityFile: "PlatformApproach.activity",
    packageName: "Rail",
    telemetryModel: "ApproachTelemetry",
    planModel: "PlatformPlan",
    contextModel: "RailContext",
    planIdField: "serviceId",
    targetCountField: "markerCount",
    contextIdField: "approachId",
    primaryMetric: "brakePressurePercent",
    rateMetric: "approachSpeed",
    locationMetric: "platformZone",
    evaluateOperation: "EstimateStoppingMargin",
    checkOperation: "CheckBrakePressure",
    interfaceName: "TrainControlUnit",
    controllerName: "PlatformSafetyController",
    startCommand: "ArmApproach",
    actionCommand: "ProceedToMarker",
    stopCommand: "ProtectiveStop",
    readyEvent: "ApproachReady",
    outcomeEvent: "MarkerReached",
    alarm: "StoppingMarginLow",
    acceptedResponse: "MovementAccepted",
    rejectedResponse: "MovementRejected",
    idleState: "Holding",
    activeState: "Approaching",
    safeState: "Protected",
    primaryCapability: "ControlledApproach",
    recoveryCapability: "ProtectiveStopping",
    diagramName: "PlatformApproach",
    prepareActivity: "AssessApproach",
    actionActivity: "ProceedToPlatform",
    recoveryActivity: "ApplyProtection",
    prepareDescription: "Estimate stopping margin before authorizing the next bounded approach movement.",
    physicalContext: "Station platform 4 approach",
    finalResult: "approachOutcome",
    ipAddress: "10.70.4.6",
    maxSetpoint: 25,
    recoveryThreshold: 60,
    defaultPrimaryMetric: 95,
  },
  {
    id: "cold-chain",
    title: "Cold-chain container stabilization",
    domain: "Logistics and life-science operations",
    summary: "Maintain a refrigerated transport container within its operating envelope while handling cooling-resource alarms and route checkpoints.",
    engineeringChallenge: "Tie environmental telemetry, cooling commands, alarms, and checkpoint workflow evidence together across a mobile cold-chain asset.",
    demonstrates: ["Environmental control loop","Resource-aware fallback","Checkpoint completion events"],
    tags: ["logistics","cold-chain","refrigeration"],
    fileStem: "ColdChain",
    activityFile: "ContainerStabilization.activity",
    packageName: "ColdChain",
    telemetryModel: "ContainerTelemetry",
    planModel: "CoolingPlan",
    contextModel: "ShipmentContext",
    planIdField: "shipmentId",
    targetCountField: "checkpointCount",
    contextIdField: "containerId",
    primaryMetric: "coolantReservePercent",
    rateMetric: "chamberTemperature",
    locationMetric: "routeZone",
    evaluateOperation: "EstimateCoolingDemand",
    checkOperation: "CheckCoolantReserve",
    interfaceName: "ReeferController",
    controllerName: "ColdChainController",
    startCommand: "EnableCooling",
    actionCommand: "StabilizeCheckpoint",
    stopCommand: "ConserveCooling",
    readyEvent: "CoolingReady",
    outcomeEvent: "CheckpointStable",
    alarm: "TemperatureExcursion",
    acceptedResponse: "CoolingAccepted",
    rejectedResponse: "CoolingRejected",
    idleState: "Monitoring",
    activeState: "Cooling",
    safeState: "Conserving",
    primaryCapability: "ThermalStabilization",
    recoveryCapability: "CoolingConservation",
    diagramName: "ContainerStabilization",
    prepareActivity: "AssessThermalLoad",
    actionActivity: "StabilizeContainer",
    recoveryActivity: "ConserveCoolant",
    prepareDescription: "Estimate thermal load before stabilizing the next shipment checkpoint.",
    physicalContext: "Refrigerated container route segment",
    finalResult: "stabilizationOutcome",
    ipAddress: "10.80.9.13",
    maxSetpoint: 20,
    recoveryThreshold: 25,
    defaultPrimaryMetric: 85,
  },
  {
    id: "smart-building",
    title: "Commercial building air-quality control",
    domain: "Smart buildings",
    summary: "Coordinate HVAC zone conditioning from occupancy and airflow telemetry while preserving damper authority and safe fallback.",
    engineeringChallenge: "Connect building telemetry, zone control commands, air-quality alarms, and recovery actions in one transparent workflow.",
    demonstrates: ["Building automation control","Zone event orchestration","Safe ventilation fallback"],
    tags: ["building","hvac","energy-efficiency"],
    fileStem: "Building",
    activityFile: "ZoneConditioning.activity",
    packageName: "Building",
    telemetryModel: "ZoneTelemetry",
    planModel: "ComfortPlan",
    contextModel: "BuildingContext",
    planIdField: "scheduleId",
    targetCountField: "zoneCount",
    contextIdField: "buildingId",
    primaryMetric: "damperAuthorityPercent",
    rateMetric: "airflowRate",
    locationMetric: "floorZone",
    evaluateOperation: "EstimateVentilationDemand",
    checkOperation: "CheckDamperAuthority",
    interfaceName: "AirHandler",
    controllerName: "BuildingAutomationController",
    startCommand: "EnableAirHandler",
    actionCommand: "ConditionZone",
    stopCommand: "SafeVentilation",
    readyEvent: "AirHandlerReady",
    outcomeEvent: "ZoneConditioned",
    alarm: "AirQualityLimit",
    acceptedResponse: "ConditioningAccepted",
    rejectedResponse: "ConditioningRejected",
    idleState: "Standby",
    activeState: "Conditioning",
    safeState: "Ventilating",
    primaryCapability: "ZoneConditioning",
    recoveryCapability: "SafeVentilationCapability",
    diagramName: "ZoneConditioning",
    prepareActivity: "AssessZoneDemand",
    actionActivity: "ConditionOccupiedZone",
    recoveryActivity: "VentilateSafely",
    prepareDescription: "Estimate ventilation demand before conditioning the next occupied zone.",
    physicalContext: "Office tower floor 12",
    finalResult: "comfortOutcome",
    ipAddress: "10.90.12.4",
    maxSetpoint: 100,
    recoveryThreshold: 40,
    defaultPrimaryMetric: 90,
  },
  {
    id: "offshore-wind",
    title: "Offshore wind turbine inspection",
    domain: "Renewable energy operations",
    summary: "Coordinate an inspection drone around wind-turbine checkpoints while enforcing battery reserve and environmental abort behavior.",
    engineeringChallenge: "Model autonomous inspection actions, completion evidence, and safe-return behavior under changing offshore conditions.",
    demonstrates: ["Autonomous inspection mission","Battery-aware return path","Checkpoint event traceability"],
    tags: ["wind-energy","drone","inspection"],
    fileStem: "WindInspection",
    activityFile: "BladeInspection.activity",
    packageName: "WindInspection",
    telemetryModel: "DroneTelemetry",
    planModel: "InspectionPlan",
    contextModel: "InspectionContext",
    planIdField: "inspectionId",
    targetCountField: "checkpointCount",
    contextIdField: "turbineId",
    primaryMetric: "batteryPercent",
    rateMetric: "inspectionSpeed",
    locationMetric: "bladeZone",
    evaluateOperation: "EstimateInspectionDuration",
    checkOperation: "CheckBatteryReserve",
    interfaceName: "InspectionDrone",
    controllerName: "InspectionMissionController",
    startCommand: "Launch",
    actionCommand: "InspectCheckpoint",
    stopCommand: "ReturnHome",
    readyEvent: "DroneReady",
    outcomeEvent: "CheckpointInspected",
    alarm: "WindLimitExceeded",
    acceptedResponse: "InspectionAccepted",
    rejectedResponse: "InspectionRejected",
    idleState: "Landed",
    activeState: "Inspecting",
    safeState: "Returning",
    primaryCapability: "BladeInspection",
    recoveryCapability: "SafeReturn",
    diagramName: "BladeInspection",
    prepareActivity: "PlanInspection",
    actionActivity: "InspectBladeCheckpoint",
    recoveryActivity: "ReturnSafely",
    prepareDescription: "Estimate mission duration and reserve before starting the next blade checkpoint.",
    physicalContext: "Offshore turbine WT-17",
    finalResult: "inspectionOutcome",
    ipAddress: "10.100.17.3",
    maxSetpoint: 15,
    recoveryThreshold: 30,
    defaultPrimaryMetric: 100,
  },
];

/** Ten explicit, opt-in reference workspaces spanning diverse engineering domains. */
export const EXAMPLE_WORKSPACES: ExampleWorkspace[] = EXAMPLE_CONFIGS.map(buildExample);

export const DEFAULT_EXAMPLE_WORKSPACE_ID = "warehouse-fleet";

export function getExampleWorkspace(id: string): ExampleWorkspace {
  const example = EXAMPLE_WORKSPACES.find((entry) => entry.id === id);
  if (!example) throw new Error(`Unknown KIDE example workspace: ${id}`);
  return example;
}

/** Backward-compatible alias for the original explicit warehouse example. */
export const SAMPLE_WORKSPACE: SampleFile[] = getExampleWorkspace(
  DEFAULT_EXAMPLE_WORKSPACE_ID,
).files;
