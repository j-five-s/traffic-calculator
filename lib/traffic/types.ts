export type EntryKind = "http" | "rabbitmq" | "kafka";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const DB_ENGINES = ["mongodb", "mysql", "postgres", "redis"] as const;
export type DbEngine = (typeof DB_ENGINES)[number];

export const BROKERS = ["rabbitmq", "kafka"] as const;
export type Broker = (typeof BROKERS)[number];

export type ReplicaRole = "primary" | "replica";

/** One server (or node) of a database that can take reads and writes. */
export type Replica = {
  id: string;
  name: string;
  role: ReplicaRole;
};

/** A collection (MongoDB), table (MySQL, PostgreSQL) or key prefix (Redis). */
export type Collection = {
  id: string;
  name: string;
};

export type Database = {
  id: string;
  name: string;
  engine: DbEngine;
  replicas: Replica[];
  collections: Collection[];
};

/** A database read or write, pointing at a database, replica and collection defined on the Databases tab. */
export type DbOutgoing = {
  id: string;
  kind: "read" | "write";
  databaseId: string;
  replicaId: string;
  collectionId: string;
  count: number;
  /** Percent added to (+) or removed from (−) this call's traffic, e.g. −80 for an 80% cache hit. */
  adjust: number;
};

/** A request to another service or API. */
export type HttpOutgoing = {
  id: string;
  kind: "http";
  method: HttpMethod;
  /** Service and path, or a URL. */
  target: string;
  count: number;
  /** Percent added to (+) or removed from (−) this call's traffic, e.g. +10 for retries. */
  adjust: number;
};

/** A message pushed to a queue or topic. */
export type PublishOutgoing = {
  id: string;
  kind: "publish";
  broker: Broker;
  /** Queue name for RabbitMQ, topic for Kafka. */
  destination: string;
  count: number;
  /** Percent added to (+) or removed from (−) this call's traffic. */
  adjust: number;
};

export type Outgoing = DbOutgoing | HttpOutgoing | PublishOutgoing;

/** A named piece of logic and everything it calls out to, once per run. */
export type Logic = {
  id: string;
  name: string;
  /** How long one run takes, in milliseconds (0 = not set). */
  durationMs: number;
  outgoing: Outgoing[];
};

export const RATE_UNITS = ["second", "minute", "hour", "day", "week", "month"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

/** Hours in one of each rate unit (a month is 30 days). */
export const HOURS_PER: Record<RateUnit, number> = {
  second: 1 / 3600,
  minute: 1 / 60,
  hour: 1,
  day: 24,
  week: 24 * 7,
  month: 24 * 30,
};

export type EntryPoint = {
  id: string;
  kind: EntryKind;
  /** Only used when kind is "http". */
  method: HttpMethod;
  /** Route path for HTTP, queue name for RabbitMQ, topic for Kafka. */
  name: string;
  /** Expected calls (or consumed messages) per hour. All calculations use this. */
  callsPerHour: number;
  /** The unit the rate is entered and shown in; callsPerHour stays per hour. */
  rateUnit: RateUnit;
  /** The one logic block every call runs; empty until chosen. */
  logicId: string;
};

export type Project = {
  version: 3;
  entries: EntryPoint[];
  logic: Logic[];
  databases: Database[];
  /** Multiplier applied to the average to estimate peak load. */
  peakFactor: number;
};
