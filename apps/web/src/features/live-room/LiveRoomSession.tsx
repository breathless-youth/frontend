import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { IceServer, ProfileResponse, RoomMember } from "@focusmakers/types";

import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import { ClonedTrackPreview } from "@/features/live-room/components/ClonedTrackPreview";
import { RemoteVideo } from "@/features/live-room/components/RemoteVideo";
import { RoomControlBar } from "@/features/live-room/components/RoomControlBar";
import { RoomDebugOverlay } from "@/features/live-room/components/RoomDebugOverlay";
import { RoomTile, SelfStateBadge } from "@/features/live-room/components/RoomTile";
import type { SelfBadgeState } from "@/features/live-room/components/RoomTile";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { roomGridSpec } from "@/features/live-room/roomGrid";
import { orderedMembers, roomMembersReducer } from "@/features/live-room/roomMembersReducer";
import { usePeerMesh } from "@/features/live-room/usePeerMesh";
import { useRoomStatePublisher } from "@/features/live-room/useRoomStatePublisher";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import {
  combineFocusDetectors,
  createVisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { EXIT_CONFIRM_COPY, exitConfirmDescription } from "@/features/study-session/sessionCopy";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { useNativeBackGestureLock, useNativeBackLock } from "@/lib/nativeBackGesture";
import { leaveRoom } from "@/lib/roomApi";
import { cn } from "@/lib/utils";

import type { CreateChannel } from "./liveRoomEntryState";

/** 컨트롤 바 자동 숨김 유휴 시간(ms) — 2026-08-25 BY-427 시안 B. */
const CONTROL_BAR_IDLE_MS = 4000;

function remoteVideoOrUndefined(userId: number, streams: ReadonlyMap<number, MediaStream>) {
  const stream = streams.get(userId);
  if (!stream) {
    return undefined;
  }
  return <RemoteVideo userId={userId} stream={stream} />;
}

export function LiveRoomSession({
  roomId,
  userId,
  createChannel,
  camera,
  createPeerConnection,
  iceServers,
  initialCameraOn,
  profile,
}: {
  roomId: number;
  userId: number;
  createChannel: CreateChannel;
  camera: CameraAdapter;
  createPeerConnection?: CreatePeerConnection;
  iceServers: IceServer[];
  initialCameraOn: boolean;
  profile: ProfileResponse | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // 뒤로가기로 이탈하면 제출 없이 측정이 유실되므로,
  // 세션 동안 iOS 스와이프와 Android 하드웨어 뒤로가기를 모두 잠근다.
  // (세션 종료는 나가기 버튼으로만 가능하다)
  useNativeBackGestureLock();
  useNativeBackLock();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [devDetector] = useState(() => resolveDevDetectorOverride(searchParams.get("detector")));
  const [visionDetector] = useState(() =>
    createVisionFocusDetector({ video: () => videoRef.current }),
  );
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  const {
    focusSec,
    sessionState,
    phase,
    isCameraRunning,
    cameraStream,
    cameraFacing,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { camera, detector });

  // 카메라·감지기와 같은 지연 초기화 패턴 — createChannel prop이 매 렌더 새 클로저여도
  // 채널은 세션 수명 동안 하나다. useMemo면 부모 리렌더가 세션 중 STOMP 재연결을 일으킨다.
  const [channel] = useState(() => createChannel({ roomId, userId }));
  // 카메라를 켜 둘 사용자 의도 — 토글이 즉시 바꾼다. pause/resume은 effect를 거쳐
  // 한 렌더 늦게 반영되므로, 발행값은 이 동기값과 실제 획득 상태로 계산한다.
  const [cameraWanted, setCameraWanted] = useState(initialCameraOn);
  const [members, dispatch] = useReducer(roomMembersReducer, [] as RoomMember[]);
  // 유예 재입장이면 서버가 보존한 내 studySeconds가 첫 SNAPSHOT에 실려 온다 — 이 값을
  // 기준으로 표시·발행을 이어간다. 일반 입장은 0이라 동작이 같다. 첫 값만 쓴다:
  // 재연결 SNAPSHOT에는 내 발행이 반영돼 있어 다시 읽으면 이중 가산된다.
  const [baseStudySeconds, setBaseStudySeconds] = useState<number | null>(null);
  useEffect(
    () =>
      channel.subscribe((message) => {
        if (message.type === "SNAPSHOT") {
          setBaseStudySeconds(
            (prev) => prev ?? message.members.find((m) => m.userId === userId)?.studySeconds ?? 0,
          );
        }
        dispatch(message);
      }),
    [channel, userId],
  );

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
    if (!initialCameraOn) {
      pause("MANUAL");
    }
    return () => {
      channel.disconnect();
    };
  }, [channel, initialCameraOn, pause]);

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

  // 제출 경로는 보정하지 않는다 — 룸 채널은 표시용이고, 제출은 이번 마운트 측정값만 나간다.
  // 기준값이 오기 전에는 null — 발행자가 틱을 쉬어, 연결 지연 시 0 기준의 낡은 값이
  // 채널 버퍼를 타고 서버 보존값을 덮어쓰는 것을 막는다.
  const displayFocusSec = baseStudySeconds === null ? null : baseStudySeconds + focusSec;

  // 서버에 알리는 카메라 상태 — 사용자 의도(cameraWanted)를 함께 본다. 끄고 입장의
  // 첫 렌더는 pause가 effect로 적용되기 전이라, paused만 보면 켜짐이 먼저 새 나간다.
  useRoomStatePublisher(channel, {
    sessionState,
    focusSec: displayFocusSec,
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
    studySeconds: displayFocusSec ?? focusSec,
  };
  const others = members.filter((m) => m.userId !== userId);
  const allMembers = orderedMembers([myMember, ...others], userId);
  const grid = roomGridSpec(allMembers.length);

  // 표시용과 ai추론용은 같은 video 엘리먼트를 본다
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== cameraStream) {
      video.srcObject = cameraStream ?? null;
    }
  });

  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  // 켜기 모달 미리보기가 실제 셀프뷰와 같은 영역이 잘리도록, 셀프뷰가 놓일 서피스
  // (1인 풀스크린 컨테이너 또는 내 타일)를 모달 여는 순간 재서 비율을 넘긴다 — 모달
  // 박스(288×234)와 서피스는 비율이 크게 달라 cover 크롭이 다르게 잘렸다(2026-08-25).
  const selfSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [previewAspect, setPreviewAspect] = useState<number | null>(null);
  const leavingRef = useRef(false);

  // 제출 성공 → 퇴장 알림은 응답을 기다리지 않는다.
  useEffect(() => {
    if (phase.name !== "done" || leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    void leaveRoom(roomId, userId).catch(() => undefined);
    navigate({ pathname: "/social", search: location.search }, { replace: true });
  }, [location.search, navigate, phase.name, roomId, userId]);

  const myVideo = (
    // 셀프뷰 보정(BY-427 시안 A): brightness/saturate 필터는 이 <video>의 **로컬 렌더링에만**
    // 적용된다 — P2P 송신 트랙(cameraStream)은 필터를 거치지 않고 원본 그대로 나간다.
    <video
      ref={videoRef}
      data-testid="room-my-video"
      autoPlay
      playsInline
      muted
      className={cn(
        "amp-block sentry-block size-full object-cover [filter:brightness(1.06)_saturate(1.1)]",
        cameraFacing === "front" && "scale-x-[-1]",
      )}
    />
  );
  const dialogOpen = cameraDialogOpen || exitDialogOpen;
  const controlsLocked = phase.name !== "studying";

  // 컨트롤 바 자동 숨김 — 마지막 상호작용 후 4초가 지나면 바를 화면 아래로 슬라이드해
  // 내보내고 조작을 막는다(BY-435, 종전 BY-427 잔상 페이드 대체). 잠금(제출 중·에러)·
  // 다이얼로그 동안은 숨기지 않는다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen;
  const [controlsHidden, setControlsHidden] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFadeTimer = useCallback(() => {
    if (fadeTimerRef.current !== null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);
  const restartFadeTimer = useCallback(() => {
    clearFadeTimer();
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setControlsHidden(true);
    }, CONTROL_BAR_IDLE_MS);
  }, [clearFadeTimer]);
  useEffect(() => {
    if (controlsAlwaysVisible) {
      clearFadeTimer();
      setControlsHidden(false);
      return;
    }
    restartFadeTimer();
    return clearFadeTimer;
  }, [clearFadeTimer, controlsAlwaysVisible, restartFadeTimer]);

  // 화면 아무 곳 탭 = 즉시 복귀 + 유휴 타이머 재시작. 바 조작도 pointerdown 버블로 같이 잡힌다.
  // 숨은 바는 pointer-events가 꺼져 있어 그 탭은 복귀 트리거로만 동작한다.
  const handleSurfacePointerDown = () => {
    setControlsHidden(false);
    if (!controlsAlwaysVisible) {
      restartFadeTimer();
    }
  };

  return (
    <main
      data-testid="live-room-page"
      onPointerDown={handleSurfacePointerDown}
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
        {grid.mode === "fullscreen" ? (
          <div
            ref={selfSurfaceRef}
            className="absolute inset-0 bg-[var(--session-dialog-bg)] landscape:left-[calc(env(safe-area-inset-left)+16px)] landscape:right-[calc(env(safe-area-inset-right)+16px)] landscape:overflow-hidden landscape:rounded-3xl"
          >
            {cameraOn && myVideo}
            {/* 1인 전체화면은 RoomTile을 쓰지 않지만 내 화면이므로 같은 상태 뱃지를 올린다(BY-427).
                가로의 좌측 세이프에어리어는 이 컨테이너가 이미 비켜서 있어 top만 고려한다. */}
            <SelfStateBadge
              state={selfState}
              // 그리드의 내 타일(myMember.studySeconds)과 같은 값 — 유예 재입장 기준값 보정 포함.
              studySeconds={displayFocusSec ?? focusSec}
              className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-3"
            />
          </div>
        ) : (
          <div
            data-testid="room-grid"
            // gap은 4px로 아주 좁게(2026-08-25 피드백) — 행 높이 계산의 보정값(gap 합)도
            // 함께 맞춘다. 행이 화면을 다 채우지 못할 때(3~4명 = 2행)는 위 정렬 대신
            // content-center로 세로 가운데에 모은다 — 넘칠 때(7명+)는 스크롤 시작점이
            // 잘리지 않게 위 정렬을 유지한다.
            className={`grid grow gap-1 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[4dvh] landscape:pl-[calc(env(safe-area-inset-left)+16px)] landscape:pr-[calc(env(safe-area-inset-right)+16px)] ${
              Math.ceil(allMembers.length / grid.cols) <= grid.rowUnit ? "content-center" : ""
            } ${
              // 가로 행 높이는 rowUnit이 아니라 인원(cols)에서 갈린다 — A안으로 3~4명도
              // rowUnit 2가 되면서, rowUnit 기준이던 종전 매핑은 4명 가로를 1행 100%로
              // 잘못 키웠다. 2명(1열)만 가로 1행 100%, 3명 이상은 행 높이 1/2 + 스크롤.
              grid.cols === 1
                ? "grid-cols-1 landscape:grid-cols-2 landscape:[grid-auto-rows:100%]"
                : "grid-cols-2 landscape:[grid-auto-rows:calc((100%-4px)/2)]"
            } ${
              grid.rowUnit === 2
                ? "[grid-auto-rows:calc((100%-4px)/2)]"
                : "[grid-auto-rows:calc((100%-8px)/3)]"
            }`}
          >
            {allMembers.map((member) => (
              <RoomTile
                key={member.userId}
                member={member}
                rootRef={member.userId === userId ? selfSurfaceRef : undefined}
                selfState={member.userId === userId ? selfState : undefined}
                media={
                  member.userId === userId
                    ? myVideo
                    : remoteVideoOrUndefined(member.userId, remoteStreams)
                }
              />
            ))}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+17px)] flex flex-col items-center gap-2">
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
            hidden={controlsHidden}
            onToggleCamera={() => {
              if (!paused) {
                setCameraWanted(false);
                pause("MANUAL");
              } else {
                const rect = selfSurfaceRef.current?.getBoundingClientRect();
                setPreviewAspect(
                  rect !== undefined && rect.height > 0 ? rect.width / rect.height : null,
                );
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
