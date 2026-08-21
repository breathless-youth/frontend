import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { ProfileResponse, RoomMember } from "@focusmakers/types";

import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import { RoomControlBar } from "@/features/live-room/components/RoomControlBar";
import { RoomTile } from "@/features/live-room/components/RoomTile";
import { createMockRoomChannel } from "@/features/live-room/mockRoomChannel";
import type { RoomChannel } from "@/features/live-room/roomChannel";
import { roomGridSpec } from "@/features/live-room/roomGrid";
import { orderedMembers, roomMembersReducer } from "@/features/live-room/roomMembersReducer";
import { createStompRoomChannel } from "@/features/live-room/stompRoomChannel";
import { joinErrorMessage } from "@/features/social-room/joinErrorCopy";
import { useRoomStatePublisher } from "@/features/live-room/useRoomStatePublisher";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import {
  combineFocusDetectors,
  createVisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { EXIT_CONFIRM_COPY, exitConfirmDescription } from "@/features/study-session/sessionCopy";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { joinRoom, leaveRoom } from "@/lib/roomApi";
import { profileQuery } from "@/lib/profileQueries";
import { parseUserId } from "@/lib/userId";

/**
 * 실시간 룸 — 초대코드로 입장한 뒤의 룸 내부.
 *
 * 입장 확인 단계와 세션이 컴포넌트로 분리돼 있다. 확인 모달에서 머문 시간이 순공시간으로
 * 집계되면 안 되므로, 측정 훅은 입장이 확정된 뒤에만 마운트된다. 프로필 조회도 같은 이유로
 * 입장 단계에서만 한다 — 세션 중 API 호출 금지 계약.
 */
type LiveRoomLocationState = {
  inviteCode: string;
  graceRejoin?: boolean;
  cameraOn?: boolean | null;
};

function isLiveRoomState(state: unknown): state is LiveRoomLocationState {
  return (
    typeof state === "object" &&
    state !== null &&
    typeof (state as LiveRoomLocationState).inviteCode === "string"
  );
}

type CreateChannel = (options: { roomId: number; userId: number }) => RoomChannel;
type CreateCamera = () => CameraAdapter;

/** DEV 전용 — ?mockRoom=N이면 N명이 차례로 입장하는 mock 채널로 화면을 시연한다. */
function resolveChannelFactory(searchParams: URLSearchParams): CreateChannel {
  const mockCount = Number(searchParams.get("mockRoom"));
  if (import.meta.env.DEV && Number.isInteger(mockCount) && mockCount > 0) {
    return () =>
      createMockRoomChannel({
        snapshot: [],
        steps: Array.from({ length: Math.min(mockCount, 5) }, (_, index) => ({
          afterMs: (index + 1) * 2000,
          message: {
            type: "MEMBER_JOINED",
            member: {
              userId: 9000 + index,
              nickname: `멤버${index + 1}`,
              goal: index % 2 === 0 ? "올해 안에 이직 성공" : null,
              category: null,
              cameraOn: index % 3 !== 2,
              focusState: index % 2 === 0 ? "FOCUS" : "DISTRACTED",
              studySeconds: 3600 * index + 300,
            },
          },
        })),
      });
  }
  return ({ roomId, userId }) => createStompRoomChannel({ roomId, userId });
}

export function LiveRoomPage({
  createChannel,
  createCamera = createMediaStreamCameraAdapter,
}: {
  createChannel?: CreateChannel;
  createCamera?: CreateCamera;
}) {
  const { roomId: roomIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const userId = parseUserId(searchParams.get("userId"));
  const roomId = Number(roomIdParam);
  const state: unknown = location.state;

  // DEV의 mockRoom 시연은 join 없이 URL만으로 진입한다 — 실기기 웹뷰에서는 router state를
  // 주입할 수 없어서, 이 우회가 없으면 mock 데모를 브라우저 콘솔에서만 열 수 있다.
  const mockDemo = import.meta.env.DEV && Number(searchParams.get("mockRoom")) > 0;
  const entryState = isLiveRoomState(state)
    ? state
    : mockDemo
      ? { inviteCode: "0000", graceRejoin: true, cameraOn: true }
      : null;

  if (userId === null || !Number.isInteger(roomId) || entryState === null) {
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  return (
    <LiveRoomEntry
      roomId={roomId}
      userId={userId}
      entryState={entryState}
      createChannel={createChannel ?? resolveChannelFactory(searchParams)}
      createCamera={createCamera}
    />
  );
}

/**
 * 입장 확인 단계 — 세션이 아직 시작되지 않은 구간.
 *
 * 미리보기는 세션 카메라와 별개의 전용 어댑터를 열고 입장 확정 시 정리한다. 확정 시점에
 * join을 재호출해 자리 예약 30초 TTL을 새로 잡는다 — 모달에서 얼마나 머물러도 TTL이
 * 문제되지 않는다. 유예 재입장은 모달을 건너뛰고 이전 카메라 상태로 들어간다.
 */
function LiveRoomEntry({
  roomId,
  userId,
  entryState,
  createChannel,
  createCamera,
}: {
  roomId: number;
  userId: number;
  entryState: LiveRoomLocationState;
  createChannel: CreateChannel;
  createCamera: CreateCamera;
}) {
  const [entry, setEntry] = useState<{ cameraOn: boolean } | null>(
    entryState.graceRejoin === true ? { cameraOn: entryState.cameraOn !== false } : null,
  );
  const [entryError, setEntryError] = useState<string | null>(null);

  const profile = useQuery({
    ...profileQuery(userId),
    staleTime: Infinity,
    enabled: entry === null,
  });

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  // 미리보기도 세션과 같은 카메라 어댑터를 쓴다 — UI가 getUserMedia를 직접 부르지 않는다는
  // 경계를 지키고, 실패해도 던지지 않는 계약을 그대로 얻는다.
  const [previewCamera] = useState(createCamera);
  const modalOpen = entry === null;
  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    let cancelled = false;
    void previewCamera.start().then(() => {
      if (!cancelled && previewVideoRef.current) {
        previewVideoRef.current.srcObject = previewCamera.stream ?? null;
      }
    });
    return () => {
      cancelled = true;
      previewCamera.stop();
    };
  }, [modalOpen, previewCamera]);

  // 확정 처리 중에는 재진입을 막는다 — 두 버튼 연타로 join이 겹치면 서로 다른
  // cameraOn 결정이 경쟁한다.
  const [joining, setJoining] = useState(false);
  async function confirmEntry(cameraOn: boolean) {
    if (joining) {
      return;
    }
    setJoining(true);
    try {
      await joinRoom(userId, entryState.inviteCode);
    } catch (error) {
      setEntryError(joinErrorMessage(error));
      setJoining(false);
      return;
    }
    setEntry({ cameraOn });
  }

  if (entry === null) {
    return (
      <main
        data-testid="live-room-page"
        className="relative flex h-dvh flex-col bg-background"
        style={sessionSurfaceStyle}
      >
        <CameraOnConfirmDialog
          dismissable={false}
          busy={joining}
          preview={
            <video
              ref={previewVideoRef}
              data-testid="entry-preview-video"
              autoPlay
              playsInline
              muted
              className="amp-block size-full object-cover"
            />
          }
          errorMessage={entryError}
          cancelLabel="끄고 입장"
          onCancel={() => void confirmEntry(false)}
          onConfirm={() => void confirmEntry(true)}
        />
      </main>
    );
  }

  return (
    <LiveRoomSession
      roomId={roomId}
      userId={userId}
      createChannel={createChannel}
      createCamera={createCamera}
      initialCameraOn={entry.cameraOn}
      profile={profile.data ?? null}
    />
  );
}

function LiveRoomSession({
  roomId,
  userId,
  createChannel,
  createCamera,
  initialCameraOn,
  profile,
}: {
  roomId: number;
  userId: number;
  createChannel: CreateChannel;
  createCamera: CreateCamera;
  initialCameraOn: boolean;
  profile: ProfileResponse | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [camera] = useState(createCamera);
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
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { camera, detector });

  const channel = useMemo(() => createChannel({ roomId, userId }), [createChannel, roomId, userId]);
  const [members, dispatch] = useReducer(roomMembersReducer, [] as RoomMember[]);
  useEffect(() => channel.subscribe(dispatch), [channel]);

  // 연결과 해제를 한 effect에 대칭으로 둔다 — StrictMode의 마운트-해제-재마운트에서도
  // 두 번째 마운트가 정상 연결된다.
  useEffect(() => {
    channel.connect();
    if (!initialCameraOn) {
      // 끄고 입장 — 룸의 카메라 끔 = 측정 일시정지. 첫 CAMERA_CHANGED는 채널 버퍼가
      // 연결 완료 후 내보낸다.
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

  useRoomStatePublisher(channel, { sessionState, focusSec });

  // 표시용 카메라 상태는 획득 실패(권한 거부 등)도 꺼짐으로 취급한다 — 검은 화면을
  // 켜짐으로 그리지 않는다. 발행·컨트롤은 일시정지 여부만 본다: 룸의 카메라 끔 = 측정
  // 일시정지 계약이고, 획득 실패의 온전한 처리(수동 타이머 모드)는 별도 티켓이다.
  const paused = sessionState.kind === "PAUSE";
  const cameraOn = !paused && isCameraRunning;

  // 내 타일은 로컬 세션 값이 진실이다 — 1분 브로드캐스트보다 정밀하다. 프로필 조회가
  // 입장보다 늦게 끝났으면 서버 SNAPSHOT의 본인 메타데이터로 메운다.
  const serverMe = members.find((m) => m.userId === userId);
  const myMember: RoomMember = {
    userId,
    nickname: profile?.nickname ?? serverMe?.nickname ?? "나",
    goal: profile?.goal ?? serverMe?.goal ?? null,
    category: profile?.category ?? serverMe?.category ?? null,
    cameraOn,
    focusState: sessionState.kind === "DISTRACTION" ? "DISTRACTED" : "FOCUS",
    studySeconds: focusSec,
  };
  const others = members.filter((m) => m.userId !== userId);
  const allMembers = orderedMembers([myMember, ...others], userId);
  const grid = roomGridSpec(allMembers.length);

  // 표시(내 타일)와 추론이 같은 video 엘리먼트를 본다 — 디코드 경로를 늘리지 않는다.
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.srcObject !== cameraStream) {
      video.srcObject = cameraStream ?? null;
    }
  });

  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const leavingRef = useRef(false);

  // 제출 성공 → 퇴장 알림은 응답을 기다리지 않는다. 실패해도 서버의 끊김 30초 유예가
  // 자리를 정리하므로 사용자를 붙잡을 이유가 없다.
  useEffect(() => {
    if (phase.name !== "done" || leavingRef.current) {
      return;
    }
    leavingRef.current = true;
    void leaveRoom(roomId, userId).catch(() => undefined);
    navigate({ pathname: "/social", search: location.search }, { replace: true });
  }, [location.search, navigate, phase.name, roomId, userId]);

  const myVideo = (
    <video
      ref={videoRef}
      data-testid="room-my-video"
      autoPlay
      playsInline
      muted
      className="amp-block size-full object-cover"
    />
  );
  const dialogOpen = cameraDialogOpen || exitDialogOpen;
  const controlsLocked = phase.name !== "studying";

  return (
    <main
      data-testid="live-room-page"
      className="relative flex h-dvh flex-col bg-background"
      style={sessionSurfaceStyle}
    >
      {/* 다이얼로그가 열리면 배경 전체를 inert로 — 포커스가 뒤로 새지 않는다. */}
      <div className="contents" inert={dialogOpen}>
        {grid.mode === "fullscreen" ? (
          <div className="absolute inset-0 bg-[#191f28]">{cameraOn && myVideo}</div>
        ) : (
          <div
            data-testid="room-grid"
            className={`grid grow content-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2 ${
              grid.cols === 1 ? "grid-cols-1" : "grid-cols-2"
            } ${
              grid.rowUnit === 2
                ? "[grid-auto-rows:calc((100%-12px)/2)]"
                : "[grid-auto-rows:calc((100%-24px)/3)]"
            }`}
          >
            {allMembers.map((member) => (
              <RoomTile
                key={member.userId}
                member={member}
                media={member.userId === userId ? myVideo : undefined}
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
          <RoomControlBar
            cameraOn={!paused}
            disabled={controlsLocked}
            onToggleCamera={() => {
              if (!paused) {
                pause("MANUAL");
              } else {
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
          preview={myVideo}
          onCancel={() => setCameraDialogOpen(false)}
          onConfirm={() => {
            setCameraDialogOpen(false);
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
