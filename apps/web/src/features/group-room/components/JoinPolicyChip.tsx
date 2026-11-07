import { Send, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

import { joinPolicyText } from "../model/joinPolicy";
import type { RoomJoinPolicy } from "../model/joinPolicy";

export function JoinPolicyChip({ policy = "approval" }: { policy?: RoomJoinPolicy }) {
  const Icon = policy === "open" ? Zap : Send;
  return (
    <span
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-0.75 rounded-full px-1.75 text-[11px] leading-4 font-bold",
        policy === "open"
          ? "bg-primary py-px text-primary-foreground"
          : "border border-border-strong text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" size={11} strokeWidth={2.4} />
      {joinPolicyText(policy)}
    </span>
  );
}
