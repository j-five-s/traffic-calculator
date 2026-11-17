"use client";

import { Calculator, Copy, FolderPlus, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  addProject,
  cloneProject,
  deleteProject,
  renameProject,
  selectProject,
  useWorkspace,
  type ProjectEntry,
} from "@/lib/traffic/store";
import { Skeleton } from "@/components/ui/skeleton";
import { calculate } from "@/lib/traffic/calc";
import { formatExact, formatRate } from "@/lib/traffic/format";
import type { Project } from "@/lib/traffic/types";
import { useDialogs } from "./dialogs";

/** Hourly traffic of a project, for the second line under its name. */
function trafficPerHour(project: Project) {
  const r = calculate(project);
  const incomingHttp = project.entries.reduce((sum, e) => sum + (e.kind === "http" ? Math.max(0, e.callsPerHour) : 0), 0);
  return {
    db: r.totals.readsPerHour + r.totals.writesPerHour,
    reads: r.totals.readsPerHour,
    writes: r.totals.writesPerHour,
    http: incomingHttp,
    httpOut: r.totals.httpPerHour,
    msg: r.totals.messagesPerHour,
  };
}

/** Left sidebar: the list of projects, with add, select, rename, clone and delete. */
export function ProjectsSidebar() {
  const ws = useWorkspace();
  const { ask, confirm } = useDialogs();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const create = async () => {
    const name = await ask({ title: "New project", label: "Project name", placeholder: "Checkout service", action: "Create" });
    if (name) {
      addProject(name);
      closeOnMobile();
    }
  };

  const rename = async (p: ProjectEntry) => {
    const name = await ask({ title: "Rename project", label: "Project name", placeholder: p.name, action: "Rename" });
    if (name) renameProject(p.id, name);
  };

  const remove = async (p: ProjectEntry) => {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      description: "Its entry points, logic and databases are deleted. Export it first if you want to keep a copy.",
      action: "Delete",
      destructive: true,
    });
    if (ok) deleteProject(p.id);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Calculator className="size-4" />
          </span>
          <span className="font-heading text-sm font-semibold">Traffic calculator</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            Projects <span className="ml-1 font-normal text-muted-foreground">· traffic per hour</span>
          </SidebarGroupLabel>
          <SidebarGroupAction title="New project" onClick={create}>
            <Plus />
            <span className="sr-only">New project</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {!ws &&
                ["w-3/4", "w-1/2", "w-2/3"].map((w) => (
                  <SidebarMenuItem key={w} className="flex h-8 items-center px-2">
                    <Skeleton className={`h-4 ${w}`} />
                  </SidebarMenuItem>
                ))}
              {ws?.projects.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No projects yet.</p>
              )}
              {ws?.projects.map((p) => {
                const t = trafficPerHour(p.project);
                const details = [
                  p.name,
                  `DB: ${formatExact(t.db)}/h (${formatExact(t.reads)} reads, ${formatExact(t.writes)} writes)`,
                  `HTTP in: ${formatExact(t.http)}/h, out: ${formatExact(t.httpOut)}/h`,
                  `Messages published: ${formatExact(t.msg)}/h`,
                ].join("\n");
                return (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={p.id === ws.activeId}
                    onClick={() => {
                      selectProject(p.id);
                      closeOnMobile();
                    }}
                    title={details}
                    className="h-auto flex-col items-start gap-0.5 py-1.5"
                  >
                    <span className="w-full truncate pr-5">{p.name}</span>
                    <span className="flex w-full gap-2.5 font-mono text-[11px] font-normal text-muted-foreground tabular-nums">
                      <span>
                        <span className="text-read">DB</span> {formatRate(t.db)}
                      </span>
                      <span>
                        <span className="text-http">HTTP</span> {formatRate(t.http)}
                      </span>
                      <span>
                        <span className="text-rabbit">msg</span> {formatRate(t.msg)}
                      </span>
                    </span>
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`Actions for ${p.name}`}>
                        <MoreHorizontal />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-40">
                      <DropdownMenuItem onSelect={() => rename(p)}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          cloneProject(p.id);
                          closeOnMobile();
                        }}
                      >
                        <Copy /> Clone
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(p)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={create}>
              <FolderPlus /> New project
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                addProject("Example", true);
                closeOnMobile();
              }}
            >
              <Sparkles /> New from example
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
