"use client";

import { Globe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { effectiveCount } from "@/lib/traffic/calc";
import { formatRate } from "@/lib/traffic/format";
import {
  HOURS_PER,
  HTTP_METHODS,
  RATE_UNITS,
  type EntryKind,
  type EntryPoint,
  type HttpMethod,
  type Logic,
  type RateUnit,
} from "@/lib/traffic/types";
import { cn } from "@/lib/utils";
import { BrandIcon } from "./brand-icon";
import { CollapseToggle } from "./collapse-toggle";
import { NumberField } from "./number-field";
import { entryLabel, KIND_META, logicLabel } from "./ui";

type Props = {
  entry: EntryPoint;
  logic: Logic[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onChange: (entry: EntryPoint) => void;
  onRemove: () => void;
  /** Creates an empty logic block, switches to the Logic tab, and returns its id. */
  onNewLogic: (name: string) => string;
};

const NEW = "__new";

const UNIT_SHORT: Record<RateUnit, string> = {
  second: "/s",
  minute: "/min",
  hour: "/h",
  day: "/day",
  week: "/week",
  month: "/month",
};

/** Per-hour rate shown in another unit, rounded so float noise (0.30000000004) never shows. */
function toUnit(perHour: number, unit: RateUnit) {
  return Number((perHour * HOURS_PER[unit]).toPrecision(10));
}

function summary(l: Logic | undefined) {
  if (!l) return "";
  const n = { read: 0, write: 0, http: 0, publish: 0 };
  for (const o of l.outgoing) n[o.kind] += effectiveCount(o);
  const parts = [
    n.read && `${formatRate(n.read)} read${n.read === 1 ? "" : "s"}`,
    n.write && `${formatRate(n.write)} write${n.write === 1 ? "" : "s"}`,
    n.http && `${formatRate(n.http)} HTTP`,
    n.publish && `${formatRate(n.publish)} message${n.publish === 1 ? "" : "s"}`,
    l.durationMs > 0 && `${formatRate(l.durationMs)} ms`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no outgoing calls yet";
}

export function EntryCard({ entry, logic, collapsed, onCollapsedChange, onChange, onRemove, onNewLogic }: Props) {
  const meta = KIND_META[entry.kind];
  const patch = (p: Partial<EntryPoint>) => onChange({ ...entry, ...p });
  const selected = logic.find((l) => l.id === entry.logicId);

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => onCollapsedChange(!open)} asChild>
    <Card size="sm" className="group/collapse gap-0 py-0">
      <CardHeader className="flex flex-wrap items-center gap-2 border-b py-3 group-data-[state=closed]/collapse:border-b-0">
        <CollapseToggle label={`${collapsed ? "Expand" : "Collapse"} ${entryLabel(entry)}`} />
        <Select value={entry.kind} onValueChange={(v) => patch({ kind: v as EntryKind })}>
          <SelectTrigger size="sm" aria-label="Entry point type" className={cn("w-[7.5rem] font-medium", meta.tone)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">
              <Globe className="text-http" />
              HTTP
            </SelectItem>
            <SelectItem value="rabbitmq">
              <BrandIcon brand="rabbitmq" />
              RabbitMQ
            </SelectItem>
            <SelectItem value="kafka">
              <BrandIcon brand="kafka" />
              Kafka
            </SelectItem>
          </SelectContent>
        </Select>

        {entry.kind === "http" && (
          <Select value={entry.method} onValueChange={(v) => patch({ method: v as HttpMethod })}>
            <SelectTrigger aria-label="HTTP method" className="w-[6.25rem] font-mono font-semibold">
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
        )}

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-muted-foreground sm:order-last sm:ml-0"
          onClick={onRemove}
          aria-label={`Delete ${entryLabel(entry)}`}
        >
          <Trash2 />
        </Button>

        <div className="flex basis-full items-center gap-2 sm:basis-0 sm:flex-1">
          <Input
            aria-label={meta.nameLabel}
            placeholder={meta.placeholder}
            className="min-w-0 flex-1 font-mono"
            value={entry.name}
            onChange={(e) => patch({ name: e.target.value })}
            spellCheck={false}
          />
          <InputGroup className="w-44 shrink-0 sm:w-48">
            <NumberField
              grouped
              label={`${entry.kind === "http" ? "Calls" : "Messages consumed"} per ${entry.rateUnit}`}
              className="text-right font-mono tabular-nums"
              value={toUnit(entry.callsPerHour, entry.rateUnit)}
              onChange={(n) => patch({ callsPerHour: n / HOURS_PER[entry.rateUnit] })}
            />
            <InputGroupAddon align="inline-end" className="pr-1">
              <Select
                value={entry.rateUnit}
                // Keep the typed number and change its unit: "10" then "/s" means 10 per second.
                onValueChange={(v) => {
                  const unit = v as RateUnit;
                  patch({ rateUnit: unit, callsPerHour: toUnit(entry.callsPerHour, entry.rateUnit) / HOURS_PER[unit] });
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Rate unit"
                  className="h-6 gap-0.5 border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none dark:bg-transparent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {RATE_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {entry.kind === "http" ? "calls" : "msgs"}
                      {UNIT_SHORT[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </InputGroupAddon>
          </InputGroup>
        </div>
        {collapsed && (
          <p className="basis-full truncate pl-8 text-xs text-muted-foreground">
            {selected ? `Runs ${logicLabel(selected)} · ${summary(selected)}` : "No logic chosen"}
          </p>
        )}
      </CardHeader>

      <CollapsibleContent asChild>
      <CardContent className="flex flex-col gap-1.5 py-3">
        <Select
          value={selected ? selected.id : undefined}
          onValueChange={(v) => patch({ logicId: v === NEW ? onNewLogic(entryLabel(entry)) : v })}
        >
          <SelectTrigger aria-label="Logic" className="w-full">
            <SelectValue placeholder="Choose the logic this entry point runs…" />
          </SelectTrigger>
          <SelectContent>
            {logic.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {logicLabel(x)}
              </SelectItem>
            ))}
            {logic.length > 0 && <SelectSeparator />}
            <SelectItem value={NEW}>+ New logic…</SelectItem>
          </SelectContent>
        </Select>
        {selected && <p className="px-0.5 text-xs text-muted-foreground">{summary(selected)}</p>}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
