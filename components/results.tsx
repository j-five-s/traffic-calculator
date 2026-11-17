"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIME_UNITS, type DbLoad, type ReplicaLoad, type TimeUnit, type TrafficResult } from "@/lib/traffic/calc";
import { formatExact, formatRate } from "@/lib/traffic/format";
import type { EntryPoint, Logic } from "@/lib/traffic/types";
import { cn } from "@/lib/utils";
import { BrandIcon } from "./brand-icon";
import { NumberField } from "./number-field";
import { BROKER_META, capitalize, databaseLabel, ENGINE_META, entryLabel, logicLabel } from "./ui";

type Props = {
  result: TrafficResult;
  entries: EntryPoint[];
  logic: Logic[];
  peakFactor: number;
  onPeakFactorChange: (n: number) => void;
};

export function Results({ result, entries, logic, peakFactor, onPeakFactorChange }: Props) {
  const [unit, setUnit] = useState<TimeUnit>("second");
  const [peak, setPeak] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const u = TIME_UNITS.find((t) => t.value === unit)!;
  const factor = u.factor * (peak ? peakFactor : 1);
  const v = (perHour: number) => perHour * factor;
  const logicById = new Map(logic.map((l) => [l.id, l]));

  // One row per database; its replicas and collections show when the row is expanded.
  const dbGroups = new Map<
    string,
    { database: DbLoad["database"]; reads: number; writes: number; replicas: ReplicaLoad[]; collections: DbLoad[] }
  >();
  const groupFor = (database: DbLoad["database"]) => {
    let g = dbGroups.get(database.id);
    if (!g) dbGroups.set(database.id, (g = { database, reads: 0, writes: 0, replicas: [], collections: [] }));
    return g;
  };
  for (const r of result.replicas) {
    const g = groupFor(r.database);
    g.reads += r.readsPerHour;
    g.writes += r.writesPerHour;
    g.replicas.push(r);
  }
  for (const c of result.databases) groupFor(c.database).collections.push(c);
  const databases = [...dbGroups.values()].sort((a, b) => b.reads + b.writes - (a.reads + a.writes));
  const maxDb = Math.max(1, ...databases.map((d) => d.reads + d.writes));

  // One row per broker (RabbitMQ, Kafka); its queues or topics show when expanded.
  const brokers = (["rabbitmq", "kafka"] as const)
    .map((broker) => {
      const destinations = result.publishes.filter((p) => p.broker === broker);
      return { broker, destinations, total: destinations.reduce((sum, p) => sum + p.messagesPerHour, 0) };
    })
    .filter((b) => b.destinations.length > 0)
    .sort((a, b) => b.total - a.total);

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const t = result.totals;
  const tiles = [
    { label: "Incoming", value: t.callsPerHour, tone: "text-foreground", span: "col-span-2" },
    { label: "DB reads", value: t.readsPerHour, tone: "text-read", span: "col-span-2" },
    { label: "DB writes", value: t.writesPerHour, tone: "text-write", span: "col-span-2" },
    { label: "Outgoing HTTP", value: t.httpPerHour, tone: "text-http", span: "col-span-3" },
    { label: "Messages published", value: t.messagesPerHour, tone: "text-rabbit", span: "col-span-3" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={unit}
          onValueChange={(val) => val && setUnit(val as TimeUnit)}
          aria-label="Time unit"
        >
          {TIME_UNITS.map((x) => (
            <ToggleGroupItem key={x.value} value={x.value} title={x.label} className="px-2.5 text-xs">
              {x.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={peak ? "peak" : "avg"}
          onValueChange={(val) => val && setPeak(val === "peak")}
          aria-label="Load level"
        >
          <ToggleGroupItem value="avg" className="px-2.5 text-xs">
            Average
          </ToggleGroupItem>
          <ToggleGroupItem value="peak" className="px-2.5 text-xs">
            Peak
          </ToggleGroupItem>
        </ToggleGroup>
        <InputGroup className="h-7 w-[4.5rem]" title="Peak = average × this number">
          <InputGroupAddon>
            <InputGroupText className="text-xs">×</InputGroupText>
          </InputGroupAddon>
          <NumberField
            grouped
            label="Peak multiplier"
            min={1}
            className="text-right font-mono text-xs tabular-nums"
            value={peakFactor}
            onChange={onPeakFactorChange}
          />
        </InputGroup>
      </div>

      {/* Totals */}
      <Card className="grid grid-cols-6 gap-px overflow-hidden bg-border py-0">
        {tiles.map((s) => (
          <div key={s.label} className={cn("bg-card px-3 py-2.5", s.span)}>
            <div className="truncate text-xs text-muted-foreground">{s.label}</div>
            <div
              className={cn(
                "mt-0.5 font-mono text-xl font-semibold tracking-tight tabular-nums",
                s.value ? s.tone : "text-muted-foreground",
              )}
              title={`${formatExact(v(s.value))} ${u.label.toLowerCase()}`}
            >
              {formatRate(v(s.value))}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">{u.short}</span>
            </div>
          </div>
        ))}
      </Card>

      {result.incompleteDbCalls > 0 && (
        <Alert>
          <TriangleAlert className="text-write" />
          <AlertDescription>
            {result.incompleteDbCalls} DB call{result.incompleteDbCalls === 1 ? " has" : "s have"} no database, replica or
            collection chosen and {result.incompleteDbCalls === 1 ? "is" : "are"} not counted. Check the Logic tab.
          </AlertDescription>
        </Alert>
      )}

      {/* Databases */}
      <Section title="Databases">
        {databases.length === 0 ? (
          <Empty>Add a DB read or write to a logic block to see database load.</Empty>
        ) : (
          <DataTable head={["Database", `Reads${u.short}`, `Writes${u.short}`]}>
            {databases.map((g) => {
              const key = `db:${g.database.id}`;
              const isOpen = open.has(key);
              const share = (g.reads + g.writes) / maxDb;
              return (
                <Fragment key={key}>
                  <TableRow>
                    <TableCell className="relative max-w-0 p-0">
                      <Expander open={isOpen} onClick={() => toggle(key)}>
                        <BrandIcon brand={g.database.engine} className="size-3.5" />
                        <span className="min-w-0 truncate font-mono text-[13px]">{databaseLabel(g.database)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {ENGINE_META[g.database.engine].label}
                        </span>
                      </Expander>
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-0 h-0.5 bg-primary/40"
                        style={{ width: `${share * 100}%` }}
                      />
                    </TableCell>
                    <Num value={v(g.reads)} unit={u.label} tone="text-read" />
                    <Num value={v(g.writes)} unit={u.label} tone="text-write" />
                  </TableRow>
                  {isOpen && (
                    <>
                      <GroupLabel>Replicas</GroupLabel>
                      {g.replicas.map((r) => (
                        <SourceRow
                          key={r.key}
                          label={r.replica + (r.primary && r.replica.trim().toLowerCase() !== "primary" ? " (primary)" : "")}
                          mono
                        >
                          <Num value={v(r.readsPerHour)} unit={u.label} small />
                          <Num value={v(r.writesPerHour)} unit={u.label} small />
                        </SourceRow>
                      ))}
                      <GroupLabel>{capitalize(ENGINE_META[g.database.engine].collections)}</GroupLabel>
                      {g.collections.map((c) => (
                        <SourceRow
                          key={c.key}
                          label={c.collection || "?"}
                          mono
                          title={`From ${c.sources.map((x) => logicLabel(logicById.get(x.logicId))).join(", ")}`}
                        >
                          <Num value={v(c.readsPerHour)} unit={u.label} small />
                          <Num value={v(c.writesPerHour)} unit={u.label} small />
                        </SourceRow>
                      ))}
                    </>
                  )}
                </Fragment>
              );
            })}
          </DataTable>
        )}
      </Section>

      {/* Outgoing HTTP */}
      {result.http.length > 0 && (
        <Section title="Outgoing HTTP">
          <DataTable head={["Request", `Calls${u.short}`]}>
            {result.http.map((h) => {
              const key = `http:${h.key}`;
              return (
                <Fragment key={h.key}>
                  <TableRow>
                    <TableCell className="max-w-0 p-0">
                      <Expander open={open.has(key)} onClick={() => toggle(key)}>
                        <span className="min-w-0 truncate font-mono text-[13px]">
                          <span className="font-semibold text-http">{h.method}</span>{" "}
                          {h.target || <span className="text-muted-foreground">?</span>}
                        </span>
                      </Expander>
                    </TableCell>
                    <Num value={v(h.callsPerHour)} unit={u.label} tone="text-http" />
                  </TableRow>
                  {open.has(key) &&
                    h.sources.map((s) => (
                      <SourceRow key={s.logicId} label={`from ${logicLabel(logicById.get(s.logicId))}`}>
                        <Num value={v(s.perHour)} unit={u.label} small />
                      </SourceRow>
                    ))}
                </Fragment>
              );
            })}
          </DataTable>
        </Section>
      )}

      {/* Message brokers */}
      {brokers.length > 0 && (
        <Section title="Message brokers">
          <DataTable head={["Broker", `Messages${u.short}`]}>
            {brokers.map((b) => {
              const key = `broker:${b.broker}`;
              const isOpen = open.has(key);
              return (
                <Fragment key={key}>
                  <TableRow>
                    <TableCell className="max-w-0 p-0">
                      <Expander open={isOpen} onClick={() => toggle(key)}>
                        <BrandIcon brand={b.broker} className="size-3.5" />
                        <span className="min-w-0 truncate text-[13px]">{BROKER_META[b.broker].label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {b.destinations.length} {b.broker === "kafka" ? "topic" : "queue"}
                          {b.destinations.length === 1 ? "" : "s"}
                        </span>
                      </Expander>
                    </TableCell>
                    <Num value={v(b.total)} unit={u.label} tone="text-rabbit" />
                  </TableRow>
                  {isOpen &&
                    b.destinations.map((p) => (
                      <SourceRow
                        key={p.key}
                        label={p.destination || "?"}
                        mono
                        title={`From ${p.sources.map((x) => logicLabel(logicById.get(x.logicId))).join(", ")}`}
                      >
                        <Num value={v(p.messagesPerHour)} unit={u.label} small />
                      </SourceRow>
                    ))}
                </Fragment>
              );
            })}
          </DataTable>
        </Section>
      )}

      {/* Per entry point */}
      {entries.length > 0 && (
        <Section title="By entry point">
          <Card className="py-0">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="px-3">Entry point</TableHead>
                  <TableHead className="w-[3.75rem] px-2 text-right">Calls</TableHead>
                  <TableHead className="w-[3.75rem] px-2 text-right">Reads</TableHead>
                  <TableHead className="w-[3.75rem] px-2 text-right">Writes</TableHead>
                  <TableHead className="w-[3.75rem] px-3 text-right" title="Outgoing HTTP calls and published messages">
                    Out
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const l = result.entries.get(e.id);
                  if (!l) return null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="truncate px-3 font-mono text-[13px]" title={entryLabel(e)}>
                        {entryLabel(e)}
                      </TableCell>
                      <Num value={v(l.callsPerHour)} unit={u.label} narrow />
                      <Num value={v(l.readsPerHour)} unit={u.label} tone="text-read" narrow />
                      <Num value={v(l.writesPerHour)} unit={u.label} tone="text-write" narrow />
                      <Num value={v(l.httpPerHour + l.messagesPerHour)} unit={u.label} />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-heading text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}

function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card className="py-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="text-xs">
            {head.map((h, i) => (
              <TableHead key={h} className={i === 0 ? "px-3" : "w-[5.25rem] px-3 text-right sm:w-24"}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </Card>
  );
}

function Expander({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="flex w-full items-center gap-1.5 px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted"
    >
      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      {children}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={3} className="pt-2 pb-0.5 pl-9 text-[11px] font-medium text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function SourceRow({
  label,
  mono,
  title,
  children,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <TableRow className="bg-muted/40 text-xs hover:bg-muted/40">
      <TableCell
        className={cn("max-w-0 truncate py-1.5 pr-3 pl-9 text-muted-foreground", mono && "font-mono")}
        title={title ?? label}
      >
        {label}
      </TableCell>
      {children}
    </TableRow>
  );
}

function Num({
  value,
  unit,
  tone = "text-foreground",
  small,
  narrow,
}: {
  value: number;
  unit: string;
  tone?: string;
  small?: boolean;
  narrow?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums",
        narrow ? "px-2" : "px-3",
        small ? "py-1.5" : "text-[13px]",
        value === 0 || small ? "text-muted-foreground" : tone,
      )}
      title={`${formatExact(value)} ${unit.toLowerCase()}`}
    >
      {formatRate(value)}
    </TableCell>
  );
}
