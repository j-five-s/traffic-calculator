import type { Broker, DbEngine, EntryKind, Outgoing } from "@/lib/traffic/types";

/** Tinted badge classes for the app's own colours (read, write, HTTP, brokers). */
export const TONE = {
  read: "border-transparent bg-read/12 text-read",
  write: "border-transparent bg-write/12 text-write",
  http: "border-transparent bg-http/12 text-http",
  rabbit: "border-transparent bg-rabbit/12 text-rabbit",
  kafka: "border-transparent bg-kafka/12 text-kafka",
} as const;

export const OUTGOING_META: Record<Outgoing["kind"], { label: string; text: string; tone: string }> = {
  read: { label: "DB read", text: "text-read", tone: TONE.read },
  write: { label: "DB write", text: "text-write", tone: TONE.write },
  http: { label: "HTTP call", text: "text-http", tone: TONE.http },
  publish: { label: "Publish", text: "text-rabbit", tone: TONE.rabbit },
};

export const KIND_META: Record<EntryKind, { label: string; nameLabel: string; placeholder: string; tone: string }> = {
  http: { label: "HTTP", nameLabel: "Route path", placeholder: "/posts/:id", tone: TONE.http },
  rabbitmq: { label: "RabbitMQ", nameLabel: "Queue name", placeholder: "orders.created", tone: TONE.rabbit },
  kafka: { label: "Kafka", nameLabel: "Topic", placeholder: "post.updated", tone: TONE.kafka },
};

export const ENGINE_META: Record<DbEngine, { label: string; short: string; collection: string; collections: string }> = {
  mongodb: { label: "MongoDB", short: "Mongo", collection: "collection", collections: "collections" },
  mysql: { label: "MySQL", short: "MySQL", collection: "table", collections: "tables" },
  postgres: { label: "PostgreSQL", short: "Postgres", collection: "table", collections: "tables" },
  redis: { label: "Redis", short: "Redis", collection: "key prefix", collections: "key prefixes" },
};

export const BROKER_META: Record<Broker, { label: string; destination: string; placeholder: string; tone: string }> = {
  rabbitmq: { label: "RabbitMQ", destination: "Queue", placeholder: "orders.created", tone: TONE.rabbit },
  kafka: { label: "Kafka", destination: "Topic", placeholder: "post.updated", tone: TONE.kafka },
};

export function entryLabel(e: { kind: EntryKind; method: string; name: string }) {
  const name = e.name.trim() || "(unnamed)";
  return e.kind === "http" ? `${e.method} ${name}` : `${KIND_META[e.kind].label} · ${name}`;
}

export function logicLabel(l: { name: string } | undefined) {
  return l?.name.trim() || "(unnamed logic)";
}

export function databaseLabel(d: { name: string } | undefined) {
  return d?.name.trim() || "(unnamed database)";
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
