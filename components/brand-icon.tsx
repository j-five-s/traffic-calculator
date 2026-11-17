import { siApachekafka, siMongodb, siMysql, siPostgresql, siRabbitmq, siRedis, type SimpleIcon } from "simple-icons";
import type { Broker, DbEngine } from "@/lib/traffic/types";
import { cn } from "@/lib/utils";

/** Official logos from Simple Icons (CC0), each in its brand colour. */
const ICONS: Record<DbEngine | Broker, { icon: SimpleIcon; color: string }> = {
  mongodb: { icon: siMongodb, color: `#${siMongodb.hex}` },
  mysql: { icon: siMysql, color: `#${siMysql.hex}` },
  postgres: { icon: siPostgresql, color: `#${siPostgresql.hex}` },
  redis: { icon: siRedis, color: `#${siRedis.hex}` },
  rabbitmq: { icon: siRabbitmq, color: `#${siRabbitmq.hex}` },
  // Kafka's brand colour is near-black; follow the text colour so it shows in dark mode too.
  kafka: { icon: siApachekafka, color: "currentColor" },
};

export function BrandIcon({ brand, className }: { brand: DbEngine | Broker; className?: string }) {
  const { icon, color } = ICONS[brand];
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      aria-label={icon.title}
      fill={color}
      className={cn("size-4 shrink-0", className)}
    >
      <path d={icon.path} />
    </svg>
  );
}
