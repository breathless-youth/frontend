import type { DateRange } from "./statsApi";

export const personalRecordsKeys = {
  all: ["stats", "personal"] as const,
  user: (userId: number) => ["stats", "personal", userId] as const,
  daily: (userId: number, date: string, timeZone: string) =>
    ["stats", "personal", userId, timeZone, "daily", date] as const,
  period: (
    userId: number,
    range: DateRange,
    compareRange: DateRange | undefined,
    timeZone: string,
  ) =>
    [
      "stats",
      "personal",
      userId,
      timeZone,
      "period",
      range.from,
      range.to,
      compareRange?.from ?? null,
      compareRange?.to ?? null,
    ] as const,
  rhythm: (userId: number, timeZone: string) =>
    ["stats", "personal", userId, timeZone, "rhythm"] as const,
};
