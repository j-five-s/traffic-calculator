"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/traffic/store";
import { DB_ENGINES, type Database, type DbEngine, type ReplicaRole } from "@/lib/traffic/types";
import { CollapseToggle } from "./collapse-toggle";
import { useDialogs } from "./dialogs";
import { BrandIcon } from "./brand-icon";
import { capitalize, ENGINE_META } from "./ui";

type Props = {
  database: Database;
  /** How many DB calls point at each database, replica and collection id. */
  usage: Map<string, number>;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onChange: (db: Database) => void;
  onRemove: () => void;
};

function focusItem(id: string) {
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-item-id="${id}"] input`)?.focus());
}

export function DatabaseCard({ database: db, usage, collapsed, onCollapsedChange, onChange, onRemove }: Props) {
  const { confirm } = useDialogs();
  const meta = ENGINE_META[db.engine];
  const patch = (p: Partial<Database>) => onChange({ ...db, ...p });
  const uses = usage.get(db.id) ?? 0;

  const confirmRemoval = async (what: string, n: number) =>
    n === 0 ||
    (await confirm({
      title: `Remove ${what}?`,
      description: `It is used by ${n} DB call${n === 1 ? "" : "s"} in your logic. Those calls will need a new choice.`,
      action: "Remove",
      destructive: true,
    }));

  const addReplica = () => {
    const id = newId();
    const hasPrimary = db.replicas.some((r) => r.role === "primary");
    const name = hasPrimary ? `replica-${db.replicas.filter((r) => r.role === "replica").length + 1}` : "primary";
    patch({ replicas: [...db.replicas, { id, name, role: hasPrimary ? "replica" : "primary" }] });
    focusItem(id);
  };

  const addCollection = () => {
    const id = newId();
    patch({ collections: [...db.collections, { id, name: "" }] });
    focusItem(id);
  };

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => onCollapsedChange(!open)} asChild>
    <Card size="sm" className="group/collapse gap-0 py-0">
      <CardHeader className="flex flex-wrap items-center gap-2 border-b py-3 group-data-[state=closed]/collapse:border-b-0">
        <CollapseToggle label={`${collapsed ? "Expand" : "Collapse"} database ${db.name}`} />
        <Select value={db.engine} onValueChange={(v) => patch({ engine: v as DbEngine })}>
          <SelectTrigger aria-label="Database engine" className="w-[8.5rem] shrink-0 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DB_ENGINES.map((eng) => (
              <SelectItem key={eng} value={eng}>
                <BrandIcon brand={eng} />
                {ENGINE_META[eng].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Database name"
          placeholder={db.engine === "redis" ? "Instance name, e.g. cache" : "Database name, e.g. main"}
          className="min-w-0 flex-1 font-mono font-medium"
          value={db.name}
          onChange={(e) => patch({ name: e.target.value })}
          spellCheck={false}
        />
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {uses ? `${uses} DB call${uses === 1 ? "" : "s"}` : "not used yet"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={onRemove}
          aria-label={`Delete database ${db.name}`}
        >
          <Trash2 />
        </Button>
        {collapsed && (
          <p className="basis-full truncate pl-8 text-xs text-muted-foreground">
            {db.replicas.length} replica{db.replicas.length === 1 ? "" : "s"} · {db.collections.length}{" "}
            {db.collections.length === 1 ? meta.collection : meta.collections}
            {db.collections.length > 0 && <span className="font-mono"> ({db.collections.map((c) => c.name || "?").join(", ")})</span>}
          </p>
        )}
      </CardHeader>

      <CollapsibleContent asChild>
      <CardContent className="grid gap-5 py-3 sm:grid-cols-2 sm:gap-6">
        <section aria-label="Replicas" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Replicas</h3>
          {db.replicas.map((r) => (
            <div key={r.id} data-item-id={r.id} className="flex items-center gap-1.5">
              <Input
                aria-label="Replica name"
                placeholder="replica name"
                className="min-w-0 flex-1 font-mono"
                value={r.name}
                onChange={(e) =>
                  patch({ replicas: db.replicas.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })
                }
                spellCheck={false}
              />
              <Select
                value={r.role}
                onValueChange={(v) =>
                  patch({ replicas: db.replicas.map((x) => (x.id === r.id ? { ...x, role: v as ReplicaRole } : x)) })
                }
              >
                <SelectTrigger aria-label="Replica role" className="w-[6.5rem] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="replica">Replica</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`Remove replica ${r.name}`}
                onClick={async () => {
                  if (await confirmRemoval(`replica "${r.name}"`, usage.get(r.id) ?? 0))
                    patch({ replicas: db.replicas.filter((x) => x.id !== r.id) });
                }}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={addReplica}>
            <Plus /> Replica
          </Button>
        </section>

        <section aria-label={meta.collections} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">{capitalize(meta.collections)}</h3>
          {db.collections.length === 0 && <p className="py-1.5 text-sm text-muted-foreground">None yet.</p>}
          {db.collections.map((c) => (
            <div key={c.id} data-item-id={c.id} className="flex items-center gap-1.5">
              <Input
                aria-label={`${meta.collection} name`}
                placeholder={meta.collection}
                className="min-w-0 flex-1 font-mono"
                value={c.name}
                onChange={(e) =>
                  patch({ collections: db.collections.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && c.id === db.collections.at(-1)?.id && c.name.trim()) addCollection();
                }}
                spellCheck={false}
              />
              <span className="w-12 shrink-0 text-right">
                {usage.get(c.id) ? (
                  <Badge variant="secondary" className="tabular-nums" title="DB calls using it">
                    {usage.get(c.id)}×
                  </Badge>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`Remove ${meta.collection} ${c.name}`}
                onClick={async () => {
                  if (await confirmRemoval(`"${c.name || "(unnamed)"}"`, usage.get(c.id) ?? 0))
                    patch({ collections: db.collections.filter((x) => x.id !== c.id) });
                }}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={addCollection}>
            <Plus /> {capitalize(meta.collection)}
          </Button>
        </section>
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
