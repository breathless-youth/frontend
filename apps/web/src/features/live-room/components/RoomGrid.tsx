import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import type { RoomMember } from "@focusmakers/types";

import { RemoteVideo } from "@/features/live-room/components/RemoteVideo";
import { RoomTile } from "@/features/live-room/components/RoomTile";
import type { RoomTileProps } from "@/features/live-room/components/RoomTile";
import { bestSquareGrid } from "@/features/live-room/roomGrid";
import { cn } from "@/lib/utils";

/** 폭 600 이상 창의 타일 간격(px)이다. 타일 묶음의 `regular:gap-2`와 같은 값이어야 한다. */
const TILE_GAP_PX = 8;

function remoteVideoOrUndefined(userId: number, streams: ReadonlyMap<number, MediaStream>) {
  const stream = streams.get(userId);
  if (!stream) {
    return undefined;
  }
  return <RemoteVideo userId={userId} stream={stream} />;
}

/**
 * 룸 타일 그리드
 *
 * 1명도 타일 한 장으로 그린다.
 * 타일 크기와 위치는 바 표시와 무관하다.
 * 바 표시에 따라 타일이 움직이면 영상이 흔들려 보이기 때문이다.
 * 바가 내려가면 타일 안의 목표 문구만 함께 내려가고 닉네임과 마이크 아이콘은 그 자리에 남는다.
 * 가로 폰은 바가 맨 아랫줄 타일의 이름 줄을 덮어서, 바가 떠 있는 동안에는 그 줄의 이름 묶음을 바 위로 올린다.
 * 셀프뷰 서피스 ref는 부모(미리보기 비율 측정·타일 rootRef)와 공유하므로 prop으로 받는다.
 * 그룹 공부방 세로 폰은 좌우 16px 여백과 4px 간격으로 2열을 그려 폭 402에서 타일 한 변이 183px다.
 * 타이머 캡슐이 떠 있는 동안에는 바 위 캡슐 자리 60px을 아래에 더 비워 캡슐이 멤버 메뉴 버튼과 닉네임을 가리지 않는다.
 * 가로 폰도 바와 달리 캡슐은 숨지 않아서 캡슐 띠를 비우고, 그만큼 타일이 작아진다.
 */
export function RoomGrid({
  allMembers,
  userId,
  myVideo,
  remoteStreams,
  selfSurfaceRef,
  variant = "invite",
  tileExtras,
  capsuleShown = false,
  barHidden = false,
}: {
  allMembers: RoomMember[];
  userId: number;
  myVideo: ReactNode;
  remoteStreams: ReadonlyMap<number, MediaStream>;
  selfSurfaceRef: RefObject<HTMLDivElement | null>;
  variant?: "invite" | "group";
  /** 그룹 공부방 타일에만 더하는 메뉴 버튼, 말하는 중, 마이크, 차단 표시 */
  tileExtras?: (
    member: RoomMember,
  ) => Pick<RoomTileProps, "menuButton" | "speaking" | "micOn" | "blocked">;
  /** 그룹 공부방에서 바 위에 타이머 캡슐이 떠 있다. */
  capsuleShown?: boolean;
  /**
   * 아래 바가 내려가 있다.
   *
   * 내려가 있는 동안 모든 타일의 목표 문구를 함께 내린다.
   * 떠 있는 동안에는 가로 폰에서 바가 덮는 타일의 이름 줄을 바 위로 올린다.
   * 초대코드 방과 그룹 공부방 모두에 적용한다.
   */
  barHidden?: boolean;
}) {
  const group = variant === "group";
  const reserveCapsule = group && capsuleShown;
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
    // 여백은 회전할 때와 캡슐 띠가 생기거나 없어질 때 바뀐다.
    // 회전은 바깥 상자도 함께 바뀌어 측정기가 알린다.
    // 캡슐 띠는 바깥 상자가 그대로라 측정기가 알리지 않아서 띠가 바뀔 때마다 이 effect를 다시 돌려 직접 측정한다.
    observer.observe(element, { box: "border-box" });
    return () => observer.disconnect();
  }, [reserveCapsule]);

  const fit =
    space !== null
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
   * 타일 크기 급이 바뀌는 경계(1명↔2명, 2명↔3명, 3명↔4명, 4명↔5명)에서 타일 DOM을 통째로 새로 마운트한다. (key 접두)
   * 폭 600 이상 창에서 타일 한 변이 바뀌는 인원 경계도 이 안에 든다.
   */
  const tileLayoutEpoch =
    allMembers.length <= 1
      ? "solo"
      : allMembers.length === 2
        ? "duo"
        : allMembers.length === 3
          ? "tri" // 가로 3명(1행 3열)과 4명(1행 4열)은 타일 크기가 달라 경계다
          : allMembers.length <= 4
            ? "quad"
            : "hex";

  // 가로 폰에서 아래 바가 덮는 것은 맨 아랫줄이다.
  // 5~6명은 3열 2줄이라 윗줄은 바에 닿지 않는다.
  // 4명은 타일이 작아 한 줄 아래 끝이 바 윗변보다 위라 바가 닿지 않으므로 올리지 않는다.
  const firstLiftedIndex =
    allMembers.length === 4 ? Number.POSITIVE_INFINITY : allMembers.length > 4 ? 3 : 0;

  return (
    <div
      ref={gridRef}
      data-testid="room-grid"
      data-variant={variant}
      data-capsule-reserved={reserveCapsule || undefined}
      className={cn(
        "flex grow flex-col overflow-y-auto",
        group ? "px-4" : "px-1",
        // 세로는 위로 시간 글자와 과목 알약, 아래로 바 자리를 늘 비워 둔다.
        // 위는 총 줄이 보일 때의 높이라 조작이 숨어 알약이 올라가도 타일이 움직이지 않는다.
        // 아래는 바 오프셋과 같은 max라 아래 안전 영역이 없는 기기에서도 바가 타일에 닿지 않는다.
        // 위아래 4px은 타일이 알약과 바에 붙어 보이지 않게 띄운 값이다.
        "pt-[calc(env(safe-area-inset-top)+96px)]",
        reserveCapsule
          ? "pb-[calc(max(calc(env(safe-area-inset-bottom)+76px),86px)+60px)]"
          : "pb-[max(calc(env(safe-area-inset-bottom)+76px),86px)]",
        "landscape-compact:pl-[calc(env(safe-area-inset-left)+16px)] landscape-compact:pr-[calc(env(safe-area-inset-right)+16px)]",
        // 가로는 높이가 모자라 시간 글자와 바가 타일 위에 겹친다.
        "landscape-compact:pt-[calc(env(safe-area-inset-top)+12px)]",
        // 캡슐이 떠 있으면 가로도 캡슐 윗변까지 비우고 4px을 더 띄운다.
        // 띠 높이는 공부방 화면의 캡슐 자리에서 나온 값이라 캡슐 자리를 바꾸면 함께 바꾼다.
        // 좁은 가로 폰은 캡슐이 바 위에 떠서 바 아래 여백 6px, 바 74px, 바와 캡슐 사이 12px, 캡슐 48px을 더한다.
        // 넓은 가로 폰은 캡슐이 바 옆 가운데에 붙어서 바 아래 여백 6px, 바와 캡슐의 높이 차 절반 13px, 캡슐 48px을 더한다.
        reserveCapsule
          ? "landscape-compact:pb-(--room-capsule-band) landscape-compact:[--room-capsule-band:calc(env(safe-area-inset-bottom)+144px)] landscape-compact:md:[--room-capsule-band:calc(env(safe-area-inset-bottom)+71px)]"
          : "landscape-compact:pb-2",
        // 태블릿 가로도 시간 글자와 과목 알약이 타일에 겹치는 것을 받아들이고 바 자리만 비운다.
        "regular:px-4 regular:pt-[calc(env(safe-area-inset-top)+16px)]",
        // 큰 태블릿은 바가 커져 그만큼 더 비운다.
        reserveCapsule
          ? "regular:pb-[calc(env(safe-area-inset-bottom)+172px)] short-side-lg:pb-[calc(env(safe-area-inset-bottom)+196px)]"
          : "regular:pb-[calc(env(safe-area-inset-bottom)+112px)] short-side-lg:pb-[calc(env(safe-area-inset-bottom)+136px)]",
        "regular:portrait:pt-[calc(env(safe-area-inset-top)+122px)]",
        "short-side-lg:portrait:pt-[calc(env(safe-area-inset-top)+148px)]",
      )}
    >
      <div
        style={fitStyle}
        data-testid="room-grid-rows"
        // 안전 정렬: 항상 세로 가운데(my-auto)다.
        // 내용이 넘치면 auto 마진이 접혀 위부터 스크롤된다.
        className={cn(
          "my-auto flex w-full flex-wrap justify-center gap-1",
          // 가로 5~6명은 3열 강제(디스코드 참조: 5명 3+2, 6명 3+3) — 44dvh 정사각은
          // 넓은 기기에서 한 행에 4장이 들어가 4+1로 감기므로, 3장+간격 폭으로 줄을
          // 자른다. mx-auto가 좁아진 래퍼를 가운데 놓는다.
          // 캡슐 띠로 타일이 작아지면 줄 폭도 작아진 타일 세 장과 간격 폭으로 자른다.
          allMembers.length > 4 &&
            (reserveCapsule
              ? "landscape-compact:mx-auto landscape-compact:max-w-[calc(min(44dvh,calc((100dvh-env(safe-area-inset-top)-16px-var(--room-capsule-band))/2))*3+8px)]"
              : "landscape-compact:mx-auto landscape-compact:max-w-[calc(132dvh+8px)]"),
          // 한 줄 폭을 열 수만큼으로 묶어 justify-center가 마지막 줄을 가운데 놓는다.
          fit !== null && "regular:mx-auto regular:w-(--room-grid-width) regular:gap-2",
        )}
      >
        {allMembers.map((member, index) => (
          <RoomTile
            // 크기 급이 바뀌면 재마운트 — 위 tileLayoutEpoch 주석 참고.
            key={`${tileLayoutEpoch}-${member.userId}`}
            member={member}
            {...tileExtras?.(member)}
            goalHidden={barHidden}
            // 캡슐 띠를 비운 격자는 타일이 바 위에서 끝나서 올릴 일이 없다.
            lifted={!barHidden && !reserveCapsule && index >= firstLiftedIndex}
            rootRef={member.userId === userId ? selfSurfaceRef : undefined}
            isSelf={member.userId === userId}
            media={
              member.userId === userId
                ? myVideo
                : remoteVideoOrUndefined(member.userId, remoteStreams)
            }
            // 세로 크기는 비율에 맡기지 않고 두 변을 직접 정한다.
            // iOS는 가로에서 높이로 정한 타일을 세로로 돌리면 비율로 높이를 다시 계산하지 않아 높이가 0으로 남는다.
            // 폭 예산은 좌우 px-1을 뺀 100dvw-8px이고, 좌우 40px 여백은 100dvw-80px이다.
            // 그룹 공부방은 좌우 px-4와 간격 4px을 뺀 100dvw-36px을 둘로 나눠 2열이 폭에 꼭 맞는다.
            className={cn(
              "aspect-square",
              allMembers.length <= 1
                ? // 좌우 40px 폭과 위아래 띠 높이 중 작은 쪽이라 낮은 기기에서도 띠를 넘지 않는다.
                  // 캡슐이 뜨면 띠가 캡슐 자리 60px만큼 줄어든다.
                  reserveCapsule
                  ? "size-[min(calc(100dvw-80px),calc(100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-156px))]"
                  : "size-[min(calc(100dvw-80px),calc(100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-96px))]"
                : allMembers.length === 2
                  ? // 좌우 40px 폭과 위아래 띠를 둘로 나눈 높이 중 작은 쪽이라 낮은 기기에서도 띠를 넘지 않는다.
                    reserveCapsule
                    ? "size-[min(calc(100dvw-80px),calc((100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-160px)/2))]"
                    : "size-[min(calc(100dvw-80px),calc((100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-100px)/2))]"
                  : allMembers.length <= 4
                    ? group
                      ? "size-[calc((100dvw-36px)/2)]"
                      : "size-[calc((100dvw-8px)*0.47-2px)]"
                    : // 낮은 기기에서 3행이 띠를 넘어 스크롤되지 않게 띠를 셋으로 나눈 높이로 묶는다.
                      group
                      ? reserveCapsule
                        ? "size-[min(calc((100dvw-36px)/2),calc((100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-164px)/3))]"
                        : "size-[min(calc((100dvw-36px)/2),calc((100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-104px)/3))]"
                      : "size-[min(calc((100dvw-8px)*0.47-2px),calc((100dvh-env(safe-area-inset-top)-max(calc(env(safe-area-inset-bottom)+76px),86px)-104px)/3))]",
              "landscape-compact:w-auto",
              // 가로에서 캡슐이 뜨면 위 여백 12px과 캡슐 띠를 뺀 높이도 넘지 않는다.
              allMembers.length <= 2
                ? reserveCapsule
                  ? "landscape-compact:h-[min(88dvh,calc(50dvw-(env(safe-area-inset-left)+env(safe-area-inset-right))/2-18px),calc(100dvh-env(safe-area-inset-top)-12px-var(--room-capsule-band)))]"
                  : "landscape-compact:h-[min(88dvh,calc(50dvw-(env(safe-area-inset-left)+env(safe-area-inset-right))/2-18px))]"
                : allMembers.length === 3
                  ? reserveCapsule
                    ? "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-40px)/3),calc(100dvh-env(safe-area-inset-top)-12px-var(--room-capsule-band)))]"
                    : "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-40px)/3))]"
                  : allMembers.length === 4
                    ? reserveCapsule
                      ? "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-44px)/4),calc(100dvh-env(safe-area-inset-top)-12px-var(--room-capsule-band)))]"
                      : "landscape-compact:h-[min(84dvh,calc((100dvw-env(safe-area-inset-left)-env(safe-area-inset-right)-44px)/4))]"
                    : // 5~6명은 2행이라 행 사이 4px을 더 빼고 둘로 나눈다.
                      reserveCapsule
                      ? "landscape-compact:h-[min(44dvh,calc((100dvh-env(safe-area-inset-top)-16px-var(--room-capsule-band))/2))]"
                      : "landscape-compact:h-[44dvh]",
              fit !== null && "regular:size-(--room-tile-size)",
            )}
          />
        ))}
      </div>
    </div>
  );
}
