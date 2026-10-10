import { getExampleWorkspace } from "@/lib/dsl/samples";

/**
 * Curated, opt-in real-world starter projects. Every project is an independent
 * persisted copy of the existing validated five-DSL reference workspace.
 * Complexity describes the engineering scenario, not a certification grade.
 */
export const PROJECT_TEMPLATES = [
  {
    id: "smart-building",
    level: 1,
    difficulty: "Beginner",
    learningGoal: "Trace one HVAC control loop from sensor data to a safe actuator action.",
  },
  {
    id: "precision-irrigation",
    level: 2,
    difficulty: "Foundational",
    learningGoal: "Coordinate field sensors, valve commands, and a low-water safety response.",
  },
  {
    id: "water-treatment",
    level: 3,
    difficulty: "Intermediate",
    learningGoal: "Model sequenced process control and protective recovery for municipal water.",
  },
  {
    id: "solar-microgrid",
    level: 4,
    difficulty: "Advanced",
    learningGoal: "Explore energy dispatch decisions, storage limits, and grid isolation.",
  },
  {
    id: "warehouse-fleet",
    level: 5,
    difficulty: "Expert",
    learningGoal: "Reason about autonomous motion, mission state, alarms, and recovery.",
  },
] as const;

export type ProjectTemplateId = (typeof PROJECT_TEMPLATES)[number]["id"];

export const PROJECT_TEMPLATE_CATALOG = PROJECT_TEMPLATES.map((template) => {
  const workspace = getExampleWorkspace(template.id);
  return {
    ...template,
    title: workspace.title,
    domain: workspace.domain,
    summary: workspace.summary,
    learningGoal: template.learningGoal,
    fileCount: workspace.files.length,
    demonstrates: workspace.demonstrates,
  };
});

export function projectTemplateById(templateId: string) {
  const template = PROJECT_TEMPLATE_CATALOG.find((entry) => entry.id === templateId);
  if (!template) throw new Error("Choose a valid starter example.");
  return template;
}

export function projectTemplateSources(templateId: string): Record<string, string> {
  projectTemplateById(templateId);
  return Object.fromEntries(
    getExampleWorkspace(templateId).files.map((file) => [file.path, file.source]),
  );
}
