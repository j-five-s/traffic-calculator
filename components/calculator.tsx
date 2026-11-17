"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Download, Plus, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculate } from "@/lib/traffic/calc";
import {
  emptyDatabase,
  emptyEntry,
  emptyLogic,
  newId,
  parseProject,
  sampleProject,
  setProject,
  useProject,
} from "@/lib/traffic/store";
import type { Database, EntryKind, EntryPoint, Logic, Project } from "@/lib/traffic/types";
import { DatabaseCard } from "./database-card";
import { useDialogs } from "./dialogs";
import { EntryCard } from "./entry-card";
import { LogicCard } from "./logic-card";
import { Results } from "./results";
import { databaseLabel, KIND_META, logicLabel } from "./ui";

type Tab = "entries" | "logic" | "databases";
const TABS: Tab[] = ["entries", "logic", "databases"];

/** The calculator for the active project. Rendered only when a project is active. */
export function Calculator() {
  const project = useProject();
  if (!project) return <Loading />;
  return <Editor project={project} />;
}

const addButton = "h-11 w-full border-dashed text-muted-foreground hover:text-foreground";

/** Focus the first input of a freshly added card once it has rendered. */
function focusCard(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  });
}

function Editor({ project }: { project: Project }) {
  const { confirm } = useDialogs();
  const result = useMemo(() => calculate(project), [project]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Ids of collapsed cards (entry points, logic blocks, databases). Not saved: every visit starts expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapseProps = (id: string) => ({
    collapsed: collapsed.has(id),
    onCollapsedChange: (c: boolean) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (c) next.add(id);
        else next.delete(id);
        return next;
      }),
  });
  // Editor only mounts in the browser (the store has no server snapshot), so reading the hash here is safe.
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return TABS.includes(h) ? h : "entries";
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "entries" ? window.location.pathname + window.location.search : `#${t}`);
  };

  const suggestions = useMemo(() => {
    const s = { targets: new Set<string>(), destinations: new Set<string>() };
    for (const l of project.logic)
      for (const o of l.outgoing) {
        if (o.kind === "http") {
          if (o.target.trim()) s.targets.add(o.target.trim());
        } else if (o.kind === "publish") {
          if (o.destination.trim()) s.destinations.add(o.destination.trim());
        }
      }
    for (const e of project.entries) if (e.kind !== "http" && e.name.trim()) s.destinations.add(e.name.trim());
    const sorted = (x: Set<string>) => [...x].sort();
    return { "http-targets": sorted(s.targets), destinations: sorted(s.destinations) };
  }, [project]);

  // Entry points
  const updateEntry = (next: EntryPoint) =>
    setProject((p) => ({ ...p, entries: p.entries.map((e) => (e.id === next.id ? next : e)) }));
  const addEntry = (kind: EntryKind) => {
    const entry = emptyEntry(kind);
    setProject((p) => ({ ...p, entries: [...p.entries, entry] }));
    focusCard(entry.id);
  };
  const removeEntry = (id: string) => setProject((p) => ({ ...p, entries: p.entries.filter((e) => e.id !== id) }));

  // Logic
  const updateLogic = (next: Logic) =>
    setProject((p) => ({ ...p, logic: p.logic.map((l) => (l.id === next.id ? next : l)) }));
  const addLogic = (name = "") => {
    const logic = emptyLogic(name);
    setProject((p) => ({ ...p, logic: [...p.logic, logic] }));
    setTab("logic");
    focusCard(logic.id);
    return logic.id;
  };
  const removeLogic = async (l: Logic) => {
    const users = project.entries.filter((e) => e.logicId === l.id).length;
    if (
      users &&
      !(await confirm({
        title: `Delete "${logicLabel(l)}"?`,
        description: `It is used by ${users} entry point${users === 1 ? "" : "s"}. They will need another logic.`,
        action: "Delete",
        destructive: true,
      }))
    )
      return;
    setProject((p) => ({
      ...p,
      logic: p.logic.filter((x) => x.id !== l.id),
      entries: p.entries.map((e) => (e.logicId === l.id ? { ...e, logicId: "" } : e)),
    }));
  };

  // Databases
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id: string) => m.set(id, (m.get(id) ?? 0) + 1);
    for (const l of project.logic)
      for (const o of l.outgoing)
        if (o.kind === "read" || o.kind === "write") {
          bump(o.databaseId);
          bump(o.replicaId);
          bump(o.collectionId);
        }
    return m;
  }, [project]);
  const updateDatabase = (next: Database) =>
    setProject((p) => ({ ...p, databases: p.databases.map((d) => (d.id === next.id ? next : d)) }));
  const addDatabase = () => {
    const db = emptyDatabase();
    setProject((p) => ({ ...p, databases: [...p.databases, db] }));
    setTab("databases");
    focusCard(db.id);
  };
  const removeDatabase = async (db: Database) => {
    const n = usage.get(db.id) ?? 0;
    if (
      n &&
      !(await confirm({
        title: `Delete "${databaseLabel(db)}"?`,
        description: `It is used by ${n} DB call${n === 1 ? "" : "s"} in your logic. Those calls will need a new database.`,
        action: "Delete",
        destructive: true,
      }))
    )
      return;
    setProject((p) => ({ ...p, databases: p.databases.filter((d) => d.id !== db.id) }));
  };
  const addCollection = (databaseId: string, name: string) => {
    const id = newId();
    setProject((p) => ({
      ...p,
      databases: p.databases.map((d) =>
        d.id === databaseId ? { ...d, collections: [...d.collections, { id, name }] } : d,
      ),
    }));
    return id;
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "traffic-model.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      setProject(parseProject(JSON.parse(await file.text())));
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const reset = async () => {
    if (
      await confirm({
        title: "Replace this project with the example?",
        description: "This project's entry points, logic and databases are replaced. Clone or export it first to keep them.",
        action: "Replace",
        destructive: true,
      })
    )
      setProject(sampleProject());
  };

  const idsOnTab: Record<Tab, string[]> = {
    entries: project.entries.map((e) => e.id),
    logic: project.logic.map((l) => l.id),
    databases: project.databases.map((d) => d.id),
  };
  const tabIds = idsOnTab[tab];
  const allCollapsed = tabIds.length > 0 && tabIds.every((id) => collapsed.has(id));
  const toggleAll = () =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of tabIds) {
        if (allCollapsed) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "entries", label: "Entry points", count: project.entries.length },
    { id: "logic", label: "Logic", count: project.logic.length },
    { id: "databases", label: "Databases", count: project.databases.length },
  ];

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-8">
      {Object.entries(suggestions).map(([id, values]) => (
        <datalist key={id} id={id}>
          {values.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      ))}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 px-3">
                {t.label}
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">
                  {t.count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={toggleAll} disabled={tabIds.length === 0}>
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
              {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Download /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw /> Reset
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {importError && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Import failed</AlertTitle>
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        )}

        <TabsContent value="entries" className="flex flex-col gap-3">
          {project.entries.map((entry) => (
            <div key={entry.id} data-card-id={entry.id}>
              <EntryCard
                {...collapseProps(entry.id)}
                entry={entry}
                logic={project.logic}
                onChange={updateEntry}
                onRemove={() => removeEntry(entry.id)}
                onNewLogic={addLogic}
              />
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND_META) as EntryKind[]).map((kind) => (
              <Button key={kind} variant="outline" className={addButton} onClick={() => addEntry(kind)}>
                <Plus /> {kind === "http" ? "HTTP route" : KIND_META[kind].label}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logic" className="flex flex-col gap-3">
          {project.logic.map((l) => (
            <div key={l.id} data-card-id={l.id}>
              <LogicCard
                {...collapseProps(l.id)}
                logic={l}
                load={result.logic.get(l.id)}
                databases={project.databases}
                onChange={updateLogic}
                onRemove={() => removeLogic(l)}
                onNewDatabase={addDatabase}
                onNewCollection={addCollection}
              />
            </div>
          ))}
          <Button variant="outline" className={addButton} onClick={() => addLogic()}>
            <Plus /> Logic block
          </Button>
        </TabsContent>

        <TabsContent value="databases" className="flex flex-col gap-3">
          {project.databases.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No databases yet. Add the ones your services talk to, with their replicas and collections or tables.
            </p>
          )}
          {project.databases.map((d) => (
            <div key={d.id} data-card-id={d.id}>
              <DatabaseCard
                {...collapseProps(d.id)}
                database={d}
                usage={usage}
                onChange={updateDatabase}
                onRemove={() => removeDatabase(d)}
              />
            </div>
          ))}
          <Button variant="outline" className={addButton} onClick={addDatabase}>
            <Plus /> Database
          </Button>
        </TabsContent>
      </Tabs>

      <aside
        aria-label="Calculated load"
        className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto"
      >
        <Results
          result={result}
          entries={project.entries}
          logic={project.logic}
          peakFactor={project.peakFactor}
          onPeakFactorChange={(n) => setProject((p) => ({ ...p, peakFactor: n }))}
        />
      </aside>
    </div>
  );
}

export function Loading() {
  return (
    <div
      aria-busy
      className="mx-auto grid w-full max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-80" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
