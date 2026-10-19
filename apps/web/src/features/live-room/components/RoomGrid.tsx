import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import type { RoomMember } from "@focusmakers/types";

import { RemoteVideo } from "@/features/live-room/components/RemoteVideo";
import { RoomAvatarFallback } from "@/features/live-room/components/RoomAvatarFallback";
import { RoomTile, SelfStateBadge } from "@/features/live-room/components/RoomTile";
import type { SelfBadgeState } from "@/features/live-room/components/RoomTile";
import { bestSquareGrid } from "@/features/live-room/roomGrid";
import type { RoomGridSpec } from "@/features/live-room/roomGrid";
import { useTileFlipAnimation } from "@/features/live-room/useTileFlipAnimation";
import { cn } from "@/lib/utils";

/** 폭 600 이상 창의 타일 간격(px)이다. 타일 묶음의 `sm:not-landscape-compact:gap-2`와 같은 값이어야 한다. */
const TILE_GAP_PX = 8;

function remoteVideoOrUndefined(userId: number, streams: ReadonlyMap<number, MediaStream>) {
  const stream = streams.get(userId);
  if (!stream) {
    return undefined;
  }
  return <RemoteVideo userId={userId} stream={stream} />;
}

/**
 * 풀스크린(1인)·타일 그리드 렌더. 바 토글 시 타일 FLIP 애니메이션을 자기 DOM에 대해
 * 스스로 건다(`useTileFlipAnimation`). 셀프뷰 서피스 ref는 부모(미리보기 비율 측정·타일
 * rootRef)와 공유하므로 prop으로 받는다.
 */
export function RoomGrid({
  grid,
  allMembers,
  userId,
  controlsVisible,
  selfState,
  focusSec,
  cameraOn,
  myVideo,
  remoteStreams,
  selfSurfaceRef,
}: {
  grid: RoomGridSpec;
  allMembers: RoomMember[];
  userId: number;
  controlsVisible: boolean;
  selfState: SelfBadgeState;
  focusSec: number;
  cameraOn: boolean;
  myVideo: ReactNode;
  remoteStreams: ReadonlyMap<number, MediaStream>;
  selfSurfaceRef: RefObject<HTMLDivElement | null>;
}) {
  const { rowsRef, invalidateFlipRects } = useTileFlipAnimation(controlsVisible);
  const gridRef = useRef<HTMLDivElement>(null);
  /** 격자 칸 크기(여백 제외). 폭 600 이상 창의 타일 한 변을 정한다. */
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = gridRef.current;
    if (element === null) {
      return;
    }
    const measure = (width: number, height: number) => {
      const style = getComputedStyle(element);
      const px = (value: string) => Number.parseFloat(value) || 0;
      const next = {
        width: width - px(style.paddingLeft) - px(style.paddingRight),
        height: height - px(style.paddingTop) - px(style.paddingBottom),
      };
      // 크기가 같아도 새 객체를 넣으면 격자 전체를 다시 그린다.
      setSpace((prev) => (prev?.width === next.width && prev.height === next.height ? prev : next));
    };
    // 측정기의 첫 콜백은 페인트 뒤에 와서 한 프레임 동안 폰 배치가 보인다.
    // 그래서 페인트 전에 한 번 직접 잰다.
    // 아직 배치 전이라 0이면 측정기를 기다린다.
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      measure(rect.width, rect.height);
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) {
        return;
      }
      const box = entry.borderBoxSize?.[0];
      if (box !== undefined) {
        measure(box.inlineSize, box.blockSize);
        return;
      }
      // iOS 15.4 이전 사파리는 바깥 상자 크기를 주지 않아 요소를 직접 잰다.
      const target = entry.target.getBoundingClientRect();
      measure(target.width, target.height);
    });
    // 바 토글은 안쪽 여백만 바꾼다.
    // 바깥 상자를 재야 토글마다 다시 그리지 않는다.
    observer.observe(element, { box: "border-box" });
    return () => observer.disconnect();
  }, [grid.mode]);

  const fit =
    grid.mode === "grid" && space !== null
      ? bestSquareGrid(allMembers.length, space.width, space.height, TILE_GAP_PX)
      : null;
  const fitStyle =
    fit === null
      ? undefined
      : ({
          "--room-tile-size": `${fit.size}px`,
          "--room-grid-width": `${fit.cols * fit.size + (fit.cols - 1) * TILE_GAP_PX}px`,
        } as CSSProperties);

  /**
   * 타일 크기 급이 바뀌는 경계(2명↔3명, 3명↔4명, 4명↔5명)에서 타일 DOM을 통째로 새로 마운트한다. (key 접두)
   * 폭 600 이상 창에서 타일 한 변이 바뀌는 인원 경계도 이 안에 든다.
   */
  const tileLayoutEpoch =
    grid.mode === "grid" && grid.cols === 1
      ? "duo"
      : allMembers.length === 3
        ? "tri" // 가로 3명(1행 3열)과 4명(1행 4열)은 타일 크기가 달라 경계다
        : allMembers.length <= 4
          ? "quad"
          : "hex";

  return grid.mode === "fullscreen" ? (
    <div
      ref={selfSurfaceRef}
      className="absolute inset-0 bg-(--session-dialog-bg) landscape-compact:left-[calc(env(safe-area-inset-left)+16px)] landscape-compact:right-[calc(env(safe-area-inset-right)+16px)] landscape-compact:overflow-hidden landscape-compact:rounded-3xl"
    >
      {cameraOn ? (
        myVideo
      ) : (
        <RoomAvatarFallback nickname={allMembers.find((m) => m.userId === userId)?.nickname} />
      )}
      <SelfStateBadge
        state={selfState}
        focusSec={focusSec}
        className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-3"
      />
    </div>
  ) : (
    <div
      ref={gridRef}
      data-testid="room-grid"
      onScroll={invalidateFlipRects}
      className={cn(
        "flex grow flex-col overflow-y-auto px-1 pt-[calc(env(safe-area-inset-top)+12px)]",
        "landscape-compact:pl-[calc(env(safe-area-inset-left)+16px)] landscape-compact:pr-[calc(env(safe-area-inset-right)+16px)]",
        grid.cols === 1 && controlsVisible
          ? "pb-[calc(env(safe-area-inset-bottom)+108px)]"
          : "pb-[4dvh]",
        // 가로 하단 여백은 인원 무관 pb-2 — 바는 항상 타일 위에 겹친다.
        "landscape-compact:pb-2",
        // 폭 600 이상 창은 바 표시와 무관하게 아래 바 자리를 비워 둔다.
        // 바 토글이 타일 크기를 바꾸지 않는다.
        "sm:not-landscape-compact:px-4 sm:not-landscape-compact:pt-[calc(env(safe-area-inset-top)+16px)] sm:not-landscape-compact:pb-[calc(env(safe-area-inset-bottom)+112px)]",
        // 큰 태블릿은 바가 커져 그만큼 더 비운다.
        "short-side-lg:pb-[calc(env(safe-area-inset-bottom)+136px)]",
      )}
    >
      <div
        ref={rowsRef}
        style={fitStyle}
        data-testid="room-grid-rows"
        // 안전 정렬: 항상 세로 가운데(my-auto) — 종전엔 바 표시 중 mt-auto로 바 바로
        // 위에 붙였는데 타일이 바에 달라붙는 게 어색하다는 피드백(2026-08-26)으로 양
        // 상태 모두 가운데로 통일했다. 바 토글의 배치 변화는 세로 2명뿐이다(컨테이너
        // pb 주석 — 예약이 줄인 공간의 가운데로 조금 올라가고 FLIP이 잇는다). 내용이
        // 넘치면 auto 마진이 접혀 위부터 스크롤되는 성질(data loss 방지)은 그대로다.
        className={cn(
          "my-auto flex w-full flex-wrap justify-center gap-1",
          // 가로 5~6명은 3열 강제(디스코드 참조: 5명 3+2, 6명 3+3) — 44dvh 정사각은
          // 넓은 기기에서 한 행에 4장이 들어가 4+1로 감기므로, 3장+간격 폭으로 줄을
          // 자른다. mx-auto가 좁아진 래퍼를 가운데 놓는다.
          allMembers.length > 4 &&
            "landscape-compact:mx-auto landscape-compact:max-w-[calc(132dvh+8px)]",
          // 한 줄 폭을 열 수만큼으로 묶어 justify-center가 마지막 줄을 가운데 놓는다.
          fit !== null &&
            "sm:not-landscape-compact:mx-auto sm:not-landscape-compact:w-(--room-grid-width) sm:not-landscape-compact:gap-2",
        )}
      >
        {allMembers.map((member) => (
          <RoomTile
            // 크기 급이 바뀌면 재마운트 — 위 tileLayoutEpoch 주석 참고.
            key={`${tileLayoutEpoch}-${member.userId}`}
            member={member}
            rootRef={member.userId === userId ? selfSurfaceRef : undefined}
            selfState={member.userId === userId ? selfState : undefined}
            infoHidden={!controlsVisible}
            media={
              member.userId === userId
                ? myVideo
                : remoteVideoOrUndefined(member.userId, remoteStreams)
            }
            // 2명은 0350/0351 비율(1열 정사각 큰 타일 — 높이 기반 dvh 사이징이라
            // 기기 크기에 비례하고, 바가 올라오면 타일도 함께 준다), 3~6명은 0352
            // 비율(세로 2:3, 2열). 가로 방향은 2:3을 눕혀(3:2) 행 높이를 맞춘다.
            className={cn(
              grid.cols === 1
                ? cn("aspect-square max-w-full", controlsVisible ? "h-[37dvh]" : "h-[39dvh]")
                : cn(
                    "aspect-square",
                    allMembers.length > 4 ? "w-[calc(47%-2px)]" : "w-[calc(50%-2px)]",
                  ),
              // 바 표시에 따른 세로 모드의 축소(2명 37dvh)는 가로에 적용되지 않는다
              // — 가로 크기는 바와 무관해 토글이 레이아웃을 안 바꾼다.
              "landscape-compact:w-auto landscape-compact:max-w-none",
              grid.cols === 1
                ? "landscape-compact:h-[min(88dvh,calc(50dvw-(env(safe-area-inset-left)+env(safe-area-inset-right))/2-18px))]"
                : allMembers.length === 3
                  ? "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-40px)/3))]"
                  : allMembers.length === 4
                    ? "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-44px)/4))]"
                    : "landscape-compact:h-[44dvh]",
              fit !== null && "sm:not-landscape-compact:size-(--room-tile-size)",
            )}
          />
        ))}
      </div>
    </div>
  );
}
