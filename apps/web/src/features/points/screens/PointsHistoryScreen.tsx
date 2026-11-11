import type { HistoryFilter, PointsHistoryEntry } from "../types";

/** 포인트 기록의 본문이며 다음 작업에서 채운다. 틀과 잔액 알약은 라우트가 그린다. */
export function PointsHistoryScreen(_props: {
  entries: PointsHistoryEntry[];
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
  onEarn: () => void;
}) {
  return null;
}
