import { useMemo } from "react";
import type { Model } from "@/lib/kide-dsl";

const CAP_X = 16;
const CAP_W = 268;
const ACT_X = 30;
const ACT_W = 240;
const ACT_H = 46;
const ACT_GAP = 10;
const CAP_HEADER = 40;
const CAP_GAP = 22;
const RES_X = 344;
const RES_W = 168;
const RES_H = 38;
const RES_GAP = 14;
const TOP = 20;

type Placed = { id: string; label: string; x: number; y: number; w: number; h: number };

export function KideDiagram({ model }: { model: Model }) {
  const layout = useMemo(() => {
    const acts: Placed[] = [];
    const caps: (Placed & { count: number })[] = [];
    let y = TOP;

    for (const cap of model.capabilities) {
      const inner = cap.activities.length
        ? cap.activities.length * ACT_H + (cap.activities.length - 1) * ACT_GAP
        : 28;
      const h = CAP_HEADER + inner + 16;
      caps.push({
        id: cap.id,
        label: cap.label,
        x: CAP_X,
        y,
        w: CAP_W,
        h,
        count: cap.activities.length,
      });
      cap.activities.forEach((a, i) => {
        acts.push({
          id: a.id,
          label: a.label,
          x: ACT_X,
          y: y + CAP_HEADER + i * (ACT_H + ACT_GAP),
          w: ACT_W,
          h: ACT_H,
        });
      });
      y += h + CAP_GAP;
    }

    const resources: Placed[] = model.resources.map((r, i) => ({
      id: r,
      label: r,
      x: RES_X,
      y: TOP + i * (RES_H + RES_GAP),
      w: RES_W,
      h: RES_H,
    }));

    const byId = (list: Placed[], id: string) => list.find((n) => n.id === id);
    const edges: { d: string; kind: "requires" | "produces"; key: string }[] = [];

    for (const cap of model.capabilities) {
      for (const a of cap.activities) {
        const node = byId(acts, a.id);
        if (!node) continue;
        for (const r of a.produces) {
          const target = byId(resources, r);
          if (!target) continue;
          edges.push({
            key: `p-${a.id}-${r}`,
            kind: "produces",
            d: curve(node.x + node.w, node.y + node.h / 2, target.x, target.y + target.h / 2),
          });
        }
        for (const r of a.requires) {
          const source = byId(resources, r);
          if (!source) continue;
          edges.push({
            key: `r-${a.id}-${r}`,
            kind: "requires",
            d: curve(source.x, source.y + source.h / 2, node.x + node.w, node.y + node.h / 2),
          });
        }
      }
    }

    const height =
      Math.max(
        y,
        TOP + resources.length * (RES_H + RES_GAP),
        140,
      ) + 12;

    return { caps, acts, resources, edges, height };
  }, [model]);

  if (!model.capabilities.length) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Start typing a capability on the left and the diagram appears here.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 528 ${layout.height}`}
      className="h-full w-full"
      role="img"
      aria-label="Live diagram of the capabilities, activities and artefacts in the model"
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {layout.edges.map((e) => (
        <path
          key={e.key}
          d={e.d}
          fill="none"
          strokeWidth={1.6}
          markerEnd="url(#arrow)"
          className={
            e.kind === "produces"
              ? "flow-line text-activity"
              : "flow-line text-resource"
          }
          stroke="currentColor"
          opacity={0.75}
        />
      ))}

      {layout.caps.map((c, i) => (
        <g key={c.id} className="node-in" style={{ animationDelay: `${i * 60}ms` }}>
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            rx={14}
            className="fill-secondary/50 stroke-capability/60"
            strokeWidth={1.2}
          />
          <text
            x={c.x + 16}
            y={c.y + 25}
            className="fill-capability text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {c.label}
          </text>
          {c.count === 0 && (
            <text
              x={c.x + 16}
              y={c.y + 52}
              className="fill-muted-foreground text-[11px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              no activities yet
            </text>
          )}
        </g>
      ))}

      {layout.acts.map((a, i) => (
        <g key={a.id} className="node-in" style={{ animationDelay: `${100 + i * 50}ms` }}>
          <rect
            x={a.x}
            y={a.y}
            width={a.w}
            height={a.h}
            rx={10}
            className="fill-card stroke-activity/70"
            strokeWidth={1.3}
          />
          <rect x={a.x} y={a.y + 8} width={3} height={a.h - 16} rx={2} className="fill-activity" />
          <text
            x={a.x + 16}
            y={a.y + 20}
            className="fill-foreground text-[12px] font-medium"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {clamp(a.label, 26)}
          </text>
          <text
            x={a.x + 16}
            y={a.y + 35}
            className="fill-muted-foreground text-[10px]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            activity
          </text>
        </g>
      ))}

      {layout.resources.map((r, i) => (
        <g key={r.id} className="node-in" style={{ animationDelay: `${160 + i * 50}ms` }}>
          <rect
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={19}
            className="fill-card stroke-resource/70"
            strokeWidth={1.3}
          />
          <circle cx={r.x + 18} cy={r.y + r.h / 2} r={4} className="fill-resource" />
          <text
            x={r.x + 32}
            y={r.y + 23}
            className="fill-foreground text-[11px]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {clamp(r.label, 18)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(36, Math.abs(x2 - x1) / 1.6);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function clamp(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
