import type { DslKind } from "./ast";

export interface SampleFile {
  path: string;
  kind: DslKind;
  source: string;
}

/**
 * A complete, internally consistent five-language example modelled on the
 * warehouse fleet case study. Every cross-model reference resolves, so this
 * doubles as the reference workspace for the editors.
 */
export const SAMPLE_WORKSPACE: SampleFile[] = [
  {
    path: "Ecre.dml",
    kind: "dml",
    source: `Package Ecre

DataModel Telemetry {
  primitives { int batteryPercent, float speed, string zone }
}

DataModel RoutePlan {
  primitives { string routeId, int waypointCount }
}

DataModel MissionContext {
  primitives { string missionId }
  composites { Telemetry, RoutePlan }
}
`,
  },
  {
    path: "Ecre.op",
    kind: "op",
    source: `Operation EstimateArrival(Telemetry telemetry, int waypointCount) {
  execute "com.kide.ops.EstimateArrival"
  return float etaMinutes
}

Operation CheckBattery(int batteryPercent) {
  return boolean sufficient
}
`,
  },
  {
    path: "Ecre.mncspec",
    kind: "mncspec",
    source: `Model EcreFleet

InterfaceDescription Vehicle {
  port control = 8443
  commands {
    Start[]
    async MoveTo[ int waypointId, float speed ]
    Stop[]
  }
  events {
    Publish Ready[]
    Publish WaypointReached[ int waypointId ]
  }
  alarms {
    Publish BatteryLow[ int batteryLevel, level = 2 ]
  }
  responses {
    MoveAccepted[ int waypointId ]
    MoveRejected[ string reason ]
  }
  dataPoints {
    Publish int batteryPercent = 100 []
  }
  operatingStates {
    Idle[]
    Moving[]
    Charging[]
    startStates : Idle
    endStates : Idle
  }
  IPaddress : 10.0.14.7
}

ControlNode FleetController implements interface Vehicle {
  CommandResponseBlock {
    Command MoveTo {
      Action {
        transition states [ currentState Idle => nextState Moving ]
      }
      Validate {
        parameters speed [ Min Value = 0 Max Value = 4 ]
        onFail Action { raise alarms [ BatteryLow ( 0 ) ] }
      }
      Generate Response {
        expectedResponse MoveAccepted {
          Action { generate events [ WaypointReached ( 1 ) ] }
        }
      }
    }
  }
  AlarmBlock {
    Alarm BatteryLow {
      Action { fire commands [ Stop ( ) ] }
    }
  }
}
`,
  },
  {
    path: "Ecre.cap",
    kind: "cap",
    source: `Capability Navigate compatible component interface Vehicle {
  Init {
    fire Commands [ Start ( ) ]
    subscribe events [ Ready ( ) ]
  }
  providesControlCapabilities {
    fireable commands : MoveTo, Stop
    receivable events : WaypointReached
    raised alarms : BatteryLow
    subscribable DataPoints : batteryPercent
  }
  providesOutcomes {
    receivable responses MoveAccepted, MoveRejected
    receivable events WaypointReached
  }
}

Capability Recharge compatible component interface Vehicle {
  providesControlCapabilities {
    fireable commands : Stop
  }
  providesOutcomes {
    receivable dataPoints batteryPercent
  }
}
`,
  },
  {
    path: "MissionPlanning.activity",
    kind: "activity",
    source: `ActivityDiagram MissionPlanning
uses Objects [ batteryPercent, speed ]
on context MissionContext
physical contexts "Warehouse floor 2"
produces results ( string missionOutcome )
has activities {
  Activity PlanRoute {
    description : "Compute the waypoint sequence for the mission"
    inputData { batteryPercent }
    requireOperation ( EstimateArrival )
    nextActivity : MoveToWaypoint
    time : 2.0 secs
  },
  Activity MoveToWaypoint {
    requireCapability : Navigate { MoveTo, WaypointReached }
    conditions {
      from WaypointReached if outcome waypointId is ( > 0 ) => nextActivity : RechargeStep,
      from BatteryLow => nextActivity : RechargeStep
    }
    time : 30.0 secs
  },
  Activity RechargeStep {
    requireCapability : Recharge { Stop }
    conditions {
      from batteryPercent if outcome batteryPercent is ( > 95 ) final result : missionOutcome
    }
  }
}
`,
  },
];
