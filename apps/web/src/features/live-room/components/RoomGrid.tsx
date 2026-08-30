import type { ReactNode, RefObject } from "react";

import type { RoomMember } from "@focusmakers/types";

import { RemoteVideo } from "@/features/live-room/components/RemoteVideo";
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
   * 타일 크기 급이 바뀌는 경계(2명↔3명, 4명↔5명)에서 타일 DOM을 통째로 새로 마운트한다
   * (key 접두) — iOS WKWebView는 재생 중인 영상 타일이 레이아웃 변경으로 리사이즈되면
   * 컴포지팅 레이어를 다시 그리지 못하고 빈 채로 남길 수 있다(2026-08-26 실기기: 2명→3명
   * 전환에서 기존 타일 2개가 안 그려지고 새로 마운트된 타일만 보임 — 회전으로만 복구).
   * 새 DOM은 새 레이어라 강제 재페인트가 되고, 영상 재생은 kickVideoPlayback 재시도가
   * 보통 1초 안에 되살린다. ⚠️ 예외: iOS 저전력 모드 + 캡처 없음(내 카메라 끔)이면
   * 재마운트된 상대 영상의 play()가 다음 탭(제스처 킥)까지 계속 거부된다 — 페인트
   * 누락(전원 공통·항상 재현) 쪽을 고치는 대가로 감수한 좁은 조합이다(크로스리뷰 M1).
   * 같은 급 안의 인원 변동(3→4명 등)은 타일 크기가 안 변해
   * 재마운트하지 않고, 바 토글의 소폭 리사이즈도 제외한다 — 거기서 재마운트하면 FLIP
   * 연결이 끊기고, 실기기에서 토글 리사이즈는 이 증상을 내지 않았다.
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
      {cameraOn && myVideo}
      {/* 1인 전체화면은 RoomTile을 쓰지 않지만 내 화면이므로 같은 상태 뱃지를 올린다(BY-427).
          가로의 좌측 세이프에어리어는 이 컨테이너가 이미 비켜서 있어 top만 고려한다. */}
      <SelfStateBadge
        state={selfState}
        studySeconds={focusSec}
        className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-3"
      />
    </div>
  ) : (
    <div
      data-testid="room-grid"
      // 스크롤은 커밋 없이 타일 rect를 바꾼다 — FLIP 기준을 버린다(위 invalidateFlipRects).
      onScroll={invalidateFlipRects}
      // 스크롤 컨테이너 자신은 정렬하지 않는다 — content-center/end는 내용이 컨테이너보다
      // 커지는 순간 위로 넘친 행이 잘리고 스크롤로도 닿을 수 없다(flexbox 정렬 data loss,
      // 2026-08-25 실기기: 작은 화면에서 첫 행(내 타일+참가자)이 사라짐). 정렬은 아래
      // rows 래퍼의 auto 마진이 담당한다 — 넘치면 마진이 0으로 접혀 위부터 스크롤된다.
      className={cn(
        "flex grow flex-col overflow-y-auto px-1 pt-[calc(env(safe-area-inset-top)+12px)]",
        // 가로 배치(BY-441, 2026-08-26 확정): 세로와 **같은 flex-wrap 묶음 배치**다 —
        // 타일들이 gap-1(4px)로 붙어 그룹째 중앙 정렬되고, 타일 크기는 세로 비율을
        // 눕힌 직사각(2명 정사각·3~4명 3:2·5~6명 5:4)을 dvh 높이로 고정해 2명 1행
        // 2열 / 3~4명 2행 2열 / 5~6명 2행 3열로 자연 줄바꿈된다(아래 타일 클래스의
        // 폭·기기 검산 참고). 한때 그리드 셀 분배(1fr)를 썼지만 타일 양옆 셀 잔여
        // 공간이 카메라 사이 시각 여백으로 남아 "간격을 세로처럼"이라는 피드백을
        // 충족하지 못했다 — 셀 stretch 와이드 타일(상대가 보는 크롭과 전혀 다른
        // 프레이밍)로도 되돌리지 않는다. 캡처 비율 제약은 화각만 줄이는 순손해라
        // 금지(visionConfig.ts CAMERA_CONSTRAINTS 주석) — 프레이밍은 표시 단계인
        // 여기서만 만든다. 7명 이상은 3행으로 줄바꿈돼 세로 스크롤.
        "landscape:pl-[calc(env(safe-area-inset-left)+16px)] landscape:pr-[calc(env(safe-area-inset-right)+16px)]",
        // 바 표시용 하단 예약(108px)은 **세로 2명만** 쓴다(2026-08-26 피드백) —
        // 3명 이상은 바가 올라와도 타일 배치가 그대로이고 바가 타일 위로 겹친다
        // (가로의 pb-2와 같은 정책). 2명은 큰 타일이 바에 깊이 가려져 예약을 유지
        // — 그룹이 줄어든 공간의 가운데로 조금 올라가는 움직임만 남는다(FLIP이 잇는다).
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
                ? cn(
                    // height는 트랜지션하지 않는다 — 영상 타일의 레이아웃 애니메이션은
                    // 매 프레임 리플로우라 실기기에서 랙이 났다(2026-08-25). 변화 폭을
                    // 2dvh로 좁히고(2026-08-26 피드백: 41↔36dvh는 너무 확 줄었다) 시각적
                    // 이동은 FLIP effect(위)가 transform으로 잇는다. 37dvh는 바가
                    // 올라온 상태에서 2행+바가 노치 기기에도 수납되는 상한이다.
                    "aspect-square max-w-full",
                    controlsVisible ? "h-[37dvh]" : "h-[39dvh]",
                  )
                : cn(
                    // 3명 이상도 전부 정사각(2026-08-26 디스코드 참조 확정 — 종전
                    // 2:3/4:5 세로형·눕힌형을 대체). 세로 2열에서 정사각은 세로형보다
                    // 행이 낮아져 5~6명 3행도 스크롤 없이 수납된다.
                    // 5~6명 폭은 바와 무관하게 47% 고정(2026-08-26 피드백: 바 토글로
                    // 작아지지 않게) — SE 검산: 바 표시 시 3행 518 ≤ 가용 527 ✓
                    // (50%면 552로 넘쳐 스크롤이 생긴다 — 47이 상한).
                    "aspect-square",
                    allMembers.length > 4 ? "w-[calc(47%-2px)]" : "w-[calc(50%-2px)]",
                  ),
              // 가로 크기: 정사각을 dvh/폭 예산 높이로 고정한다(컨테이너 주석 참고 —
              // flex-wrap 줄바꿈이 이 폭으로 결정되므로 기기 검산이 계약. 폭 예산 =
              // (100dvw − 좌우 세이프 인셋 − 좌우 패딩 32px − 간격) / 열수):
              // · 2명(1행 2열): h=min(88dvh, 폭 예산/2 − 18px 몫). iPhone 13(844×390)
              //   min(343,370)=343 → 2장 690 ≤ 718 ✓ / SE(667×375) min(330,315)=315 ✓.
              // · 3명(1행 3열): min(84dvh, (…−40px)/3) — 13: 245 ✓ / SE: 209 ✓.
              // · 4명(1행 4열): min(84dvh, (…−44px)/4) — 13: 183 ✓ / SE: 155 ✓.
              // · 5~6명(2행, 3+2/3+3): 44dvh — 2행 92dvh ≤ 세로 예산 ✓, 3장 폭
              //   13: 524 ≤ 718 ✓ / SE: 503 ≤ 635 ✓. 3열 강제는 rows 래퍼의
              //   landscape:max-w가 담당한다(4+1로 감기는 것 방지).
              // 바 표시에 따른 세로 모드의 축소(2명 37dvh)는 가로에 적용되지
              // 않는다 — 가로 크기는 바와 무관해 토글이 레이아웃을 안 바꾼다.
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
