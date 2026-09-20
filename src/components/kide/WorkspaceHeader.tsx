import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Shared top bar so every workspace page offers the same navigation. */
export function WorkspaceHeader({ current }: { current?: string }) {
  const items = [
    { to: "/projects", label: "Projects" },
    { to: "/", label: "Workbench" },
    { to: "/models", label: "Model languages" },
    { to: "/designer", label: "Activity designer" },
    { to: "/catalogue", label: "Catalogue" },
    { to: "/synthesis", label: "Synthesis" },
    { to: "/qualification", label: "Qualification" },
    { to: "/trust", label: "Trust centre" },
    { to: "/release", label: "Release" },
    { to: "/reviews", label: "Reviews" },
    { to: "/checkpoints", label: "Checkpoints" },
    { to: "/team", label: "Team" },
    { to: "/billing", label: "Billing" },
  ] as const;

  return (
    <header className="flex h-14 shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card px-3">
      <Link to="/" className="mr-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
          KI
        </span>
        <span className="text-sm font-semibold">KIDE</span>
      </Link>
      {items.map((item) => (
        <Button
          key={item.to}
          asChild
          variant={current === item.label ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
        >
          <Link to={item.to}>{item.label}</Link>
        </Button>
      ))}
      <div className="ml-auto flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/notifications">Notifications</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/profile">Profile</Link>
        </Button>
      </div>
    </header>
  );
}
