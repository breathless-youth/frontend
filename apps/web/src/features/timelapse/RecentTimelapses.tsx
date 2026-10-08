import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { toKoreanDurationLength } from "@/features/study-session/formatDuration";
import { slideNavigate } from "@/lib/pageTransition";

import { recentDayLabel } from "./recentDayLabel";
import { TimelapsesEmpty } from "./TimelapsesEmpty";
import { TimelapseThumb } from "./TimelapseThumb";
import { recentTimelapsesQuery } from "./timelapseQueries";
import type { TimelapseRecord, TimelapseStore } from "./timelapseStore";
import { getTimelapseStore } from "./timelapseStore";

function TimelapseThumbCard({
  record,
  store,
  nowMs,
}: {
  record: TimelapseRecord;
  store: TimelapseStore;
  nowMs: number;
}) {
  return (
    <li className="relative h-64 w-36 shrink-0 snap-start overflow-hidden rounded-[14px] bg-black">
      <TimelapseThumb record={record} store={store} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-[120px] bg-linear-to-b from-black/0 to-black/70" />
      <p className="absolute bottom-3 left-3 flex flex-col gap-0.5 text-white">
        <span className="text-base leading-[19px] font-bold">
          {recentDayLabel(record.startedAtMs, nowMs)}
        </span>
        <span className="text-[13px] leading-4 text-white/85">
          순공 {toKoreanDurationLength(record.summary?.focusSec ?? 0)}
        </span>
      </p>
    </li>
  );
}

/**
 * 홈 최근 타임랩스
 *
 * 기기에 보관 중인 타임랩스를 가운데 사진 한 장으로 보여준다. 재생과 공유는 카드를 눌러 여는
 * 공유 다이얼로그(BY-889)에서 하고, 그 전까지 카드는 누를 수 없다.
 * 세션은 다른 웹뷰에서 끝나므로 홈 탭으로 돌아올 때 react-query 기본값으로 다시 읽는다.
 */
export function RecentTimelapses({ store = getTimelapseStore() }: { store?: TimelapseStore }) {
  const navigate = useNavigate();
  const location = useLocation();
  // react-router navigate()는 항상 push라 빠른 이중 탭에 목록이 두 장 쌓인다.
  const openedRef = useRef(false);
  const recent = useQuery(recentTimelapsesQuery(store));

  if (!recent.isSuccess) {
    return null;
  }
  const records = recent.data;

  const openList = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    slideNavigate("forward", () => navigate({ pathname: "/timelapses", search: location.search }));
  };

  return (
    <section aria-labelledby="recent-timelapses-title" className="flex flex-col gap-3 py-3">
      <div className="flex items-center justify-between px-0.5">
        <h2
          id="recent-timelapses-title"
          className="text-foreground text-lg leading-[21px] font-bold"
        >
          최근 타임랩스
        </h2>
        <button
          type="button"
          onClick={openList}
          className="text-muted-foreground -my-3 -mr-2 flex min-h-11 items-center gap-1.5 px-2 text-sm"
        >
          더보기
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      </div>
      {records.length === 0 ? (
        <TimelapsesEmpty />
      ) : (
        // 홈 본문 좌우 여백(px-5)을 넘어 화면 양 끝까지 이어 붙이고, 카드는 여백 자리에 맞춰 멈춘다.
        <ul className="-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {records.map((record) => (
            <TimelapseThumbCard
              key={record.startedAtMs}
              record={record}
              store={store}
              nowMs={recent.dataUpdatedAt}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
