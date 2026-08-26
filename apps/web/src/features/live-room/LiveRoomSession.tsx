import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import { kickVideoPlayback, useGestureVideoPlaybackKick } from "@/lib/videoPlayback";

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
  profile,
}: {
  roomId: number;
  userId: number;
  createChannel: CreateChannel;
  camera: CameraAdapter;
  createPeerConnection?: CreatePeerConnection;
  iceServers: IceServer[];
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
  // 저전력 모드에서 멈춘 영상을 탭 제스처로 되살린다 — lib/videoPlayback.ts 주석 참고.
  useGestureVideoPlaybackKick();

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
  // 유예 재입장을 포함해 **모든 입장은 카메라 꺼짐(일시정지)으로 시작한다** — 나가기 자체가
  // 일시정지이므로 30초 안에 돌아와도 그 상태가 이어지는 것이 맞다(BY-412).
  const [cameraWanted, setCameraWanted] = useState(false);
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
    // autoplay 속성만으로는 iOS WKWebView에서 재생이 시작되지 않을 수 있다 —
    // 사유·재시도 규칙은 kickVideoPlayback 주석 참고(2026-08-26 실기기).
    if (video) {
      kickVideoPlayback(video);
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
    grid.mode === "grid" && grid.cols === 1 ? "duo" : allMembers.length <= 4 ? "quad" : "hex";

  // 컨트롤 바 탭 토글(BY-435 디스코드 패턴) — 화면 탭이 바를 올리고, 자동으로 내려가지
  // 않으며, 한 번 더 탭하면 내려간다(종전 4초 유휴 자동 숨김 대체). 입장 직후는 숨김
  // 상태로 시작해 타일만 있는 몰입 화면이다. 잠금(제출 중·에러)·다이얼로그 동안은 항상
  // 보인다. 바 자체 조작은 RoomControlBar가 pointerdown 버블을 끊어 토글로 새지 않는다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen;
  // 입장 직후에는 보인다(2026-08-25 피드백 — 조작법을 먼저 보여준다). 탭으로 내리면
  // 이름·목표도 함께 숨어 시간만 남는 몰입 화면이 된다(RoomTile infoHidden).
  const [controlsShown, setControlsShown] = useState(true);
  const controlsVisible = controlsAlwaysVisible || controlsShown;
  // 탭과 스크롤을 구분한다(2026-08-25 피드백) — pointerdown만 보면 스크롤 시작 터치가
  // 토글로 먹혀 "한 번 더 터치해야 스크롤"이 됐다. 눌린 지점에서 거의 움직이지 않고
  // 뗀 경우(≤10px)만 탭으로 인정한다. 스크롤이 포인터를 가져가면 pointerup이 아예
  // 오지 않으므로 자연히 토글되지 않는다.
  const surfacePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleSurfacePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    surfacePointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handleSurfacePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = surfacePointerStartRef.current;
    surfacePointerStartRef.current = null;
    if (start === null) {
      return;
    }
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 10) {
      return;
    }
    // 강제 표시 구간의 탭(다이얼로그 배경 등)이 숨김 상태를 뒤집어 두면, 구간이 끝나는
    // 순간 바가 예고 없이 내려간다 — 토글은 일반 구간에서만 받는다.
    if (!controlsAlwaysVisible) {
      setControlsShown((prev) => !prev);
    }
  };

  /**
   * 바 토글의 타일 이동·크기 변화를 FLIP(이전 위치로 transform 역적용 → 원위치)으로
   * 잇는다 — 바 슬라이드·글자 페이드와 **도착 시점을 맞춘다**(2026-08-26 피드백: 셋의
   * 속도가 어긋나 어색했다). 같은 500ms·iOS 시트 곡선이라 세 동작이 함께 정착한다.
   *
   * 방식이 FLIP인 이유: 높이·패딩 트랜지션은 영상 리플로우로 실기기 랙(6e827c9), 스크롤
   * 컨테이너(`room-grid`) transform은 WKWebView 타일 페인트 누락 사고가 있었다. FLIP은
   * 레이아웃을 즉시 확정하고 **타일 각각에만** transform 애니메이션을 걸어 둘 다 피한다.
   *
   * rect 저장은 매 커밋(의존성 없음) — 타일 ≤6개 측정이라 싸고, 토글 외의 렌더가 기준
   * rect를 최신으로 유지한다. 커밋 없이 rect가 바뀌는 사건(회전·스크롤)은 아래
   * invalidateFlipRects가 기준을 버려 가짜 비행을 막는다. 토글이 아닌 레이아웃 변화
   * (입장·퇴장)는 애니메이션하지 않는다(종전과 같은 즉시 반영). 가로에서는 바 토글이
   * 레이아웃을 바꾸지 않아 자연히 무동작이다.
   */
  const rowsRef = useRef<HTMLDivElement>(null);
  const prevTileRectsRef = useRef<ReadonlyMap<string, DOMRect>>(new Map());
  const prevControlsVisibleRef = useRef(controlsVisible);
  /**
   * 기준 rect 무효화 — 회전·스크롤은 React 커밋 없이 타일 위치를 바꾸므로, 그 직후 1초
   * 안의(다음 틱 렌더 전) 토글은 낡은 기준으로 수백 px 가짜 비행을 만든다(크로스리뷰 M3).
   * 이런 사건 뒤에는 기준을 버린다 — 그 직후 첫 토글은 prev가 없어 애니메이션 없이
   * 스냅되지만, 잘못된 비행보다 낫고 다음 커밋이 다시 잰다.
   */
  const invalidateFlipRects = useCallback(() => {
    prevTileRectsRef.current = new Map();
  }, []);
  useEffect(() => {
    window.addEventListener("resize", invalidateFlipRects);
    window.addEventListener("orientationchange", invalidateFlipRects);
    return () => {
      window.removeEventListener("resize", invalidateFlipRects);
      window.removeEventListener("orientationchange", invalidateFlipRects);
    };
  }, [invalidateFlipRects]);
  useLayoutEffect(() => {
    const controlsChanged = prevControlsVisibleRef.current !== controlsVisible;
    prevControlsVisibleRef.current = controlsVisible;
    const tiles = Array.from(
      rowsRef.current?.querySelectorAll<HTMLElement>('[data-testid="room-tile"]') ?? [],
    );
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rects = new Map<string, DOMRect>();
    for (const tile of tiles) {
      const key = tile.dataset.userId ?? "";
      // 연타 대비 — 달리는 FLIP이 있으면 취소 **전에** 변환이 포함된 rect(= 지금 화면에
      // 보이는 위치)를 재서 새 FLIP의 출발점으로 쓴다. 저장 맵의 rect는 직전 커밋의 도착
      // 레이아웃이라 그걸 쓰면 타일이 도착점으로 점프했다가 되돌아온다(크로스리뷰 M4 —
      // 500ms 안의 재토글은 틱 렌더가 끼기 전이라 맵이 mid-flight 위치를 모른다).
      let prevOverride: DOMRect | null = null;
      if (controlsChanged && typeof tile.getAnimations === "function") {
        const running = tile.getAnimations();
        if (running.length > 0) {
          prevOverride = tile.getBoundingClientRect();
          for (const animation of running) {
            animation.cancel();
          }
        }
      }
      const next = tile.getBoundingClientRect();
      const prev = prevOverride ?? prevTileRectsRef.current.get(key);
      rects.set(key, next);
      if (
        !controlsChanged ||
        reduceMotion ||
        typeof tile.animate !== "function" ||
        prev === undefined ||
        prev.width === 0 ||
        prev.height === 0 ||
        next.width === 0 ||
        next.height === 0
      ) {
        continue;
      }
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      const sx = prev.width / next.width;
      const sy = prev.height / next.height;
      if (
        Math.abs(dx) < 1 &&
        Math.abs(dy) < 1 &&
        Math.abs(sx - 1) < 0.01 &&
        Math.abs(sy - 1) < 0.01
      ) {
        continue;
      }
      tile.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          },
          { transformOrigin: "top left", transform: "none" },
        ],
        // RoomControlBar 슬라이드·RoomTile 글자 페이드와 같은 500ms·시트 곡선 — 이 값이
        // 어긋나면 "도착 시점이 안 맞는다"는 어색함이 되살아난다. 셋을 함께 바꿀 것.
        { duration: 500, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      );
    }
    prevTileRectsRef.current = rects;
  });

  return (
    <main
      data-testid="live-room-page"
      onPointerDown={handleSurfacePointerDown}
      onPointerUp={handleSurfacePointerUp}
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
            // 스크롤은 커밋 없이 타일 rect를 바꾼다 — FLIP 기준을 버린다(위 invalidateFlipRects).
            onScroll={invalidateFlipRects}
            // 스크롤 컨테이너 자신은 정렬하지 않는다 — content-center/end는 내용이 컨테이너보다
            // 커지는 순간 위로 넘친 행이 잘리고 스크롤로도 닿을 수 없다(flexbox 정렬 data loss,
            // 2026-08-25 실기기: 작은 화면에서 첫 행(내 타일+참가자)이 사라짐). 정렬은 아래
            // rows 래퍼의 auto 마진이 담당한다 — 넘치면 마진이 0으로 접혀 위부터 스크롤된다.
            className={cn(
              "flex grow flex-col overflow-y-auto px-1 pt-[calc(env(safe-area-inset-top)+12px)]",
              // 가로는 BY-435 이전 그리드로 복원(BY-441) — 타일당 한 화면을 채우던 와이드
              // 타일(2:1)은 카메라가 화면에 꽉 차서 되돌렸다. 복원 원본은 5bf0849(2026-08-21,
              // BY-427 전후 동일)이고 간격·여백까지 당시 값 그대로다: 2명은 1행 2열로 화면을
              // 반씩(행 높이 100%), 3명 이상은 2열에 행 높이 절반 + 세로 스크롤, gap-3(12px).
              // rows 래퍼가 가로에서 landscape:contents로 사라져 타일이 이 컨테이너의 그리드
              // 아이템이 된다 — % 행 높이는 높이가 정해진(grow) 이 컨테이너에서만 풀린다.
              "landscape:grid landscape:grid-cols-2 landscape:gap-3",
              grid.cols === 1
                ? "landscape:[grid-auto-rows:100%]"
                : "landscape:[grid-auto-rows:calc((100%-12px)/2)]",
              "landscape:pl-[calc(env(safe-area-inset-left)+16px)] landscape:pr-[calc(env(safe-area-inset-right)+16px)]",
              controlsVisible ? "pb-[calc(env(safe-area-inset-bottom)+108px)]" : "pb-[4dvh]",
              // 가로 하단 여백도 당시 값(pb-2) — 행 높이가 컨테이너 높이에서 풀리므로 바
              // 표시용 108px 예약을 두면 타일이 바 높이만큼 눌린다. 예전처럼 바가 타일 위에
              // 겹치는 쪽을 택한다(세로의 수납 동작은 그대로).
              "landscape:pb-2",
            )}
          >
            <div
              ref={rowsRef}
              data-testid="room-grid-rows"
              // 안전 정렬: 바 표시 중엔 mt-auto로 바 바로 위에, 숨김 중엔 my-auto로 세로
              // 가운데에 — 어느 쪽이든 내용이 넘치면 auto 마진이 접혀 잘리지 않는다.
              className={cn(
                // landscape:contents — 가로에서는 이 래퍼를 지워 타일을 컨테이너 그리드에
                // 직접 붙인다(위 컨테이너 주석, BY-441). auto 마진 정렬은 세로 전용이 된다.
                "flex w-full flex-wrap justify-center gap-1 landscape:contents",
                controlsVisible ? "mt-auto" : "my-auto",
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
                          // 3~4명은 0352 비율(2:3). 5~6명은 2:3이면 3행이 화면을 넘어 첫 행이
                          // 스크롤로 밀리는 사고가 났다 — 4:5로 눕히고, 바가 올라오면 폭을 더
                          // 줄여 3행 전체가 바 위에 수납된다(2026-08-25 피드백: 바가 가림).
                          // 바를 내린 폭도 50%→47%로 좁혀 토글 스냅을 3%p로 줄였다(2026-08-26
                          // 피드백 — 위 2dvh와 같은 이유). 44%는 3행 수납의 상한이라 그대로다.
                          allMembers.length <= 4 ? "aspect-[2/3]" : "aspect-[4/5]",
                          allMembers.length > 4
                            ? controlsVisible
                              ? "w-[calc(44%-2px)]"
                              : "w-[calc(47%-2px)]"
                            : "w-[calc(50%-2px)]",
                        ),
                    // 가로: 컨테이너 그리드의 셀을 stretch로 그대로 채운다(BY-441 —
                    // BY-435 이전 배치 복원. "타일당 한 화면 꽉 차게"의 2:1 와이드 타일은
                    // 카메라가 지나치게 커서 되돌렸다). 세로용 비율·크기 지정을 전부 풀어야
                    // 셀 크기가 타일 크기가 된다 — 바 표시에 따른 세로 모드의 축소(5~6명
                    // 44%, 2명 37dvh)는 가로에 적용되지 않는다.
                    "landscape:aspect-auto landscape:h-auto landscape:w-auto landscape:max-w-none",
                  )}
                />
              ))}
            </div>
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
