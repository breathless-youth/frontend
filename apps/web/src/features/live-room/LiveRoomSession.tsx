import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";

import type { IceServer, ProfileResponse, RoomMember, SubjectResponse } from "@focusmakers/types";

import { CtaToaster } from "@/components/ui/sonner";
import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";
import { AmbientSoundButton } from "@/features/ambient-sound/components/AmbientSoundButton";
import { AmbientSoundSheet } from "@/features/ambient-sound/components/AmbientSoundSheet";
import { useAmbientSound } from "@/features/ambient-sound/useAmbientSound";
import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import { ClonedTrackPreview } from "@/features/live-room/components/ClonedTrackPreview";
import {
  RoomControlBar,
  roomBarButtonClassName,
} from "@/features/live-room/components/RoomControlBar";
import { RoomDebugOverlay } from "@/features/live-room/components/RoomDebugOverlay";
import { RoomGrid } from "@/features/live-room/components/RoomGrid";
import { RoomMoreMenu } from "@/features/live-room/components/RoomMoreMenu";
import { RoomSubjectPill } from "@/features/live-room/components/RoomSubjectPill";
import { RoomTimeText } from "@/features/live-room/components/RoomTimeText";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { orderedMembers, roomMembersReducer } from "@/features/live-room/roomMembersReducer";
import { usePeerMesh } from "@/features/live-room/usePeerMesh";
import { useRoomStatePublisher } from "@/features/live-room/useRoomStatePublisher";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import { createSystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";
import { combineFocusDetectors } from "@/features/study-session/adapters/focusDetector";
import { resolveLiveRoomDoneNavigation } from "@/features/live-room/liveRoomEndNavigation";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { SessionPage } from "@/features/study-session/components/SessionPage";
import { SubjectPanel } from "@/features/study-session/components/SubjectPanel";
import { completedTaskIdsSince } from "@/features/study-session/completedTasks";
import { SessionPageTimer } from "@/features/study-session/components/SessionTimer";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { SUB_MINUTE_SEC } from "@/features/study-session/formatDuration";
import {
  EXIT_CONFIRM_COPY,
  SUBJECT_SHEET_COPY,
  exitConfirmDescription,
} from "@/features/study-session/sessionCopy";
import { MANUAL_END_REASON, autoEndReason } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import type { SubjectSelection } from "@/features/study-session/subjectSegments";
import { deriveSubjectTotals, liveSubjectTime } from "@/features/study-session/subjectSegments";
import { useSessionOrientationAnalytics } from "@/features/study-session/useSessionOrientationAnalytics";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { useLandscapeLayout } from "@/features/study-session/useLandscapeLayout";
import { useSubjects } from "@/features/study-session/useSubjects";
import { useTrackedVisionDetector } from "@/features/study-session/useVisionReadyTracking";
import { shareInvite } from "@/features/social-room/shareInvite";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import {
  trackInviteShared,
  trackSocialRoomCameraOnDismissed,
  trackSocialRoomCameraToggled,
  trackSocialRoomExited,
  trackSocialRoomGraceExceeded,
  trackStudySessionExitCancelled,
  trackStudySessionExitRequested,
  trackSubjectItemSelected,
  trackSubjectSheetClosed,
  trackSubjectSheetOpened,
} from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";
import { trackMetaInviteShared } from "@/lib/metaAppEvents";
import { useNativeBackGestureLock, useNativeBackLock } from "@/lib/nativeBackGesture";
import { leaveRoom } from "@/lib/roomApi";
import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";
import { showCtaToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { kickVideoPlayback, useGestureVideoPlaybackKick } from "@/lib/videoPlayback";

import type { CreateChannel } from "./liveRoomEntryState";
import { useBackgroundGraceWatch } from "./useBackgroundGraceWatch";
import { useCameraPreviewAspect } from "./useCameraPreviewAspect";
import { useRoomRejoin } from "./useRoomRejoin";
import { useAutoHideControls } from "./useAutoHideControls";
import { playPressPop } from "./components/playPressPop";

export const GRACE_END_SAVED_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.";
export const GRACE_END_PENDING_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되니 안심하세요.";
// 두 번째 문장은 줄을 바꿔 보여준다(2026-08-26 실기기 확인 피드백) — Toast가 pre-line이다.
export const GRACE_END_SUB_MINUTE_MESSAGE =
  "자리를 오래 비워서 공부를 종료했어요.\n1분 미만 공부는 기록에 표시되지 않아요";

// 방에 다시 들어갈 수 없어(자리 회수) 세션을 마쳤을 때의 안내. 저장·미저장·1분 미만을
// GRACE_END와 같은 기준으로 가른다.
export const ROOM_UNAVAILABLE_SAVED_MESSAGE =
  "방이 종료되어 공부를 마쳤어요.\n공부 기록은 저장되었으니 안심하세요.";
export const ROOM_UNAVAILABLE_PENDING_MESSAGE =
  "방이 종료되어 공부를 마쳤어요.\n공부 기록은 저장되니 안심하세요.";
export const ROOM_UNAVAILABLE_SUB_MINUTE_MESSAGE =
  "방이 종료되어 공부를 마쳤어요.\n1분 미만 공부는 기록에 표시되지 않아요";

export function LiveRoomSession({
  roomId,
  userId,
  inviteCode,
  createChannel,
  camera,
  createPeerConnection,
  iceServers,
  profile,
  restored,
}: {
  roomId: number;
  userId: number;
  inviteCode: string;
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
  // 가로 그리드 사용 여부 — 회전은 클릭이 아니라 autocapture가 못 본다.
  useSessionOrientationAnalytics("social");

  const videoRef = useRef<HTMLVideoElement>(null);
  // 종료 다이얼로그의 포털 자리. `--session-dialog-*` 변수가 여기 주입돼 있어 body 로 나가면
  // 색이 빠진다.
  const [sessionSurface, setSessionSurface] = useState<HTMLElement | null>(null);
  const [devDetector] = useState(() => resolveDevDetectorOverride(searchParams.get("detector")));
  const { visionDetector } = useTrackedVisionDetector(videoRef, "social");
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  // 세션 훅과 유예 감시가 같은 신호원을 본다 — 어댑터를 따로 만들면 복귀 재계산과
  // 유예 판정이 다른 이벤트 순서를 탈 수 있다(usePauseAutoEnd의 같은 원칙).
  const [systemPause] = useState(() => createSystemPauseSource());
  const [ambientUsage] = useState(() => createAmbientUsage(Date.now));
  // 제출 시점에 읽을 과목 목록이다.
  // 목록은 아래 useSubjects가 들고 있어 커밋마다 최신 값으로 덮는다.
  const subjectsListRef = useRef<SubjectResponse[]>([]);
  const {
    focusSec,
    studySec,
    sessionState,
    phase,
    endReason,
    isCameraRunning,
    cameraStream,
    cameraFacing,
    subjectSelection,
    subjectSegments,
    sessionEvents,
    selectSubject,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, {
    camera,
    detector,
    systemPause,
    restored,
    // 계측용 — 없으면 study_session_* 이벤트가 개인 세션과 섞인다.
    roomType: "social",
    ambientUsage: ambientUsage.snapshot,
    getCompletedTaskIds: (startedAtMs) =>
      completedTaskIdsSince(subjectsListRef.current, startedAtMs),
  });
  const ambient = useAmbientSound({ sessionState, phase, usage: ambientUsage });
  // 소셜룸은 뒤로 가기를 잠가 두어 싱글룸과 달리 페이지를 history 항목 없이 연다.
  /** 세션 위에 열린 전체 페이지. 둘은 동시에 열리지 않는다. */
  const [page, setPage] = useState<"subject" | "ambient" | null>(null);
  // 자동 종료 뒤에도 이 화면은 저장 중·다시 제출 안내로 남으므로 페이지가 그 안내를 가리지 않게 닫는다.
  if (phase.name !== "studying" && page !== null) {
    setPage(null);
  }
  const pageLandscape = useLandscapeLayout(page !== null);
  // 페이지를 닫은 뒤 포커스를 돌려줄 자리다.
  // Radix 는 Trigger 를 쓸 때만 스스로 되돌린다.
  const ambientButtonRef = useRef<HTMLButtonElement>(null);
  const subjectButtonRef = useRef<HTMLButtonElement>(null);
  // 과목 페이지를 연 요소와 연 시각이다.
  // 닫을 때 포커스를 돌려주고 열려 있던 시간을 계측한다.
  const subjectOpenerRef = useRef<HTMLElement | null>(null);
  const subjectOpenedAtRef = useRef(0);
  // 과목 페이지가 닫혀 있을 때의 미리 받기 실패는 알리지 않는다.
  // 사용자가 과목을 건드린 적이 없다.
  const subjects = useSubjects(true, (message) => {
    if (page === "subject") {
      showCtaToast(message);
    }
  });
  useLayoutEffect(() => {
    subjectsListRef.current = subjects.subjects;
  });

  // 카메라·감지기와 같은 지연 초기화 패턴 — createChannel prop이 매 렌더 새 클로저여도
  // 채널은 세션 수명 동안 하나다. useMemo면 부모 리렌더가 세션 중 STOMP 재연결을 일으킨다.
  // 채널은 한 번만 생성되므로 나중에 정의되는 requestRejoin을 ref로 가리켜 순환을 끊는다 —
  // 같은 ref를 ROOM_UNAVAILABLE 구독과 SNAPSHOT 미도착 콜백이 함께 쓴다.
  const requestRejoinRef = useRef<() => void>(() => undefined);
  // eslint-disable-next-line react-hooks/refs -- ref는 채널이 연결 뒤 비동기로 부르는 콜백 안에서만 읽힌다. 렌더 중에는 읽지 않는다
  const [channel] = useState(() =>
    createChannel({ roomId, userId, onSnapshotUnrecovered: () => requestRejoinRef.current() }),
  );
  // 카메라를 켜 둘 사용자 의도 — 토글이 즉시 바꾼다. pause/resume은 effect를 거쳐
  // 한 렌더 늦게 반영되므로, 발행값은 이 동기값과 실제 획득 상태로 계산한다.
  // 유예 재입장을 포함해 모든 입장은 카메라 꺼짐(일시정지)으로 시작한다
  // — 나가기 자체가 일시정지이므로 30초 안에 돌아와도 그 상태가 이어지는 것이 맞다.
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
    // BY-467 안내 개선의 분모(BY-472). 공용 20분 감시자가 먼저 끝낸 경우(이 콜백 미호출)는
    // 세지 않는다 — 그 경로도 퇴장 계측(social_room_exited)의 grace_expired가 잡는다.
    trackSocialRoomGraceExceeded();
    setGraceExpired(true);
    channel.disconnect();
    void endAndSubmit(autoEndReason("BACKGROUND"));
  }, [channel, endAndSubmit]);
  const { isExpiredNow } = useBackgroundGraceWatch({
    enabled: phase.name === "studying",
    onExpire: handleGraceExpire,
    systemPause,
  });

  // 방에 다시 들어갈 수 없다는 신호(ROOM_UNAVAILABLE·SNAPSHOT 미도착)를 하나의 재호출로 모은다.
  // 재호출도 실패하면(자리 회수 확정) 유예 만료와 같은 모양으로 측정분을 제출하고 안내한다.
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  const handleRoomUnavailable = useCallback(() => {
    setRoomUnavailable(true);
    channel.disconnect();
    void endAndSubmit(autoEndReason("BACKGROUND"));
  }, [channel, endAndSubmit]);
  const requestRejoin = useRoomRejoin({
    channel,
    inviteCode,
    onUnavailable: handleRoomUnavailable,
  });
  useLayoutEffect(() => {
    requestRejoinRef.current = requestRejoin;
  });
  useEffect(
    () =>
      channel.subscribe((message) => {
        // 개인 큐에 다른 방 신호가 섞여도 이 세션의 방일 때만 반응한다.
        if (message.type === "ROOM_UNAVAILABLE" && message.roomId === roomId) {
          requestRejoinRef.current();
        }
      }),
    [channel, roomId],
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
    roomId,
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
    focusSec,
  };
  const others = members.filter((m) => m.userId !== userId);
  const allMembers = orderedMembers([myMember, ...others], userId);

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
    // 사유·재시도 규칙은 kickVideoPlayback 주석 참고.
    if (video) {
      kickVideoPlayback(video);
    }
  });

  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { selfSurfaceRef, previewAspect, measurePreviewAspect } =
    useCameraPreviewAspect(cameraDialogOpen);
  const leavingRef = useRef(false);
  // 체류 시간(social_room_exited.duration_sec)의 기점 — 이 컴포넌트 마운트가 곧 입장이다.
  const [enteredAtMs] = useState(() => Date.now());

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

  const roomUnavailableNotice = useCallback(
    (submitted: boolean) =>
      focusSec < SUB_MINUTE_SEC
        ? ROOM_UNAVAILABLE_SUB_MINUTE_MESSAGE
        : submitted
          ? ROOM_UNAVAILABLE_SAVED_MESSAGE
          : ROOM_UNAVAILABLE_PENDING_MESSAGE,
    [focusSec],
  );

  // 제출 성공 → 퇴장 알림은 응답을 기다리지 않는다. 백그라운드 자동 종료(유예 만료)는
  // 제출이 실패해도 내보낸다. 서버가 마지막 진행 스냅샷으로 세션을 확정한다. 안내는 도착지(소셜
  // 홈)가 띄우므로 sessionStorage 1회성 플래그로 넘긴다. 실패 이탈은 leaveRoom을
  // 부르지 않는다 — 유예가 끝났으면 서버가 이미 자리를 회수했다.
  useEffect(() => {
    if (leavingRef.current) {
      return;
    }
    // 숨어 있는 동안 공용 20분 감시자가 먼저 종료를 끝내면 만료 콜백이 오지 않는다 —
    // 이동 시점에 숨김 경과를 다시 물어 그 순서에서도 만료 취급이 빠지지 않게 한다.
    const expired = graceExpired || isExpiredNow();
    // 퇴장 계측 — leavingRef가 세션당 1회를 보장한다. 수동/자동 종료 구분은
    // study_session_ended.end_reason(room_type=social)이 이미 가지므로 중복하지 않는다.
    const trackExit = () =>
      trackSocialRoomExited({
        memberCount: allMembers.length,
        exitReason: expired ? "grace_expired" : "session_end",
        durationSec: Math.round((Date.now() - enteredAtMs) / 1000),
      });
    // 방 자체가 사라진 종료는 focusSec와 무관하게 결과 화면이 아니라 소셜 홈으로 보낸다.
    // 자리가 이미 회수됐으므로 leaveRoom은 부르지 않는다.
    if (roomUnavailable && (phase.name === "done" || phase.name === "error")) {
      leavingRef.current = true;
      const submitted = phase.name === "done";
      markSocialRoomNotice({ kind: "grace-end", message: roomUnavailableNotice(submitted) });
      trackExit();
      navigate(
        { pathname: "/social", search: location.search },
        { replace: true, state: { noticeHandoff: true } },
      );
      return;
    }
    if (phase.name === "done") {
      leavingRef.current = true;
      const nav = resolveLiveRoomDoneNavigation({
        expired,
        endReason,
        focusSec,
        sessions: phase.sessions,
      });
      void leaveRoom(roomId).catch(() => undefined);
      if (nav.to === "result") {
        navigate(
          { pathname: `/social/room/${roomId}/result`, search: location.search },
          { replace: true, state: { sessions: nav.sessions } },
        );
        return;
      }
      if (expired) {
        markSocialRoomNotice({ kind: "grace-end", message: graceEndNotice(true) });
      }
      trackExit();
      navigate(
        { pathname: "/social", search: location.search },
        { replace: true, state: { noticeHandoff: true } },
      );
      return;
    }
    if (phase.name === "error" && expired) {
      leavingRef.current = true;
      markSocialRoomNotice({ kind: "grace-end", message: graceEndNotice(false) });
      trackExit();
      navigate(
        { pathname: "/social", search: location.search },
        { replace: true, state: { noticeHandoff: true } },
      );
    }
  }, [
    allMembers.length,
    endReason,
    enteredAtMs,
    focusSec,
    graceEndNotice,
    graceExpired,
    isExpiredNow,
    location.search,
    navigate,
    phase,
    roomId,
    roomUnavailable,
    roomUnavailableNotice,
    userId,
  ]);

  const myVideo = (
    // 셀프뷰 보정: brightness/saturate 필터는 이 <video>의 로컬 렌더링에만 적용된다
    // — P2P 송신 트랙(cameraStream)은 필터를 거치지 않고 원본 그대로 나간다.
    <video
      ref={videoRef}
      data-testid="room-my-video"
      playsInline
      muted
      {...VIDEO_PLAYBACK_KICK_PROPS}
      // cover 고정: 정사각 타일에서는 가로·세로 송신자
      // 모두 긴 축이 대칭(~44%)으로 잘려 방향 혼합의 프레이밍 차이가 온건하다 —
      // 방향별 제한 크롭·레터박스 실험(useAdaptiveVideoFit)은 이 결정으로 걷어냈다.
      className={cn(
        // pointer-events-none: 탭이 video에 직접 닿으면 iOS가 네이티브 재생/일시정지
        // 컨트롤을 띄운다 — 탭은 아래 레이어(유휴 복귀)로 통과시킨다.
        "amp-block sentry-block pointer-events-none size-full object-cover filter-[brightness(1.06)_saturate(1.1)]",
        cameraFacing === "front" && "scale-x-[-1]",
      )}
    />
  );
  const dialogOpen = cameraDialogOpen || exitDialogOpen;
  const controlsLocked = phase.name !== "studying";

  // 잠금(제출 중·에러)·다이얼로그 동안은 컨트롤을 강제로 보인다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen || moreMenuOpen || page !== null;
  const { controlsVisible, surfaceProps } = useAutoHideControls(controlsAlwaysVisible);

  // 확인 창을 연 요소가 닫힐 때 사라져 있으면 대신 포커스를 받을 자리다.
  // 바의 카메라 버튼으로 열 때는 비워 둔다.
  // 터치 웹뷰는 버튼을 눌러도 포커스가 body에 남는 일이 많아 과목 버튼으로 끌려가기 때문이다.
  const cameraConfirmReturnRef = useRef<(() => HTMLElement | null) | null>(null);

  function openCameraConfirm(returnFocus: (() => HTMLElement | null) | null = null) {
    cameraConfirmReturnRef.current = returnFocus;
    measurePreviewAspect();
    setCameraDialogOpen(true);
  }

  function openSubjectPage(source: "button" | "label", opener: HTMLElement) {
    trackSubjectSheetOpened(source);
    subjectOpenedAtRef.current = Date.now();
    subjectOpenerRef.current = opener;
    // 미리 받기가 알림 없이 실패했으면 여는 순간 한 번 더 받는다.
    if (subjects.status === "error") {
      void subjects.reload();
    }
    setPage("subject");
  }

  function closeSubjectPage(closedBy: "back" | "play") {
    trackSubjectSheetClosed({
      openSec: Math.round((Date.now() - subjectOpenedAtRef.current) / 1000),
      closedBy,
    });
    setPage(null);
  }

  // 알약으로 열었는데 페이지에서 과목을 해제하면 알약이 사라지므로 과목 버튼으로 돌아간다.
  function subjectReturnFocus() {
    const opener = subjectOpenerRef.current;
    return opener?.isConnected ? opener : subjectButtonRef.current;
  }

  function handleSelectSubject(next: SubjectSelection | null) {
    // 일시정지 중에 이미 고른 과목의 재생 버튼을 누르면 선택은 그대로다.
    // 전이가 없으니 계측도 남기지 않는다.
    if (next === subjectSelection) {
      return;
    }
    trackSubjectItemSelected(next === null ? "none" : "subject");
    selectSubject(next);
  }

  /**
   * 이 세션에서 과목별로 쌓인 시간
   *
   * 서버와 같은 규칙(구간 − 이벤트 겹침)으로 화면에서 파생한다.
   */
  const liveSubjectTotals = deriveSubjectTotals(subjectSegments, sessionEvents);
  const selectedSubject =
    subjectSelection === null
      ? null
      : (subjects.subjects.find((subject) => subject.id === subjectSelection) ?? null);
  // 알약의 순공은 서버 누적에 이 세션 몫을 더한다.
  const subjectLabel =
    subjectSelection === null
      ? null
      : {
          name: selectedSubject?.name ?? SUBJECT_SHEET_COPY.title,
          focusSec:
            (selectedSubject?.focusSec ?? 0) +
            liveSubjectTime(liveSubjectTotals, subjectSelection).focusSec,
        };

  return (
    <main
      ref={setSessionSurface}
      data-testid="live-room-page"
      {...surfaceProps}
      // overflow-hidden: 자동 숨김으로 화면 밖까지 내려간 컨트롤 바를 잘라 문서 스크롤이 생기지 않게 한다.
      className="theme-dark relative flex h-dvh flex-col overflow-hidden bg-background"
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
      {/* 다이얼로그의 포커스 트랩·바깥 차단은 Radix 가 스스로 한다. inert 를 겹치면 닫힐 때
          포커스를 돌려줄 요소가 이미 inert 라 복귀가 실패한다. */}
      <div className="contents">
        <RoomGrid
          allMembers={allMembers}
          userId={userId}
          myVideo={myVideo}
          remoteStreams={remoteStreams}
          selfSurfaceRef={selfSurfaceRef}
        />

        {/* 조작이 숨어도 내 시간은 계속 보여야 해서 숨김 대상 밖에 둔다. */}
        <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+6px)] right-[calc(env(safe-area-inset-right)+16px)] left-[calc(env(safe-area-inset-left)+16px)] flex flex-col items-start landscape-compact:top-[calc(env(safe-area-inset-top)+16px)] regular:top-[calc(env(safe-area-inset-top)+16px)]">
          <RoomTimeText focusSec={focusSec} studySec={studySec} totalHidden={!controlsVisible} />
          {/* 과목 알약

              조작이 숨어도 늘 보여서 내 시간 글자 바로 아래에 둔다.
              묶음 칸이 오른쪽에도 화면 여백을 둬서 이름이 길면 화면 안에서 잘린다.
              흐림 배경이 사라지지 않게 transform이나 opacity가 걸린 조상 아래에 두지 않는다.
              시간 글자의 그림자가 알약 글자에 번지지 않게 시간 글자 밖 형제로 둔다. */}
          {subjectLabel !== null && (
            <RoomSubjectPill
              name={subjectLabel.name}
              focusSec={subjectLabel.focusSec}
              paused={paused}
              expanded={page === "subject"}
              inactive={moreMenuOpen}
              // 제출 중에는 페이지를 열 수 없어서 눌리는 버튼처럼 보이지 않게 글자로 둔다.
              onClick={
                controlsLocked
                  ? undefined
                  : (event) => openSubjectPage("label", event.currentTarget)
              }
            />
          )}
        </div>

        <RoomMoreMenu
          container={sessionSurface}
          hidden={!controlsVisible}
          flipDisabled={paused || controlsLocked}
          onFlipCamera={() => void flipCamera()}
          onShareInvite={() => {
            void shareInvite(inviteCode).then((result) => {
              trackInviteShared(result);
              trackMetaInviteShared(result);
              // 공유 시트가 뜨거나 사용자가 닫은 경우는 OS가 이미 알려 줘서 복사만 토스트로 알린다.
              if (result === "copied") {
                showCtaToast("초대코드를 복사했어요");
              }
            });
          }}
          onOpenChange={setMoreMenuOpen}
        />

        {/* 세로 폰은 바를 아래 안전 영역에 2px 걸치되, 안전 영역이 없는 기기에서는 화면 끝에 붙지 않게 8px을 남긴다.
            가로는 세로 기준 오프셋이 높아 보여서 6px만 띄운다.
            숨김 이동량은 가장 큰 오프셋인 태블릿 17px 기준이라 어느 배치에서도 바가 화면 밖까지 나간다. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(calc(env(safe-area-inset-bottom)-2px),8px)] flex flex-col items-center gap-2 landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+6px)] regular:bottom-[calc(env(safe-area-inset-bottom)+17px)]">
          {/* 페이지가 열린 동안은 페이지 푸터의 Toaster가 받는다.
              둘이 함께 있으면 토스트가 두 번 뜬다. */}
          {page === null && <CtaToaster />}
          {phase.name === "submitting" && <p className="text-sm text-white/80">저장 중...</p>}
          {phase.name === "error" && (
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              <p className="text-sm text-(--session-exit-bg)">{phase.message}</p>
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
            inactive={moreMenuOpen}
            onToggleCamera={() => {
              if (!paused) {
                trackSocialRoomCameraToggled(false);
                setCameraWanted(false);
                pause("MANUAL");
                // 일시정지 상태에서 울려서 진동이 기기 조작 감지 결과로 이어지지 않는다.
                haptic("light");
              } else {
                openCameraConfirm();
              }
            }}
            onExit={() => {
              trackStudySessionExitRequested("social");
              setExitDialogOpen(true);
            }}
          >
            <button
              ref={subjectButtonRef}
              type="button"
              // 이 버튼은 과목을 고르지 않고 페이지를 열어서, 고른 상태는 이름과 색으로 전한다.
              aria-label={
                subjectSelection === null
                  ? SUBJECT_SHEET_COPY.title
                  : `${SUBJECT_SHEET_COPY.title} 선택됨`
              }
              aria-haspopup="dialog"
              aria-expanded={page === "subject"}
              data-on={subjectSelection !== null}
              disabled={controlsLocked}
              onPointerDown={playPressPop}
              onClick={(event) => openSubjectPage("button", event.currentTarget)}
              className={cn(roomBarButtonClassName, "data-[on=true]:text-(--state-focus)")}
            >
              <BookOpen
                aria-hidden="true"
                className="size-5.75 regular:size-6.75 short-side-lg:size-8.5"
              />
            </button>
            <AmbientSoundButton
              ref={ambientButtonRef}
              native={false}
              className={roomBarButtonClassName}
              onPointerDown={playPressPop}
              disabled={controlsLocked}
              on={ambient.isOn}
              expanded={page === "ambient"}
              onClick={() => setPage("ambient")}
            />
          </RoomControlBar>
        </div>
      </div>

      <CameraOnConfirmDialog
        open={cameraDialogOpen}
        container={sessionSurface}
        returnFocus={() => cameraConfirmReturnRef.current?.() ?? null}
        preview={
          <ClonedTrackPreview
            stream={cameraStream}
            facing={cameraFacing}
            targetAspect={previewAspect ?? undefined}
          />
        }
        onCancel={() => {
          trackSocialRoomCameraOnDismissed();
          setCameraDialogOpen(false);
        }}
        onConfirm={() => {
          haptic("medium");
          trackSocialRoomCameraToggled(true);
          setCameraDialogOpen(false);
          setCameraWanted(true);
          resume();
        }}
      />
      {/* 두 페이지는 Radix 포털을 타므로 여기 위치가 화면 배치를 정하지는 않는다. */}
      <SessionPage
        open={page === "subject"}
        onOpenChange={(open) => {
          if (!open) closeSubjectPage("back");
        }}
        container={sessionSurface}
        returnFocus={subjectReturnFocus}
        title={SUBJECT_SHEET_COPY.title}
        landscape={pageLandscape}
      >
        <SubjectPanel
          store={subjects}
          selection={subjectSelection}
          onSelect={handleSelectSubject}
          // 룸에서 재개는 카메라 켜기라 영상 공유 동의를 거쳐야 한다.
          // 그래서 일시정지 중의 재생은 바로 재개하지 않고 카메라 켜기 확인 창으로 넘긴다.
          onRequestClose={() => {
            closeSubjectPage("play");
            // 확인 창을 연 재생 버튼은 페이지와 함께 사라져 페이지를 연 자리로 돌아간다.
            if (paused) {
              openCameraConfirm(subjectReturnFocus);
            }
          }}
          paused={paused}
          onNotice={showCtaToast}
          liveTotals={liveSubjectTotals}
          landscape={pageLandscape}
          timer={<SessionPageTimer focusSec={focusSec} />}
        />
      </SessionPage>
      <AmbientSoundSheet
        open={page === "ambient"}
        container={sessionSurface}
        returnFocus={() => ambientButtonRef.current}
        landscape={pageLandscape}
        timer={<SessionPageTimer focusSec={focusSec} />}
        catalog={ambient.catalog}
        mix={ambient.mix}
        duckEnabled={ambient.duckEnabled}
        blocked={ambient.blocked}
        canRestore={ambient.canRestore}
        onToggleSound={ambient.toggleSound}
        onChangeLevel={ambient.changeLevel}
        onSetDuckEnabled={ambient.setDuckEnabled}
        onToggleAll={ambient.toggleAll}
        onOpenChange={(open) => {
          if (!open) setPage(null);
        }}
      />
      <SessionConfirmDialog
        // 자동 종료 경로가 여럿이다(usePauseAutoEnd·유예 만료·ROOM_UNAVAILABLE). 그중 하나가
        // exitDialogOpen 이 true 인 채 phase 를 studying 밖으로 옮기면, 여는 조건에 phase 를
        // 걸지 않는 한 이미 끝난 세션 위에 종료 확인 다이얼로그가 남는다.
        open={exitDialogOpen && phase.name === "studying"}
        container={sessionSurface}
        title={EXIT_CONFIRM_COPY.title}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={EXIT_CONFIRM_COPY.cancel}
        confirmLabel={EXIT_CONFIRM_COPY.confirm}
        onCancel={() => {
          trackStudySessionExitCancelled("social");
          setExitDialogOpen(false);
        }}
        onConfirm={() => {
          haptic("medium");
          setExitDialogOpen(false);
          void endAndSubmit(MANUAL_END_REASON);
        }}
      />
    </main>
  );
}
