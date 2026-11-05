import i18n from "@/lib/i18n";

export type RoomJoinPolicy = "approval" | "open";

export function joinPolicyText(policy: RoomJoinPolicy): string {
  return i18n.t(
    policy === "open" ? "group-room:joinPolicy.open" : "group-room:joinPolicy.approval",
  );
}

export function closesPendingRequests(
  initial: RoomJoinPolicy,
  selected: RoomJoinPolicy,
  count: number,
): boolean {
  return initial === "approval" && selected === "open" && count > 0;
}
