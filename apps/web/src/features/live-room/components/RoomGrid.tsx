import type { ReactNode, RefObject } from "react";

import type { RoomMember } from "@focusmakers/types";

import { RemoteVideo } from "@/features/live-room/components/RemoteVideo";
import { RoomAvatarFallback } from "@/features/live-room/components/RoomAvatarFallback";
import { RoomTile, SelfStateBadge } from "@/features/live-room/components/RoomTile";
import type { SelfBadgeState } from "@/features/live-room/components/RoomTile";
import type { RoomGridSpec } from "@/features/live-room/roomGrid";
import { useTileFlipAnimation } from "@/features/live-room/useTileFlipAnimation";
import { cn } from "@/lib/utils";

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

  /**
   * 타일 크기 급이 바뀌는 경계(2명↔3명, 4명↔5명)에서 타일 DOM을 통째로 새로 마운트한다. (key 접두)
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
      className="absolute inset-0 bg-[var(--session-dialog-bg)] landscape:left-[calc(env(safe-area-inset-left)+16px)] landscape:right-[calc(env(safe-area-inset-right)+16px)] landscape:overflow-hidden landscape:rounded-3xl"
    >
      {cameraOn ? (
        myVideo
      ) : (
        <RoomAvatarFallback nickname={allMembers.find((m) => m.userId === userId)?.nickname} />
      )}
      <SelfStateBadge
        state={selfState}
        studySeconds={focusSec}
        className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-3"
      />
    </div>
  ) : (
    <div
      data-testid="room-grid"
      onScroll={invalidateFlipRects}
      className={cn(
        "flex grow flex-col overflow-y-auto px-1 pt-[calc(env(safe-area-inset-top)+12px)]",
        "landscape:pl-[calc(env(safe-area-inset-left)+16px)] landscape:pr-[calc(env(safe-area-inset-right)+16px)]",
        grid.cols === 1 && controlsVisible
          ? "pb-[calc(env(safe-area-inset-bottom)+108px)]"
          : "pb-[4dvh]",
        // 가로 하단 여백은 인원 무관 pb-2 — 바는 항상 타일 위에 겹친다.
        "landscape:pb-2",
      )}
    >
      <div
        ref={rowsRef}
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
          allMembers.length > 4 && "landscape:mx-auto landscape:max-w-[calc(132dvh+8px)]",
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
              "landscape:w-auto landscape:max-w-none",
              grid.cols === 1
                ? "landscape:h-[min(88dvh,calc(50dvw-(env(safe-area-inset-left)+env(safe-area-inset-right))/2-18px))]"
                : allMembers.length === 3
                  ? "landscape:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-40px)/3))]"
                  : allMembers.length === 4
                    ? "landscape:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-44px)/4))]"
                    : "landscape:h-[44dvh]",
            )}
          />
        ))}
      </div>
    </div>
  );
}
