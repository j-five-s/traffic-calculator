"use client";

import { useSyncExternalStore } from "react";
import type { Database, DbEngine, DbOutgoing, EntryPoint, Logic, Outgoing, Project } from "./types";
import { BROKERS, DB_ENGINES, HTTP_METHODS, RATE_UNITS } from "./types";

const STORAGE_KEY = "traffic-calculator:project:v3";
const LEGACY_KEYS = ["traffic-calculator:project:v2", "traffic-calculator:project:v1"];

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function sampleProject(): Project {
  const main: Database = {
    id: "db-main",
    name: "main",
    engine: "mongodb",
    replicas: [
      { id: "r-main-primary", name: "primary", role: "primary" },
      { id: "r-main-secondary", name: "secondary-1", role: "replica" },
    ],
    collections: [
      { id: "c-posts", name: "posts" },
      { id: "c-comments", name: "comments" },
      { id: "c-notifications", name: "notifications" },
    ],
  };
  const social: Database = {
    id: "db-social",
    name: "social",
    engine: "postgres",
    replicas: [
      { id: "r-social-primary", name: "primary", role: "primary" },
      { id: "r-social-read", name: "read-replica", role: "replica" },
    ],
    collections: [{ id: "c-followers", name: "followers" }],
  };
  const cache: Database = {
    id: "db-cache",
    name: "cache",
    engine: "redis",
    replicas: [{ id: "r-cache-primary", name: "primary", role: "primary" }],
    collections: [{ id: "c-post-keys", name: "post:*" }],
  };
  const op = (kind: "read" | "write", db: Database, replica: number, collectionId: string, count = 1, adjust = 0): DbOutgoing => ({
    id: newId(),
    kind,
    databaseId: db.id,
    replicaId: db.replicas[replica].id,
    collectionId,
    count,
    adjust,
  });

  const loadPost: Logic = {
    id: "l-load-posts",
    name: "Load posts",
    durationMs: 40,
    // Redis answers 80% of requests, so MongoDB and the cache refill see 80% less traffic.
    outgoing: [
      op("read", cache, 0, "c-post-keys"),
      op("read", main, 1, "c-posts", 1, -80),
      op("write", cache, 0, "c-post-keys", 1, -80),
    ],
  };
  const updatePost: Logic = {
    id: "l-update-post",
    name: "Update post",
    durationMs: 120,
    outgoing: [
      op("read", main, 0, "c-posts"),
      op("read", main, 0, "c-comments"),
      op("write", main, 0, "c-posts"),
      op("write", cache, 0, "c-post-keys"),
      { id: newId(), kind: "publish", broker: "kafka", destination: "post.updated", count: 1, adjust: 0 },
    ],
  };
  const notify: Logic = {
    id: "l-notify-followers",
    name: "Notify followers",
    durationMs: 900,
    outgoing: [
      op("read", social, 1, "c-followers"),
      op("write", main, 0, "c-notifications", 20),
      { id: newId(), kind: "http", method: "POST", target: "push-service /send", count: 1, adjust: 0 },
    ],
  };
  return {
    version: 3,
    peakFactor: 3,
    databases: [main, social, cache],
    logic: [loadPost, updatePost, notify],
    entries: [
      {
        id: "e-list-posts",
        kind: "http",
        method: "GET",
        name: "/posts",
        callsPerHour: 10000,
        rateUnit: "hour",
        logicId: loadPost.id,
      },
      {
        id: "e-update-post",
        kind: "http",
        method: "PUT",
        name: "/posts/:id",
        callsPerHour: 500,
        rateUnit: "hour",
        logicId: updatePost.id,
      },
      {
        id: "e-post-updated",
        kind: "kafka",
        method: "GET",
        name: "post.updated",
        callsPerHour: 500,
        rateUnit: "hour",
        logicId: notify.id,
      },
    ],
  };
}

export function emptyEntry(kind: EntryPoint["kind"] = "http"): EntryPoint {
  return {
    id: newId(),
    kind,
    method: "GET",
    name: kind === "http" ? "/" : "",
    callsPerHour: 1000,
    rateUnit: "hour",
    logicId: "",
  };
}

export function emptyLogic(name = ""): Logic {
  return { id: newId(), name, durationMs: 0, outgoing: [] };
}

export function emptyDatabase(engine: DbEngine = "mongodb"): Database {
  return { id: newId(), name: "", engine, replicas: [{ id: newId(), name: "primary", role: "primary" }], collections: [] };
}

/** The replica a new read or write should go to by default: the primary, or the first one. */
export function defaultReplicaId(db: Database | undefined) {
  return (db?.replicas.find((r) => r.role === "primary") ?? db?.replicas[0])?.id ?? "";
}

function num(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pick<T extends string>(options: readonly T[], v: unknown, fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function parseEntry(e: Obj): EntryPoint {
  return {
    id: str(e.id) || newId(),
    kind: e.kind === "rabbitmq" || e.kind === "kafka" ? e.kind : "http",
    method: pick(HTTP_METHODS, e.method, "GET"),
    name: str(e.name),
    callsPerHour: num(e.callsPerHour),
    rateUnit: pick(RATE_UNITS, e.rateUnit, "hour"),
    // Older files allowed a list of logic blocks per entry point; keep the first.
    logicId: str(e.logicId) || str(list(e.uses)[0]?.logicId),
  };
}

/** Parses an outgoing call. `resolveDb` turns an older name-based DB call into ids. */
type DbRef = Omit<DbOutgoing, "id" | "kind" | "count" | "adjust">;

function parseOutgoing(o: Obj, resolveDb?: (o: Obj) => DbRef): Outgoing {
  const id = str(o.id) || newId();
  const count = num(o.count, 1);
  const raw = typeof o.adjust === "number" ? o.adjust : Number(o.adjust);
  const adjust = Number.isFinite(raw) ? Math.min(1000, Math.max(-100, raw)) : 0;
  if (o.kind === "http")
    return { id, kind: "http", method: pick(HTTP_METHODS, o.method, "GET"), target: str(o.target), count, adjust };
  if (o.kind === "publish")
    return { id, kind: "publish", broker: pick(BROKERS, o.broker, "kafka"), destination: str(o.destination), count, adjust };
  const ref = resolveDb
    ? resolveDb(o)
    : { databaseId: str(o.databaseId), replicaId: str(o.replicaId), collectionId: str(o.collectionId) };
  return { id, kind: o.kind === "write" ? "write" : "read", ...ref, count, adjust };
}

/**
 * Parses a logic block's outgoing calls. An earlier build had separate "Traffic %" steps that
 * scaled every call after them; fold each one into those calls' own ± % so totals stay the same.
 */
function parseSteps(raw: unknown, resolveDb?: (o: Obj) => DbRef): Outgoing[] {
  const out: Outgoing[] = [];
  let share = 1;
  for (const o of list(raw)) {
    if (o.kind === "share") {
      share *= num(o.percent, 100) / 100;
      continue;
    }
    const step = parseOutgoing(o, resolveDb);
    if (share !== 1) step.adjust = Math.round(((1 + step.adjust / 100) * share - 1) * 1000) / 10;
    out.push(step);
  }
  return out;
}

/** Version 1: each entry point held its own operations, publishes linked to other entry points. */
function migrateV1(r: Obj): Obj {
  const raw = list(r.entries);
  const logic: Obj[] = [];
  const entries = raw.map((e) => {
    const ops = list(e.operations);
    const base = { ...e, uses: [] as Obj[] };
    if (ops.length === 0) return base;
    const id = newId();
    logic.push({
      id,
      name: e.kind === "http" || !e.kind ? `${str(e.method) || "GET"} ${str(e.name)}` : str(e.name) || "Consumer",
      outgoing: ops.map((o) => {
        if (o.kind !== "publish") return { ...o, engine: "mongodb" };
        const target = raw.find((x) => x.id === o.targetId);
        return { id: o.id, kind: "publish", broker: target?.kind === "rabbitmq" ? "rabbitmq" : "kafka", destination: str(target?.name), count: o.count };
      }),
    });
    return { ...base, uses: [{ id: newId(), logicId: id, count: 1 }] };
  });
  return { ...r, version: 2, entries, logic };
}

/** Version 2: DB calls named their engine, database and collection as free text. */
function migrateV2(r: Obj): Project {
  const databases: Database[] = [];
  const resolveDb = (o: Obj): DbRef => {
    const engine = pick(DB_ENGINES, o.engine, "mongodb");
    const name = str(o.database).trim() || "main";
    let db = databases.find((d) => d.engine === engine && d.name === name);
    if (!db) {
      db = { ...emptyDatabase(engine), name };
      databases.push(db);
    }
    const colName = str(o.collection).trim() || "(unnamed)";
    let col = db.collections.find((c) => c.name === colName);
    if (!col) {
      col = { id: newId(), name: colName };
      db.collections.push(col);
    }
    return { databaseId: db.id, replicaId: db.replicas[0].id, collectionId: col.id };
  };
  const logic: Logic[] = list(r.logic).map((l) => ({
    id: str(l.id) || newId(),
    name: str(l.name),
    durationMs: num(l.durationMs),
    outgoing: parseSteps(l.outgoing, resolveDb),
  }));
  return { version: 3, entries: list(r.entries).map(parseEntry), logic, databases, peakFactor: num(r.peakFactor, 1) || 1 };
}

/** Validates data from storage or an imported file, upgrading older formats. Throws on anything unusable. */
export function parseProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object") throw new Error("Not a project file.");
  let r = raw as Obj;
  if (!Array.isArray(r.entries)) throw new Error('The file has no "entries" list.');
  if (r.version === 1 || !Array.isArray(r.logic)) r = migrateV1(r);
  if (r.version === 2 || !Array.isArray(r.databases)) return migrateV2(r);

  const databases: Database[] = list(r.databases).map((d) => ({
    id: str(d.id) || newId(),
    name: str(d.name),
    engine: pick(DB_ENGINES, d.engine, "mongodb"),
    replicas: list(d.replicas).map((x) => ({
      id: str(x.id) || newId(),
      name: str(x.name),
      role: x.role === "primary" ? "primary" : "replica",
    })),
    collections: list(d.collections).map((c) => ({ id: str(c.id) || newId(), name: str(c.name) })),
  }));
  const logic: Logic[] = list(r.logic).map((l) => ({
    id: str(l.id) || newId(),
    name: str(l.name),
    durationMs: num(l.durationMs),
    outgoing: parseSteps(l.outgoing),
  }));
  return { version: 3, entries: list(r.entries).map(parseEntry), logic, databases, peakFactor: num(r.peakFactor, 1) || 1 };
}

// ---------------------------------------------------------------------------
// Workspace: several named projects, one of them active, saved in localStorage.
// A tiny external store so every component reads the same state, and the server
// render (no localStorage) cleanly shows a loading state instead of mismatching
// on hydration.
// ---------------------------------------------------------------------------

const WORKSPACE_KEY = "traffic-calculator:workspace:v1";

export type ProjectEntry = { id: string; name: string; project: Project };
export type Workspace = { version: 1; activeId: string | null; projects: ProjectEntry[] };

let current: Workspace | null = null;
const listeners = new Set<() => void>();

function parseWorkspace(raw: unknown): Workspace {
  const r = raw as Obj;
  const projects: ProjectEntry[] = list(r?.projects).flatMap((p) => {
    try {
      return [{ id: str(p.id) || newId(), name: str(p.name) || "Untitled project", project: parseProject(p.project) }];
    } catch {
      return [];
    }
  });
  const activeId = projects.some((p) => p.id === r?.activeId) ? str(r.activeId) : (projects[0]?.id ?? null);
  return { version: 1, activeId, projects };
}

function load(): Workspace {
  try {
    const saved = window.localStorage.getItem(WORKSPACE_KEY);
    if (saved) return parseWorkspace(JSON.parse(saved));
  } catch {
    // Unreadable: fall through.
  }
  // First run with workspaces: bring over the single project saved by earlier versions.
  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const entry = { id: newId(), name: "My project", project: parseProject(JSON.parse(saved)) };
        return { version: 1, activeId: entry.id, projects: [entry] };
      }
    } catch {
      // Try the next one.
    }
  }
  const example = { id: newId(), name: "Example", project: sampleProject() };
  return { version: 1, activeId: example.id, projects: [example] };
}

function getSnapshot(): Workspace {
  if (!current) current = load();
  return current;
}

function getServerSnapshot(): Workspace | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== WORKSPACE_KEY) return;
    current = load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setWorkspace(next: Workspace) {
  current = next;
  try {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
  for (const l of listeners) l();
}

export function useWorkspace(): Workspace | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The active project, or null while loading or when no project is selected. */
export function useProject(): Project | null {
  const ws = useWorkspace();
  return ws?.projects.find((p) => p.id === ws.activeId)?.project ?? null;
}

/** Updates the active project. Does nothing when no project is active. */
export function setProject(update: Project | ((prev: Project) => Project)) {
  const ws = getSnapshot();
  const entry = ws.projects.find((p) => p.id === ws.activeId);
  if (!entry) return;
  const project = typeof update === "function" ? update(entry.project) : update;
  setWorkspace({ ...ws, projects: ws.projects.map((p) => (p.id === entry.id ? { ...p, project } : p)) });
}

function emptyProject(): Project {
  return { version: 3, entries: [], logic: [], databases: [], peakFactor: 3 };
}

/** Adds a project (empty, or the example) and makes it active. Returns its id. */
export function addProject(name: string, withExample = false): string {
  const ws = getSnapshot();
  const entry = { id: newId(), name, project: withExample ? sampleProject() : emptyProject() };
  setWorkspace({ ...ws, activeId: entry.id, projects: [...ws.projects, entry] });
  return entry.id;
}

export function selectProject(id: string) {
  const ws = getSnapshot();
  if (ws.projects.some((p) => p.id === id)) setWorkspace({ ...ws, activeId: id });
}

export function renameProject(id: string, name: string) {
  const ws = getSnapshot();
  setWorkspace({ ...ws, projects: ws.projects.map((p) => (p.id === id ? { ...p, name } : p)) });
}

/** Copies a project right after the original and makes the copy active. */
export function cloneProject(id: string): string | null {
  const ws = getSnapshot();
  const i = ws.projects.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const src = ws.projects[i];
  const copy = { id: newId(), name: `${src.name} (copy)`, project: structuredClone(src.project) };
  const projects = [...ws.projects];
  projects.splice(i + 1, 0, copy);
  setWorkspace({ ...ws, activeId: copy.id, projects });
  return copy.id;
}

/** Deletes a project. If it was active, nothing is active afterwards. */
export function deleteProject(id: string) {
  const ws = getSnapshot();
  setWorkspace({
    ...ws,
    activeId: ws.activeId === id ? null : ws.activeId,
    projects: ws.projects.filter((p) => p.id !== id),
  });
}
