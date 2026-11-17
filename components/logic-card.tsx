"use client";

import { useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LogicLoad } from "@/lib/traffic/calc";
import { formatExact, formatRate } from "@/lib/traffic/format";
import { defaultReplicaId, newId } from "@/lib/traffic/store";
import {
  BROKERS,
  HTTP_METHODS,
  type Broker,
  type Database,
  type DbOutgoing,
  type HttpMethod,
  type Logic,
  type Outgoing,
} from "@/lib/traffic/types";
import { cn } from "@/lib/utils";
import { BrandIcon } from "./brand-icon";
import { useDialogs } from "./dialogs";
import { CollapseToggle } from "./collapse-toggle";
import { NumberField } from "./number-field";
import { BROKER_META, capitalize, databaseLabel, ENGINE_META, logicLabel, OUTGOING_META } from "./ui";

type Props = {
  logic: Logic;
  load: LogicLoad | undefined;
  databases: Database[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onChange: (logic: Logic) => void;
  onRemove: () => void;
  /** Switches to the Databases tab with a new, empty database. */
  onNewDatabase: () => void;
  /** Adds a collection to a database and returns its id. */
  onNewCollection: (databaseId: string, name: string) => string;
};

const KINDS: Outgoing["kind"][] = ["read", "write", "http", "publish"];

/** One line describing a collapsed logic block, e.g. "3 reads · 2 writes · 1 message". */
function outgoingSummary(logic: Logic) {
  if (logic.outgoing.length === 0) return "No outgoing calls yet";
  const n = { read: 0, write: 0, http: 0, publish: 0 };
  for (const o of logic.outgoing) n[o.kind] += 1;
  const plural = (c: number, word: string) => `${c} ${word}${c === 1 ? "" : "s"}`;
  return [
    n.read && plural(n.read, "read"),
    n.write && plural(n.write, "write"),
    n.http && plural(n.http, "HTTP call"),
    n.publish && plural(n.publish, "message"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function LogicCard({
  logic,
  load,
  databases,
  collapsed,
  onCollapsedChange,
  onChange,
  onRemove,
  onNewDatabase,
  onNewCollection,
}: Props) {
  const setOutgoing = (outgoing: Outgoing[]) => onChange({ ...logic, outgoing });
  const update = (id: string, next: Outgoing) => setOutgoing(logic.outgoing.map((o) => (o.id === id ? next : o)));
  const remove = (id: string) => setOutgoing(logic.outgoing.filter((o) => o.id !== id));

  const lastDb = [...logic.outgoing].reverse().find((o): o is DbOutgoing => o.kind === "read" || o.kind === "write");

  const make = (kind: Outgoing["kind"], id = newId(), count = 1, adjust = 0): Outgoing => {
    if (kind === "http") return { id, kind, method: "GET", target: "", count, adjust };
    if (kind === "publish") return { id, kind, broker: "kafka", destination: "", count, adjust };
    const db = databases.find((d) => d.id === lastDb?.databaseId) ?? databases[0];
    return { id, kind, databaseId: db?.id ?? "", replicaId: defaultReplicaId(db), collectionId: "", count, adjust };
  };

  const runs = load?.runsPerHour ?? 0;

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => onCollapsedChange(!open)} asChild>
    <Card size="sm" className="group/collapse gap-0 py-0">
      <CardHeader className="flex flex-wrap items-center gap-2 border-b py-3 group-data-[state=closed]/collapse:border-b-0">
        <CollapseToggle label={`${collapsed ? "Expand" : "Collapse"} ${logicLabel(logic)}`} />
        <Input
          aria-label="Logic name"
          placeholder="Logic name, e.g. Update post"
          className="min-w-0 flex-1 font-medium"
          value={logic.name}
          onChange={(e) => onChange({ ...logic, name: e.target.value })}
        />
        <InputGroup className="w-28 shrink-0" title="How long one run of this logic takes">
          <NumberField
            grouped
            label="Logic duration in milliseconds"
            className={cn("text-right font-mono tabular-nums", !logic.durationMs && "text-muted-foreground")}
            value={logic.durationMs}
            onChange={(n) => onChange({ ...logic, durationMs: n })}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>ms</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" title={`${formatExact(runs)} runs per hour`}>
          {load?.usedBy ? (
            <>
              runs <span className="font-mono font-medium text-foreground tabular-nums">{formatRate(runs)}/h</span>
              {logic.durationMs > 0 && (
                <span title="Runs in progress at the same time on average: runs per second × duration">
                  {" "}
                  · <span className="font-mono font-medium text-foreground tabular-nums">{formatRate(load.concurrent)}</span>{" "}
                  at once
                </span>
              )}{" "}
              · used by {load.usedBy}
            </>
          ) : (
            "not used yet"
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onRemove}
          aria-label={`Delete ${logicLabel(logic)}`}
        >
          <Trash2 />
        </Button>
        {collapsed && (
          <p className="basis-full truncate pl-8 text-xs text-muted-foreground">{outgoingSummary(logic)}</p>
        )}
      </CardHeader>

      <CollapsibleContent asChild>
      <CardContent className="py-3">
        {logic.outgoing.length === 0 ? (
          <p className="pb-2 text-sm text-muted-foreground">
            Nothing outgoing yet. Add the database calls, HTTP requests and messages one run makes.
          </p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1.5">
            {logic.outgoing.map((o) => (
              <li
                key={o.id}
                className="grid grid-cols-[7rem_minmax(0,1fr)_auto_auto] items-center gap-1.5 border-b pb-1.5 last:border-0 last:pb-0 sm:flex sm:border-0 sm:pb-0"
              >
                <Select
                  value={o.kind}
                  onValueChange={(v) => {
                    const kind = v as Outgoing["kind"];
                    if (kind === o.kind) return;
                    if ((kind === "read" || kind === "write") && (o.kind === "read" || o.kind === "write")) {
                      update(o.id, { ...o, kind });
                    } else {
                      update(o.id, make(kind, o.id, o.count, o.adjust));
                    }
                  }}
                >
                  <SelectTrigger aria-label="Outgoing type" className={cn("w-[7rem] font-medium", OUTGOING_META[o.kind].text)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Database</SelectLabel>
                      <SelectItem value="read">DB read</SelectItem>
                      <SelectItem value="write">DB write</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Other</SelectLabel>
                      <SelectItem value="http">HTTP call</SelectItem>
                      <SelectItem value="publish">Publish</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <div className="col-span-4 row-start-2 flex min-w-0 flex-1 items-center gap-1.5">
                  {o.kind === "http" ? (
                    <>
                      <Select value={o.method} onValueChange={(v) => update(o.id, { ...o, method: v as HttpMethod })}>
                        <SelectTrigger aria-label="HTTP method" className="w-[6.25rem] shrink-0 font-mono font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HTTP_METHODS.map((m) => (
                            <SelectItem key={m} value={m} className="font-mono">
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label="Service and path, or URL"
                        placeholder="payments-api /charge"
                        list="http-targets"
                        className="min-w-0 flex-1 font-mono"
                        value={o.target}
                        onChange={(e) => update(o.id, { ...o, target: e.target.value })}
                        spellCheck={false}
                      />
                    </>
                  ) : o.kind === "publish" ? (
                    <>
                      <Select value={o.broker} onValueChange={(v) => update(o.id, { ...o, broker: v as Broker })}>
                        <SelectTrigger aria-label="Message broker" className="w-[8.5rem] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BROKERS.map((b) => (
                            <SelectItem key={b} value={b}>
                              <BrandIcon brand={b} />
                              {BROKER_META[b].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={BROKER_META[o.broker].destination}
                        placeholder={BROKER_META[o.broker].placeholder}
                        list="destinations"
                        className="min-w-0 flex-1 font-mono"
                        value={o.destination}
                        onChange={(e) => update(o.id, { ...o, destination: e.target.value })}
                        spellCheck={false}
                      />
                    </>
                  ) : (
                    <DbFields
                      op={o}
                      databases={databases}
                      onChange={(next) => update(o.id, next)}
                      onNewDatabase={onNewDatabase}
                      onNewCollection={onNewCollection}
                    />
                  )}
                </div>

                <div className="col-start-3 flex items-center gap-1.5">
                  <InputGroup className="w-[4.5rem]">
                    <InputGroupAddon>
                      <InputGroupText>×</InputGroupText>
                    </InputGroupAddon>
                    <NumberField
                      grouped
                      label="Times per run"
                      className="text-right font-mono tabular-nums"
                      value={o.count}
                      onChange={(n) => update(o.id, { ...o, count: n })}
                    />
                  </InputGroup>
                  <AdjustField value={o.adjust} onChange={(n) => update(o.id, { ...o, adjust: n })} />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => remove(o.id)}
                  aria-label="Remove outgoing call"
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="-ml-2 flex flex-wrap gap-0.5">
          {KINDS.map((k) => (
            <Button
              key={k}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setOutgoing([...logic.outgoing, make(k)])}
            >
              <Plus className={OUTGOING_META[k].text} /> {OUTGOING_META[k].label}
            </Button>
          ))}
        </div>
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}

/**
 * Adds (+) or removes (−) a percentage of one call's traffic, e.g. −80 when a cache answers
 * 80% of requests. Hidden behind a "± %" button until used; back at 0 it collapses again.
 */
function AdjustField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (value === 0 && !open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="w-[5.25rem] border-dashed text-xs text-muted-foreground"
            onClick={() => {
              setOpen(true);
              requestAnimationFrame(() => ref.current?.querySelector("input")?.focus());
            }}
          >
            ± %
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add or remove % of this call&apos;s traffic, e.g. −80 for an 80% cache hit</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <InputGroup
      ref={ref}
      className="w-[5.25rem]"
      title="Add or remove % of this call's traffic. −80 = an 80% cache hit, +10 = 10% retries."
      onBlur={(e) => {
        // Collapse back to the button when focus leaves with the value at 0.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <NumberField
        grouped
        label="Add or remove percent of traffic"
        min={-100}
        step={5}
        className={cn(
          "text-right font-mono tabular-nums",
          value < 0 ? "text-read" : value > 0 ? "text-write" : "text-muted-foreground",
        )}
        value={value}
        format={(n) => (n > 0 ? `+${n}` : String(n))}
        onChange={onChange}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>%</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

const NEW = "__new";

function DbFields({
  op,
  databases,
  onChange,
  onNewDatabase,
  onNewCollection,
}: {
  op: DbOutgoing;
  databases: Database[];
  onChange: (op: DbOutgoing) => void;
  onNewDatabase: () => void;
  onNewCollection: (databaseId: string, name: string) => string;
}) {
  const { ask } = useDialogs();
  const db = databases.find((d) => d.id === op.databaseId);
  const replica = db?.replicas.find((r) => r.id === op.replicaId);
  const collection = db?.collections.find((c) => c.id === op.collectionId);
  const meta = db ? ENGINE_META[db.engine] : ENGINE_META.mongodb;

  return (
    <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
      <Select
        value={db ? db.id : undefined}
        onValueChange={(v) => {
          if (v === NEW) return onNewDatabase();
          const next = databases.find((d) => d.id === v);
          // Keep the same collection name if the new database has one.
          const sameName = next?.collections.find((c) => c.name === collection?.name);
          onChange({ ...op, databaseId: next?.id ?? "", replicaId: defaultReplicaId(next), collectionId: sameName?.id ?? "" });
        }}
      >
        <SelectTrigger aria-label="Database" aria-invalid={!db} className="w-full min-w-0 font-medium">
          <SelectValue placeholder="Database…" />
        </SelectTrigger>
        <SelectContent>
          {databases.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              <BrandIcon brand={d.engine} />
              {databaseLabel(d)}
            </SelectItem>
          ))}
          {databases.length > 0 && <SelectSeparator />}
          <SelectItem value={NEW}>+ New database…</SelectItem>
        </SelectContent>
      </Select>

      <Select value={replica ? replica.id : undefined} onValueChange={(v) => onChange({ ...op, replicaId: v })} disabled={!db}>
        <SelectTrigger aria-label="Replica" aria-invalid={!!db && !replica} className="w-full min-w-0 font-mono">
          <SelectValue placeholder="Replica…" />
        </SelectTrigger>
        <SelectContent>
          {db?.replicas.map((r) => (
            <SelectItem key={r.id} value={r.id} className="font-mono">
              {r.name || "(unnamed)"}
              {r.role === "primary" && r.name.trim().toLowerCase() !== "primary" ? " (primary)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={collection ? collection.id : undefined}
        disabled={!db}
        onValueChange={async (v) => {
          if (v !== NEW) return onChange({ ...op, collectionId: v });
          const name = await ask({
            title: `New ${meta.collection}`,
            label: `Name in ${databaseLabel(db)}`,
            placeholder: meta.collection === "key prefix" ? "user:*" : "orders",
            action: `Add ${meta.collection}`,
          });
          if (db && name) onChange({ ...op, collectionId: onNewCollection(db.id, name) });
        }}
      >
        <SelectTrigger aria-label={meta.collection} aria-invalid={!!db && !collection} className="w-full min-w-0 font-mono">
          <SelectValue placeholder={`${capitalize(meta.collection)}…`} />
        </SelectTrigger>
        <SelectContent>
          {db?.collections.map((c) => (
            <SelectItem key={c.id} value={c.id} className="font-mono">
              {c.name || "(unnamed)"}
            </SelectItem>
          ))}
          {!!db?.collections.length && <SelectSeparator />}
          <SelectItem value={NEW}>+ New {meta.collection}…</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
