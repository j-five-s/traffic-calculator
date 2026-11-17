"use client";

import { FolderPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { addProject, useWorkspace } from "@/lib/traffic/store";
import { Calculator, Loading } from "./calculator";
import { DialogsProvider, useDialogs } from "./dialogs";
import { ProjectsSidebar } from "./projects-sidebar";

/** Projects sidebar on the left; the calculator for the active project on the right. */
export function AppShell() {
  return (
    <DialogsProvider>
      <SidebarProvider>
        <ProjectsSidebar />
        <SidebarInset className="bg-page">
          <Main />
        </SidebarInset>
      </SidebarProvider>
    </DialogsProvider>
  );
}

function Main() {
  const ws = useWorkspace();
  const active = ws?.projects.find((p) => p.id === ws.activeId);

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-page/90 px-4 backdrop-blur sm:px-6">
        <SidebarTrigger className="-ml-1.5" />
        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
        <h1 className="truncate font-heading text-sm font-semibold">
          {ws ? (active?.name ?? "No project selected") : " "}
        </h1>
      </header>
      <div className="flex flex-1 flex-col pt-6">
        {!ws ? <Loading /> : active ? <Calculator key={active.id} /> : <NoProject hasProjects={ws.projects.length > 0} />}
      </div>
    </>
  );
}

function NoProject({ hasProjects }: { hasProjects: boolean }) {
  const { ask } = useDialogs();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h2 className="font-heading text-lg font-semibold">
        {hasProjects ? "Pick a project" : "Create your first project"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {hasProjects
          ? "Choose a project in the sidebar to see its calculator, or start a new one."
          : "A project holds its own databases, logic and entry points. Start empty or from the example."}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button
          onClick={async () => {
            const name = await ask({
              title: "New project",
              label: "Project name",
              placeholder: "Checkout service",
              action: "Create",
            });
            if (name) addProject(name);
          }}
        >
          <FolderPlus /> New project
        </Button>
        <Button variant="outline" onClick={() => addProject("Example", true)}>
          <Sparkles /> Start from example
        </Button>
      </div>
    </div>
  );
}
