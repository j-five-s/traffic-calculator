import type { Broker, Database, HttpMethod, Logic, Outgoing, Project } from "./types";

type Source = { logicId: string; perHour: number };

type Rw = { readsPerHour: number; writesPerHour: number };

export type DbLoad = Rw & {
  /** Collection id. */
  key: string;
  database: Database;
  collection: string;
  /** Which logic blocks cause this load. */
  sources: (Rw & { logicId: string })[];
  /** How this collection's load splits over the database's replicas. */
  replicas: (Rw & { replicaId: string })[];
};

export type ReplicaLoad = Rw & {
  /** Replica id. */
  key: string;
  database: Database;
  replica: string;
  primary: boolean;
};

export type HttpLoad = {
  key: string;
  method: HttpMethod;
  target: string;
  callsPerHour: number;
  sources: Source[];
};

export type PublishLoad = {
  key: string;
  broker: Broker;
  destination: string;
  messagesPerHour: number;
  sources: Source[];
};

export type Totals = {
  readsPerHour: number;
  writesPerHour: number;
  httpPerHour: number;
  messagesPerHour: number;
};

export type EntryLoad = Totals & { entryId: string; callsPerHour: number };
export type LogicLoad = Totals & {
  logicId: string;
  runsPerHour: number;
  usedBy: number;
  /** Runs in progress at the same time on average: runs per second × duration. */
  concurrent: number;
};

export type TrafficResult = {
  entries: Map<string, EntryLoad>;
  logic: Map<string, LogicLoad>;
  databases: DbLoad[];
  replicas: ReplicaLoad[];
  /** DB calls whose database, replica or collection is missing; they are not counted. */
  incompleteDbCalls: number;
  http: HttpLoad[];
  publishes: PublishLoad[];
  totals: Totals & { callsPerHour: number };
};

function safe(n: number) {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function zero(): Totals {
  return { readsPerHour: 0, writesPerHour: 0, httpPerHour: 0, messagesPerHour: 0 };
}

function add(into: Totals, from: Totals, times = 1) {
  into.readsPerHour += from.readsPerHour * times;
  into.writesPerHour += from.writesPerHour * times;
  into.httpPerHour += from.httpPerHour * times;
  into.messagesPerHour += from.messagesPerHour * times;
}

/** How many times one run makes this call, after its ± % adjustment. */
export function effectiveCount(o: Outgoing) {
  const factor = 1 + (Number.isFinite(o.adjust) ? o.adjust : 0) / 100;
  return safe(o.count) * Math.max(0, factor);
}

/** What one run of a logic block does. */
function perRun(logic: Logic, dbById: Map<string, Database>): Totals {
  const t = zero();
  for (const o of logic.outgoing) {
    const n = effectiveCount(o);
    if ((o.kind === "read" || o.kind === "write") && !isComplete(o, dbById)) continue;
    if (o.kind === "read") t.readsPerHour += n;
    else if (o.kind === "write") t.writesPerHour += n;
    else if (o.kind === "http") t.httpPerHour += n;
    else t.messagesPerHour += n;
  }
  return t;
}

function isComplete(o: { databaseId: string; replicaId: string; collectionId: string }, dbById: Map<string, Database>) {
  const db = dbById.get(o.databaseId);
  return !!db && db.replicas.some((r) => r.id === o.replicaId) && db.collections.some((c) => c.id === o.collectionId);
}

function getOrCreate<T>(map: Map<string, T>, key: string, create: () => T): T {
  let v = map.get(key);
  if (!v) {
    v = create();
    map.set(key, v);
  }
  return v;
}

function addSource(sources: Source[], logicId: string, amount: number) {
  const s = sources.find((x) => x.logicId === logicId);
  if (s) s.perHour += amount;
  else sources.push({ logicId, perHour: amount });
}

const byLoad = <T>(f: (x: T) => number) => (a: T, b: T) => f(b) - f(a);

export function calculate(project: Project): TrafficResult {
  const logicById = new Map(project.logic.map((l) => [l.id, l]));
  const dbById = new Map(project.databases.map((d) => [d.id, d]));
  const runs = new Map<string, number>();
  const usedBy = new Map<string, Set<string>>();

  // 1. Entry points → how many times each logic block runs per hour.
  const entries = new Map<string, EntryLoad>();
  const totals = { callsPerHour: 0, ...zero() };
  for (const entry of project.entries) {
    const calls = safe(entry.callsPerHour);
    const load: EntryLoad = { entryId: entry.id, callsPerHour: calls, ...zero() };
    const logic = logicById.get(entry.logicId);
    if (logic) {
      runs.set(logic.id, (runs.get(logic.id) ?? 0) + calls);
      getOrCreate(usedBy, logic.id, () => new Set()).add(entry.id);
      add(load, perRun(logic, dbById), calls);
    }
    totals.callsPerHour += calls;
    entries.set(entry.id, load);
  }

  // 2. Logic runs → outgoing load.
  const logic = new Map<string, LogicLoad>();
  const dbs = new Map<string, DbLoad>();
  const reps = new Map<string, ReplicaLoad>();
  let incompleteDbCalls = 0;
  const http = new Map<string, HttpLoad>();
  const pubs = new Map<string, PublishLoad>();

  for (const l of project.logic) {
    const r = runs.get(l.id) ?? 0;
    const load: LogicLoad = {
      logicId: l.id,
      runsPerHour: r,
      usedBy: usedBy.get(l.id)?.size ?? 0,
      concurrent: (r / 3600) * (safe(l.durationMs) / 1000),
      ...zero(),
    };
    add(load, perRun(l, dbById), r);
    add(totals, load);
    logic.set(l.id, load);

    for (const o of l.outgoing) {
      const amount = r * effectiveCount(o);
      if (o.kind === "read" || o.kind === "write") {
        const db = dbById.get(o.databaseId);
        const replica = db?.replicas.find((x) => x.id === o.replicaId);
        const col = db?.collections.find((x) => x.id === o.collectionId);
        if (!db || !replica || !col) {
          incompleteDbCalls++;
          continue;
        }
        const field = o.kind === "read" ? "readsPerHour" : "writesPerHour";
        const d = getOrCreate(dbs, col.id, () => ({
          key: col.id,
          database: db,
          collection: col.name,
          readsPerHour: 0,
          writesPerHour: 0,
          sources: [],
          replicas: [],
        }));
        d[field] += amount;
        let s = d.sources.find((x) => x.logicId === l.id);
        if (!s) d.sources.push((s = { logicId: l.id, readsPerHour: 0, writesPerHour: 0 }));
        s[field] += amount;
        let dr = d.replicas.find((x) => x.replicaId === replica.id);
        if (!dr) d.replicas.push((dr = { replicaId: replica.id, readsPerHour: 0, writesPerHour: 0 }));
        dr[field] += amount;
        const rl = getOrCreate(reps, replica.id, () => ({
          key: replica.id,
          database: db,
          replica: replica.name,
          primary: replica.role === "primary",
          readsPerHour: 0,
          writesPerHour: 0,
        }));
        rl[field] += amount;
      } else if (o.kind === "http") {
        const target = o.target.trim();
        const key = `${o.method} ${target}`;
        const h = getOrCreate(http, key, () => ({ key, method: o.method, target, callsPerHour: 0, sources: [] }));
        h.callsPerHour += amount;
        addSource(h.sources, l.id, amount);
      } else if (o.kind === "publish") {
        const destination = o.destination.trim();
        const key = `${o.broker}|${destination}`;
        const p = getOrCreate(pubs, key, () => ({ key, broker: o.broker, destination, messagesPerHour: 0, sources: [] }));
        p.messagesPerHour += amount;
        addSource(p.sources, l.id, amount);
      }
    }
  }

  const databases = [...dbs.values()].sort(byLoad((d) => d.readsPerHour + d.writesPerHour));
  for (const d of databases) {
    d.sources.sort(byLoad((s) => s.readsPerHour + s.writesPerHour));
    d.replicas.sort(byLoad((s) => s.readsPerHour + s.writesPerHour));
  }
  const replicas = [...reps.values()].sort(byLoad((r) => r.readsPerHour + r.writesPerHour));
  const httpList = [...http.values()].sort(byLoad((h) => h.callsPerHour));
  const pubList = [...pubs.values()].sort(byLoad((p) => p.messagesPerHour));
  for (const x of [...httpList, ...pubList]) x.sources.sort(byLoad((s) => s.perHour));

  return { entries, logic, databases, replicas, incompleteDbCalls, http: httpList, publishes: pubList, totals };
}

export type TimeUnit = "second" | "minute" | "hour" | "day" | "month";

export const TIME_UNITS: { value: TimeUnit; label: string; short: string; factor: number }[] = [
  { value: "second", label: "Per second", short: "/s", factor: 1 / 3600 },
  { value: "minute", label: "Per minute", short: "/min", factor: 1 / 60 },
  { value: "hour", label: "Per hour", short: "/h", factor: 1 },
  { value: "day", label: "Per day", short: "/day", factor: 24 },
  { value: "month", label: "Per month (30 days)", short: "/mo", factor: 24 * 30 },
];
