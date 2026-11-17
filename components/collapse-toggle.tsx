"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";

/** Chevron button that opens and closes the card it sits in. */
export function CollapseToggle({ label }: { label: string }) {
  return (
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="icon-sm" className="-ml-1 shrink-0 text-muted-foreground" aria-label={label}>
        <ChevronRight className="transition-transform duration-150 group-data-[state=open]/collapse:rotate-90" />
      </Button>
    </CollapsibleTrigger>
  );
}
