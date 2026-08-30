import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { IceServer, ProfileResponse, RoomMember } from "@focusmakers/types";

import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import { ClonedTrackPreview } from "@/features/live-room/components/ClonedTrackPreview";
import { RoomControlBar } from "@/features/live-room/components/RoomControlBar";
import { RoomDebugOverlay } from "@/features/live-room/components/RoomDebugOverlay";
import { RoomGrid } from "@/features/live-room/components/RoomGrid";
import type { SelfBadgeState } from "@/features/live-room/components/RoomTile";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { roomGridSpec } from "@/features/live-room/roomGrid";
import { orderedMembers, roomMembersReducer } from "@/features/live-room/roomMembersReducer";
import { usePeerMesh } from "@/features/live-room/usePeerMesh";
import { useRoomStatePublisher } from "@/features/live-room/useRoomStatePublisher";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import { createSystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";
import {
  combineFocusDetectors,
  createVisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { resolveLiveRoomDoneNavigation } from "@/features/live-room/liveRoomEndNavigation";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { SUB_MINUTE_SEC } from "@/features/study-session/formatDuration";
import { EXIT_CONFIRM_COPY, exitConfirmDescription } from "@/features/study-session/sessionCopy";
import { MANUAL_END_REASON, autoEndReason } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { useNativeBackGestureLock, useNativeBackLock } from "@/lib/nativeBackGesture";
import { leaveRoom } from "@/lib/roomApi";
import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";
import { cn } from "@/lib/utils";
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { kickVideoPlayback, useGestureVideoPlaybackKick } from "@/lib/videoPlayback";

import type { CreateChannel } from "./liveRoomEntryState";
import { useBackgroundGraceWatch } from "./useBackgroundGraceWatch";
import { useCameraPreviewAspect } from "./useCameraPreviewAspect";
import { useTapToggleControls } from "./useTapToggleControls";

export const GRACE_END_SAVED_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.";
export const GRACE_END_PENDING_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되니 안심하세요.";
// 두 번째 문장은 줄을 바꿔 보여준다(2026-08-26 실기기 확인 피드백) — Toast가 pre-line이다.
export const GRACE_END_SUB_MINUTE_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요";

export function LiveRoomSession({
  roomId,
  userId,
  createChannel,
  camera,
  createPeerConnection,
  iceServers,
  profile,
  restored,
}: {
  roomId: number;
  userId: number;
  createChannel: CreateChannel;
  camera: CameraAdapter;
  createPeerConnection?: CreatePeerConnection;
  iceServers: IceServer[];
  profile: ProfileResponse | null;
  /** 서버에서 받아 온 진행중 세션. 있으면 그 값에서 이어서 시작한다. */
  restored: RestoredSession | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // 뒤로가기로 이탈하면 제출 없이 측정이 유실되므로,
  // 세션 동안 iOS 스와이프와 Android 하드웨어 뒤로가기를 모두 잠근다.
  // (세션 종료는 나가기 버튼으로만 가능하다)
  useNativeBackGestureLock();
  useNativeBackLock();
  // 저전력 모드에서 멈춘 영상을 탭 제스처로 되살린다 — lib/videoPlayback.ts 주석 참고.
  useGestureVideoPlaybackKick();
  // iOS 회전 백지(세로 복귀 시 순백 화면) 방어 — lib/rotationRepaint.ts 주석 참고.
  useRotationRepaintNudge();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [devDetector] = useState(() => resolveDevDetectorOverride(searchParams.get("detector")));
  const [visionDetector] = useState(() =>
    createVisionFocusDetector({ video: () => videoRef.current }),
  );
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  // 세션 훅과 유예 감시가 같은 신호원을 본다 — 어댑터를 따로 만들면 복귀 재계산과
  // 유예 판정이 다른 이벤트 순서를 탈 수 있다(usePauseAutoEnd의 같은 원칙).
  const [systemPause] = useState(() => createSystemPauseSource());
  const {
    focusSec,
    sessionState,
    phase,
    endReason,
    isCameraRunning,
    cameraStream,
    cameraFacing,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { camera, detector, systemPause, restored });

  // 카메라·감지기와 같은 지연 초기화 패턴 — createChannel prop이 매 렌더 새 클로저여도
  // 채널은 세션 수명 동안 하나다. useMemo면 부모 리렌더가 세션 중 STOMP 재연결을 일으킨다.
  const [channel] = useState(() => createChannel({ roomId, userId }));
  // 카메라를 켜 둘 사용자 의도 — 토글이 즉시 바꾼다. pause/resume은 effect를 거쳐
  // 한 렌더 늦게 반영되므로, 발행값은 이 동기값과 실제 획득 상태로 계산한다.
  // 유예 재입장을 포함해 **모든 입장은 카메라 꺼짐(일시정지)으로 시작한다** — 나가기 자체가
  // 일시정지이므로 30초 안에 돌아와도 그 상태가 이어지는 것이 맞다(BY-412).
  const [cameraWanted, setCameraWanted] = useState(false);
  const [members, dispatch] = useReducer(roomMembersReducer, [] as RoomMember[]);
  useEffect(() => channel.subscribe(dispatch), [channel]);

  // 유예를 넘긴 복귀 — 서버가 자리를 회수했을 수 있는 시점이라 이어가지 않고 종료한다.
  // disconnect를 먼저 해 STOMP 자동 재연결(재구독=서버 복원 트리거)과의 경쟁을 끊는다.
  // 만료 사실은 종료 사유가 아니라 이 상태로 기억한다 — 수동 일시정지 중 오래 숨었다
  // 돌아오면 공용 20분 감시자가 MANUAL 사유로 먼저 종료시킬 수 있는데, 그때도 안내와
  // 이동은 유예 만료 취급이어야 한다(같은 복귀 이벤트에서 이 콜백이 이어서 돈다).
  const [graceExpired, setGraceExpired] = useState(false);
  const handleGraceExpire = useCallback(() => {
    setGraceExpired(true);
    channel.disconnect();
    void endAndSubmit(autoEndReason("BACKGROUND"));
  }, [channel, endAndSubmit]);
  const { isExpiredNow } = useBackgroundGraceWatch({
    enabled: phase.name === "studying",
    onExpire: handleGraceExpire,
    systemPause,
  });

  const debugEnabled = import.meta.env.DEV;
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [peerPaths, setPeerPaths] = useState<ReadonlyMap<number, string>>(() => new Map());
  const onDebugEvent = debugEnabled
    ? (line: string) => {
        const path = /^path (\d+): (\S+)$/.exec(line);
        if (path) {
          setPeerPaths((prev) => new Map(prev).set(Number(path[1]), path[2] ?? ""));
        }
        setDebugLines((prev) => [...prev.slice(-11), line]);
      }
    : undefined;

  const remoteStreams = usePeerMesh({
    channel,
    myUserId: userId,
    iceServers,
    cameraStream,
    trackEnabled: sessionState.kind !== "PAUSE",
    createPeerConnection,
    onEvent: onDebugEvent,
  });

  // 연결과 해제를 한 effect에 대칭으로 둔다 — StrictMode의 마운트-해제-재마운트에서도
  // 두 번째 마운트가 정상 연결된다.
  useEffect(() => {
    channel.connect();
    pause("MANUAL");
    return () => {
      channel.disconnect();
    };
  }, [channel, pause]);

  // 추론 수명 — 측정 중이고 일시정지가 아닐 때만 감지한다(솔로 세션과 같은 규칙).
  const detectionEnabled = phase.name === "studying" && sessionState.kind !== "PAUSE";
  useEffect(() => {
    if (detectionEnabled) {
      detector.start();
    } else {
      detector.stop();
    }
  }, [detectionEnabled, detector]);

  useEffect(() => {
    return () => {
      visionDetector.close();
    };
  }, [visionDetector]);

  // 표시용 카메라 상태는 획득 실패(권한 거부 등)도 꺼짐으로 취급한다 — 검은 화면을
  // 켜짐으로 그리지 않는다. 컨트롤은 일시정지 여부만 본다: 룸의 카메라 끔 = 측정
  // 일시정지와 동일하고, 획득 실패의 온전한 처리(수동 타이머 모드)는 별도 티켓이다.
  const paused = sessionState.kind === "PAUSE";
  const cameraOn = !paused && isCameraRunning;

  // 내 타일 전용 상태 뱃지(BY-427) — 서버 발행값이 아니라 로컬 세션 값에서 유도한다.
  // 카메라 끔 = 측정 일시정지 동치라 paused가 최우선이다.
  const selfState: SelfBadgeState = paused
    ? "PAUSED"
    : sessionState.kind === "DISTRACTION"
      ? "DISTRACTED"
      : "FOCUS";

  // 서버에 알리는 카메라 상태 — 사용자 의도(cameraWanted)를 함께 본다. 끄고 입장의
  // 첫 렌더는 pause가 effect로 적용되기 전이라, paused만 보면 켜짐이 먼저 새 나간다.
  useRoomStatePublisher(channel, {
    sessionState,
    focusSec,
    cameraOn: cameraWanted && cameraOn,
  });

  // 내 타일은 로컬 세션 값 기준
  const serverMe = members.find((m) => m.userId === userId);
  const myMember: RoomMember = {
    userId,
    nickname: profile?.nickname ?? serverMe?.nickname ?? "나",
    goal: profile?.goal ?? serverMe?.goal ?? null,
    cameraOn,
    focusState: sessionState.kind === "DISTRACTION" ? "DISTRACTED" : "FOCUS",
    studySeconds: focusSec,
  };
  const others = members.filter((m) => m.userId !== userId);
  const allMembers = orderedMembers([myMember, ...others], userId);
  const grid = roomGridSpec(allMembers.length);

  // 표시용과 ai추론용은 같은 video 엘리먼트를 본다
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== cameraStream) {
      video.srcObject = cameraStream ?? null;
      if (cameraStream) {
        startVideoPlayback(video);
      }
    }
    // autoplay 속성만으로는 iOS WKWebView에서 재생이 시작되지 않을 수 있다 —
    // 사유·재시도 규칙은 kickVideoPlayback 주석 참고(2026-08-26 실기기).
    if (video) {
      kickVideoPlayback(video);
    }
  });

  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const { selfSurfaceRef, previewAspect, measurePreviewAspect } =
    useCameraPreviewAspect(cameraDialogOpen);
  const leavingRef = useRef(false);

  // 순공 1분 미만은 기록 목록·합산에 표시되지 않는다 — 저장을 약속하면 화면이 거짓말이
  // 된다(sessionCopy.SUB_MINUTE_EXIT_DESCRIPTION과 같은 원칙). 제출은 그래도 한다.
  const graceEndNotice = useCallback(
    (submitted: boolean) =>
      focusSec < SUB_MINUTE_SEC
        ? GRACE_END_SUB_MINUTE_MESSAGE
        : submitted
          ? GRACE_END_SAVED_MESSAGE
          : GRACE_END_PENDING_MESSAGE,
    [focusSec],
  );

  // 제출 성공 → 퇴장 알림은 응답을 기다리지 않는다. 백그라운드 자동 종료(유예 만료)는
  // 제출이 실패해도 내보낸다 — 보관분이 다음 실행에서 재제출된다. 안내는 도착지(소셜
  // 홈)가 띄우므로 sessionStorage 1회성 플래그로 넘긴다. 실패 이탈은 leaveRoom을
  // 부르지 않는다 — 유예가 끝났으면 서버가 이미 자리를 회수했다.
  useEffect(() => {
    if (leavingRef.current) {
      return;
    }
    // 숨어 있는 동안 공용 20분 감시자가 먼저 종료를 끝내면 만료 콜백이 오지 않는다 —
    // 이동 시점에 숨김 경과를 다시 물어 그 순서에서도 만료 취급이 빠지지 않게 한다.
    const expired = graceExpired || isExpiredNow();
    if (phase.name === "done") {
      leavingRef.current = true;
      const nav = resolveLiveRoomDoneNavigation({
        expired,
        endReason,
        focusSec,
        sessions: phase.sessions,
      });
      void leaveRoom(roomId, userId).catch(() => undefined);
      if (nav.to === "result") {
        navigate(
          { pathname: `/social/room/${roomId}/result`, search: location.search },
          { replace: true, state: { sessions: nav.sessions } },
        );
        return;
      }
      if (expired) {
        markSocialRoomNotice(graceEndNotice(true));
      }
      navigate(
        { pathname: "/social", search: location.search },
        { replace: true, state: { noticeHandoff: true } },
      );
      return;
    }
    if (phase.name === "error" && expired) {
      leavingRef.current = true;
      markSocialRoomNotice(graceEndNotice(false));
      navigate(
        { pathname: "/social", search: location.search },
        { replace: true, state: { noticeHandoff: true } },
      );
    }
  }, [
    endReason,
    focusSec,
    graceEndNotice,
    graceExpired,
    isExpiredNow,
    location.search,
    navigate,
    phase,
    roomId,
    userId,
  ]);

  const myVideo = (
    // 셀프뷰 보정(BY-427 시안 A): brightness/saturate 필터는 이 <video>의 **로컬 렌더링에만**
    // 적용된다 — P2P 송신 트랙(cameraStream)은 필터를 거치지 않고 원본 그대로 나간다.
    <video
      ref={videoRef}
      data-testid="room-my-video"
      playsInline
      muted
      {...VIDEO_PLAYBACK_KICK_PROPS}
      // cover 고정(2026-08-26 디스코드 참조 확정): 정사각 타일에서는 가로·세로 송신자
      // 모두 긴 축이 대칭(~44%)으로 잘려 방향 혼합의 프레이밍 차이가 온건하다 —
      // 방향별 제한 크롭·레터박스 실험(useAdaptiveVideoFit)은 이 결정으로 걷어냈다.
      className={cn(
        // pointer-events-none: 탭이 video에 직접 닿으면 iOS가 네이티브 재생/일시정지
        // 컨트롤을 띄운다 — 탭은 아래 레이어(유휴 복귀)로 통과시킨다.
        "amp-block sentry-block pointer-events-none size-full object-cover [filter:brightness(1.06)_saturate(1.1)]",
        cameraFacing === "front" && "scale-x-[-1]",
      )}
    />
  );
  const dialogOpen = cameraDialogOpen || exitDialogOpen;
  const controlsLocked = phase.name !== "studying";

  // 잠금(제출 중·에러)·다이얼로그 동안은 컨트롤을 강제로 보인다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen;
  const { controlsVisible, onPointerDown, onPointerUp } =
    useTapToggleControls(controlsAlwaysVisible);

  return (
    <main
      data-testid="live-room-page"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      // overflow-hidden: 자동 숨김으로 화면 밖까지 내려간 컨트롤 바(BY-435)를 잘라
      // 문서 스크롤이 생기지 않게 한다.
      className="relative flex h-dvh flex-col overflow-hidden bg-background"
      style={sessionSurfaceStyle}
    >
      {debugEnabled && (
        <RoomDebugOverlay
          roomId={roomId}
          userId={userId}
          channelStatus={channel.status}
          members={members}
          remoteStreams={remoteStreams}
          peerPaths={peerPaths}
          lines={debugLines}
        />
      )}
      {/* 다이얼로그가 열리면 배경 전체를 inert로 — 포커스가 뒤로 새지 않는다. */}
      <div className="contents" inert={dialogOpen}>
        <RoomGrid
          grid={grid}
          allMembers={allMembers}
          userId={userId}
          controlsVisible={controlsVisible}
          selfState={selfState}
          focusSec={focusSec}
          cameraOn={cameraOn}
          myVideo={myVideo}
          remoteStreams={remoteStreams}
          selfSurfaceRef={selfSurfaceRef}
        />

        {/* 가로는 바를 11px 더 낮게(17→6px) — 세로 기준 오프셋이 가로에선 높아 보인다
            (2026-08-26 피드백). 숨김 슬라이드 이동량은 +17px 기준이라 가로에서도 화면
            밖까지 충분히 나간다(RoomControlBar의 translate 주석). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+17px)] landscape:bottom-[calc(env(safe-area-inset-bottom)+6px)] flex flex-col items-center gap-2">
          {phase.name === "submitting" && <p className="text-sm text-white/80">저장 중...</p>}
          {phase.name === "error" && (
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              <p className="text-sm text-[var(--session-exit-bg)]">{phase.message}</p>
              <button
                type="button"
                onClick={() => void endAndSubmit()}
                className="min-h-11 rounded-full bg-white/12 px-5 text-sm font-semibold text-white"
              >
                다시 제출
              </button>
            </div>
          )}
          {/* "저장 중..."·"다시 제출"은 숨김 대상이 아니다 — 바만 아래로 내려간다. */}
          <RoomControlBar
            cameraOn={!paused}
            disabled={controlsLocked}
            hidden={!controlsVisible}
            onToggleCamera={() => {
              if (!paused) {
                setCameraWanted(false);
                pause("MANUAL");
              } else {
                measurePreviewAspect();
                setCameraDialogOpen(true);
              }
            }}
            onFlipCamera={() => void flipCamera()}
            onExit={() => setExitDialogOpen(true)}
          />
        </div>
      </div>

      {cameraDialogOpen && (
        <CameraOnConfirmDialog
          preview={
            <ClonedTrackPreview
              stream={cameraStream}
              facing={cameraFacing}
              targetAspect={previewAspect ?? undefined}
            />
          }
          onCancel={() => setCameraDialogOpen(false)}
          onConfirm={() => {
            setCameraDialogOpen(false);
            setCameraWanted(true);
            resume();
          }}
        />
      )}
      {exitDialogOpen && (
        <SessionConfirmDialog
          title={EXIT_CONFIRM_COPY.title}
          description={exitConfirmDescription(focusSec)}
          cancelLabel={EXIT_CONFIRM_COPY.cancel}
          confirmLabel={EXIT_CONFIRM_COPY.confirm}
          onCancel={() => setExitDialogOpen(false)}
          onConfirm={() => {
            setExitDialogOpen(false);
            void endAndSubmit(MANUAL_END_REASON);
          }}
        />
      )}
    </main>
  );
}
