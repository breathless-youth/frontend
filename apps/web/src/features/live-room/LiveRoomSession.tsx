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
  const measurePreviewAspect = useCallback(() => {
    const rect = selfSurfaceRef.current?.getBoundingClientRect();
    setPreviewAspect(rect !== undefined && rect.height > 0 ? rect.width / rect.height : null);
  }, []);
  // 모달이 열린 채 회전하면 셀프뷰 서피스 비율이 바뀐다(가로 3:2 등) — 열 때 한 번 잰
  // 값이 낡아 세로 레터박스가 가로에 그대로 남았다(2026-08-25 실기기). 열려 있는 동안
  // 리사이즈(회전)마다 다시 잰다. iOS 회전은 resize 시점에 레이아웃이 아직 정착 전이라
  // 즉시 읽으면 중간 치수가 잡힌다 — 다음 프레임에 재고, 정착 지연 대비로 350ms 뒤
  // 한 번 더 잰다(가로에서 바로 열었을 때와 크기가 달랐던 원인).
  useEffect(() => {
    if (!cameraDialogOpen) {
      return;
    }
    let raf = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measurePreviewAspect();
        if (settleTimer !== null) {
          clearTimeout(settleTimer);
        }
        settleTimer = setTimeout(measurePreviewAspect, 350);
      });
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      cancelAnimationFrame(raf);
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
      }
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, [cameraDialogOpen, measurePreviewAspect]);
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

  // 컨트롤 바 탭 토글(BY-435 디스코드 패턴) — 화면 탭이 바를 올리고, 자동으로 내려가지
  // 않으며, 한 번 더 탭하면 내려간다(종전 4초 유휴 자동 숨김 대체). 입장 직후는 숨김
  // 상태로 시작해 타일만 있는 몰입 화면이다. 잠금(제출 중·에러)·다이얼로그 동안은 항상
  // 보인다. 바 자체 조작은 RoomControlBar가 pointerdown 버블을 끊어 토글로 새지 않는다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen;
  // 입장 직후에는 보인다(2026-08-25 피드백 — 조작법을 먼저 보여준다). 탭으로 내리면
  // 이름·목표도 함께 숨어 시간만 남는 몰입 화면이 된다(RoomTile infoHidden).
  const [controlsShown, setControlsShown] = useState(true);
  const controlsVisible = controlsAlwaysVisible || controlsShown;
  const handleSurfacePointerDown = () => {
    // 강제 표시 구간의 탭(다이얼로그 배경 등)이 숨김 상태를 뒤집어 두면, 구간이 끝나는
    // 순간 바가 예고 없이 내려간다 — 토글은 일반 구간에서만 받는다.
    if (!controlsAlwaysVisible) {
      setControlsShown((prev) => !prev);
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
            // 타일 배치(BY-435) — 비율·간격은 실기기 스크린샷 0352 기준: 약 2:3 세로형
            // 라운드 타일(모서리는 기존 radius), 그룹 세로 가운데. 간격은 4px까지 좁혀 꽉 채운다
            // (2026-08-25 피드백 — 20px → 8px → 4px).
            // flex-wrap justify-center가 홀수 인원(3·5명)의 마지막 타일을 자동으로 가운데
            // 놓는다(2+1, 2+2, 2+2+1, 2+2+2). 4명까지는 세로 가운데, 5명+는 짧은 화면에서
            // 가운데 정렬이 스크롤 시작을 잘라먹지 않게 위 정렬. 디스코드 참조는 플로팅 바
            // 동작(탭 토글·축소)만이다 — 바가 올라오면 하단을 바만큼 벌리고 살짝(0.98) 준다
            // (바-타일 간격은 2026-08-25 피드백으로 축소 — 105px → 100px). 트랜지션은 transform만:
            // padding·height 애니메이션은 영상 리플로우로 랙을 만든다.
            className={`flex grow flex-wrap justify-center gap-1 overflow-y-auto px-1 pt-[calc(env(safe-area-inset-top)+12px)] transition-transform duration-300 motion-reduce:transition-none landscape:pl-[calc(env(safe-area-inset-left)+16px)] landscape:pr-[calc(env(safe-area-inset-right)+16px)] ${
              // 바가 떠 있으면 타일을 바 바로 위에 붙인다(content-end, 여백 ≈ 11px) —
              // 가운데 정렬의 잔여 공간이 바-타일 간격으로 보여 크게 느껴졌다(2026-08-25).
              // 넘치는 인원은 스크롤 시작이 잘리지 않게 위 정렬 유지.
              allMembers.length > 4
                ? "content-start"
                : controlsVisible
                  ? "content-end"
                  : "content-center"
            } ${
              controlsVisible
                ? "scale-[0.98] pb-[calc(env(safe-area-inset-bottom)+108px)]"
                : "pb-[4dvh]"
            }`}
          >
            {allMembers.map((member) => (
              <RoomTile
                key={member.userId}
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
                        // 매 프레임 리플로우라 실기기에서 랙이 났다(2026-08-25). 크기는 즉시
                        // 바뀌고 부드러움은 그리드 scale 트랜지션이 담당한다.
                        "aspect-square max-w-full",
                        controlsVisible ? "h-[36dvh]" : "h-[41dvh]",
                      )
                    : cn(
                        // 3~4명은 0352 비율(2:3). 5~6명은 2:3이면 3행(990px)이 세로 화면을
                        // 넘어 스크롤이 되고, 첫 행(내 타일+첫 참가자)이 밀려 안 보이는 사고가
                        // 났다(2026-08-25 실기기 roomId=143) — 4:5로 눕혀 3행이 화면에 들어간다.
                        allMembers.length <= 4 ? "aspect-[2/3]" : "aspect-[4/5]",
                        "w-[calc(50%-2px)] landscape:aspect-[3/2] landscape:w-[calc(33.3%-4px)]",
                      ),
                )}
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
