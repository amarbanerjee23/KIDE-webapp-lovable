import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIMARY_ITEMS = [
  { to: "/overview", label: "Overview" },
  { to: "/projects", label: "Projects" },
  { to: "/workbench", label: "Workbench" },
  { to: "/models", label: "Model languages" },
  { to: "/designer", label: "Activity designer" },
  { to: "/catalogue", label: "Catalogue" },
  { to: "/synthesis", label: "Synthesis" },
  { to: "/release", label: "Release" },
] as const;

const SECONDARY_ITEMS = [
  { to: "/qualification", label: "Qualification" },
  { to: "/trust", label: "Trust centre" },
  { to: "/reviews", label: "Reviews" },
  { to: "/checkpoints", label: "Checkpoints" },
  { to: "/team", label: "Team" },
  { to: "/billing", label: "Billing" },
] as const;

/** Shared top bar so every authenticated workspace page offers the same navigation. */
export function WorkspaceHeader({ current }: { current?: string }) {
  const secondaryActive = SECONDARY_ITEMS.some((item) => item.label === current);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <Link to="/overview" className="flex shrink-0 items-center gap-2">
        <img src="/favicon.png" alt="" className="size-8" />
        <span className="hidden text-sm font-semibold sm:inline">KIDE</span>
      </Link>

      <nav
        aria-label="Primary workspace navigation"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {PRIMARY_ITEMS.map((item) => (
          <Button
            key={item.to}
            asChild
            variant={current === item.label ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 text-xs"
          >
            <Link to={item.to}>{item.label}</Link>
          </Button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={secondaryActive ? "secondary" : "ghost"}
              size="sm"
              className="shrink-0 text-xs"
              aria-label="More workspace destinations"
            >
              <MoreHorizontal className="size-4" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Governance &amp; workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SECONDARY_ITEMS.map((item) => (
              <DropdownMenuItem key={item.to} asChild>
                <Link to={item.to} className={current === item.label ? "bg-accent" : ""}>
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="hidden text-xs md:inline-flex">
          <Link to="/notifications">Notifications</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-xs">
          <Link to="/profile">Profile</Link>
        </Button>
      </div>
    </header>
  );
}
