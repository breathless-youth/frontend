import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { toKoreanDurationLength } from "@/features/study-session/formatDuration";
import { slideNavigate } from "@/lib/pageTransition";
import { cn } from "@/lib/utils";

import { recentDayLabel } from "./recentDayLabel";
import type { TimelapseRecord, TimelapseStore } from "./timelapseStore";
import { getTimelapseStore } from "./timelapseStore";

/** 썸네일 한 장은 수십 KB라 data URL로 들고 있어도 작고, Blob URL처럼 해제할 것이 없다. */
function toDataUrl(bytes: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("썸네일을 읽지 못했어요"));
    reader.readAsDataURL(new Blob([bytes], { type: "image/jpeg" }));
  });
}

function TimelapseThumbCard({
  record,
  store,
  nowMs,
}: {
  record: TimelapseRecord;
  store: TimelapseStore;
  nowMs: number;
}) {
  const thumb = useQuery({
    queryKey: ["timelapse", record.startedAtMs, "thumb"],
    queryFn: async () => {
      const bytes = await store.middlePhoto(record.startedAtMs);
      return bytes === null ? null : await toDataUrl(bytes);
    },
    // 목록에 올라간 타임랩스의 사진은 바뀌지 않는다.
    staleTime: Infinity,
  });
  const src = thumb.data ?? null;
  // 타임랩스 사진은 분석 도구로 보내지 않는다(ADR 0013). 카메라 화면과 같은 세션 리플레이 차단 표식이다.
  const replayBlocked = "amp-block sentry-block";

  return (
    <li className="relative h-64 w-36 shrink-0 snap-start overflow-hidden rounded-[14px] bg-black">
      {src !== null &&
        (record.settings.aspect === "16:9" ? (
          <>
            {/* 가로 영상은 같은 장면을 흐리게 키워 세로 카드의 위아래를 채운다. */}
            <img
              src={src}
              alt=""
              className={cn(
                replayBlocked,
                "absolute inset-0 size-full scale-125 object-cover blur-[18px]",
              )}
            />
            <div className="absolute inset-0 bg-black/25" />
            <img
              src={src}
              alt=""
              className={cn(replayBlocked, "absolute inset-0 size-full object-contain")}
            />
          </>
        ) : (
          <img
            src={src}
            alt=""
            className={cn(replayBlocked, "absolute inset-0 size-full object-cover")}
          />
        ))}
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
  const recent = useQuery({
    queryKey: ["timelapse", "recent"],
    queryFn: async () => {
      // 세션을 오래 안 하면 지울 기회가 없어 홈을 열 때도 보관 기한을 적용한다.
      await store.sweep(Date.now());
      return await store.listReady();
    },
  });

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
        {records.length > 0 && (
          <button
            type="button"
            onClick={openList}
            className="text-muted-foreground -my-3 -mr-2 flex min-h-11 items-center gap-1.5 px-2 text-sm"
          >
            더보기
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {records.length === 0 ? (
        <p className="bg-muted text-muted-foreground shadow-sb-card rounded-[20px] px-5 py-6 text-center text-sm">
          공부를 완료하고 공부한 모습을 공유해보세요
        </p>
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
