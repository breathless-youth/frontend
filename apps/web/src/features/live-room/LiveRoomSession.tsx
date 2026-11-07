import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";

import { sessionStateColors } from "@focusmakers/design-tokens";
import type { IceServer, ProfileResponse, RoomMember, SubjectResponse } from "@focusmakers/types";

import { CtaToaster } from "@/components/ui/sonner";
import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";
import { AmbientSoundButton } from "@/features/ambient-sound/components/AmbientSoundButton";
import { AmbientSoundSheet } from "@/features/ambient-sound/components/AmbientSoundSheet";
import { useAmbientSound } from "@/features/ambient-sound/useAmbientSound";
import { toRoomVisibility } from "@/features/group-room/fromApi";
import { groupErrorCode, groupErrorCopy } from "@/features/group-room/groupErrorCopy";
import { inviteCodeRenewedCopy, kickMemberDialog } from "@/features/group-room/model/roomMenu";
import { createMultiTimerUsage, useMultiTimer } from "@/features/multi-timer/useMultiTimer";
import { CameraOnConfirmDialog } from "@/features/live-room/components/CameraOnConfirmDialog";
import { ClonedTrackPreview } from "@/features/live-room/components/ClonedTrackPreview";
import { FaceMaskSearchingBadge } from "@/features/live-room/components/FaceMaskSearchingBadge";
import { GroupRoomTopBar } from "@/features/live-room/components/GroupRoomTopBar";
import {
  LazyRoomTimerSheet,
  preloadRoomTimerSheet,
} from "@/features/live-room/components/lazyRoomTimerSheet";
import { MicButton } from "@/features/live-room/components/MicButton";
import { ReportMemberLayer } from "@/features/live-room/components/ReportMemberLayer";
import { RoomMemberMenu } from "@/features/live-room/components/RoomMemberMenu";
import { RoomTimerCapsule } from "@/features/live-room/components/RoomTimerCapsule";
import { TimerButton } from "@/features/live-room/components/TimerButton";
import {
  RoomControlBar,
  roomBarButtonClassName,
} from "@/features/live-room/components/RoomControlBar";
import { RoomDebugOverlay } from "@/features/live-room/components/RoomDebugOverlay";
import { RoomGrid } from "@/features/live-room/components/RoomGrid";
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
import {
  kickedNotice,
  resolveLiveRoomDoneNavigation,
} from "@/features/live-room/liveRoomEndNavigation";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { SessionMoreMenu } from "@/features/study-session/components/SessionMoreMenu";
import { SessionPage } from "@/features/study-session/components/SessionPage";
import { SubjectPanel } from "@/features/study-session/components/SubjectPanel";
import { completedTaskIdsSince } from "@/features/study-session/completedTasks";
import {
  SessionPageHeaderTime,
  SessionPageTimer,
} from "@/features/study-session/components/SessionTimer";
import { SESSION_SYMBOL_SCALE } from "@/features/study-session/components/controlButtonVariants";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import {
  MIN_RECORDED_FOCUS_SEC,
  exitConfirmDescription,
} from "@/features/study-session/formatDuration";
import { MANUAL_END_REASON, autoEndReason } from "@/features/study-session/sessionState";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { GROUP_ROOM_SESSION_TUNING } from "@/features/study-session/sessionTuning";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import type { SubjectSelection } from "@/features/study-session/subjectSegments";
import { deriveSubjectTotals, liveSubjectTime } from "@/features/study-session/subjectSegments";
import { loadSessionSubjects } from "@/features/study-session/loadSessionSubjects";
import { useSessionOrientationAnalytics } from "@/features/study-session/useSessionOrientationAnalytics";
import { useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { useLandscapeLayout } from "@/features/study-session/useLandscapeLayout";
import { useSubjects } from "@/features/study-session/useSubjects";
import { useTrackedVisionDetector } from "@/features/study-session/useVisionReadyTracking";
import { shareInvite } from "@/features/social-room/shareInvite";
import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import {
  trackGroupRoomReported,
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
import { useNativeControl } from "@/lib/nativeControls";
import { kickGroupMember, reportGroupMember } from "@/lib/groupRoomApi";
import {
  GROUP_MUTATION_OPTIONS,
  dropFromMyGroups,
  forgetGroup,
  groupHomeQuery,
  groupKeys,
  invalidateGroupMembership,
} from "@/lib/groupRoomQueries";
import { startVideoPlayback, VIDEO_PLAYBACK_KICK_PROPS } from "@/lib/startVideoPlayback";
import { showCtaToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { kickVideoPlayback, useGestureVideoPlaybackKick } from "@/lib/videoPlayback";
import { whenIdle } from "@/lib/whenIdle";

import { FACE_MASK_EMOJIS } from "./faceMaskSettings";
import { GROUP_ROOM_ANALYTICS_MASK } from "./groupRoomAnalyticsMask";
import type { CreateChannel } from "./liveRoomEntryState";
import type { LiveRoomKind, RoomSeat } from "./roomKind";
import { leaveRoomSeat, liveRoomHomePath, liveRoomResultPath, renewRoomSeat } from "./roomKind";
import { micHeld, roomSessionFlags, visionPreview } from "./roomSessionFlags";
import { useBackgroundGraceWatch } from "./useBackgroundGraceWatch";
import { useCameraPreviewAspect } from "./useCameraPreviewAspect";
import { useFaceMaskedSend, useKeepMaskSourceLive } from "./useFaceMaskedSend";
import { useGroupRoomEvents } from "./useGroupRoomEvents";
import { useRoomAudio } from "./useRoomAudio";
import type { RoomAudioDeps } from "./useRoomAudio";
import { useRoomRejoin } from "./useRoomRejoin";
import { useRoomTimerSheet } from "./useRoomTimerSheet";
import { useTogetherSeconds } from "./useTogetherSeconds";
import { useAutoHideControls } from "./useAutoHideControls";
import { playPressPop } from "./components/playPressPop";

export function LiveRoomSession({
  roomId,
  userId,
  room,
  createChannel,
  camera,
  createPeerConnection,
  iceServers,
  profile,
  restored,
  audioDeps,
}: {
  roomId: number;
  userId: number;
  room: LiveRoomKind;
  createChannel: CreateChannel;
  camera: CameraAdapter;
  createPeerConnection?: CreatePeerConnection;
  iceServers: IceServer[];
  profile: ProfileResponse | null;
  /** 서버에서 받아 온 진행중 세션. 있으면 그 값에서 이어서 시작한다. */
  restored: RestoredSession | null;
  audioDeps?: RoomAudioDeps;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const groupId = room.kind === "group" ? room.groupId : null;
  // 내보내짐 안내의 그룹 이름은 그룹 홈 캐시에서 읽는다.
  // 그룹 홈 화면과 달리 공부방에 있는 동안에는 주기 조회와 포커스 조회를 끄고, 초대코드 방은 받지 않는다.
  const groupHome = useQuery({
    ...groupHomeQuery(userId, groupId ?? 0),
    enabled: groupId !== null,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

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
  const { t } = useTranslation(["live-room", "study-session", "social-room"]);

  // 추론과 송신 합성은 항상 붙어 있는 숨은 원본 영상을 본다.
  // 카메라를 끄면 내 타일의 영상이 빠지는데, 그동안에도 켜기 미리보기에 이모지를 그려야 해서다.
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileVideoRef = useRef<HTMLVideoElement>(null);
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
  // 카메라가 꺼진 일시정지 중 앱을 떠나도 세션의 기존 트리거는 유지된다.
  // 앱 가림은 배경음과 마이크가 독립적으로 따라갈 수 있도록 같은 신호원에서 읽는다.
  const [appHidden, setAppHidden] = useState(() => document.visibilityState === "hidden");
  useEffect(
    () =>
      systemPause.subscribe({
        onLeave: () => setAppHidden(true),
        onReturn: () => setAppHidden(false),
      }),
    [systemPause],
  );
  const [ambientUsage] = useState(() => createAmbientUsage(Date.now));
  // 타이머 사용 기록은 세션 훅이 타이머 훅보다 먼저 생겨서 여기서 만들어 두 훅에 함께 넘긴다.
  const [multiTimerUsage] = useState(createMultiTimerUsage);
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
    startBreak,
    endBreak,
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
    ambientSoundPlays: ambientUsage.soundSeconds,
    multiTimerUsage: multiTimerUsage.snapshot,
    getCompletedTaskIds: (startedAtMs) =>
      completedTaskIdsSince(subjectsListRef.current, startedAtMs),
    // 그룹 공부방은 일시정지 1시간에 나가고 초대코드 방은 싱글룸과 같은 20분이다.
    tuning: room.kind === "group" ? GROUP_ROOM_SESSION_TUNING : undefined,
  });
  const ambient = useAmbientSound({
    sessionState,
    phase,
    usage: ambientUsage,
    roomType: "social",
    playbackPaused: appHidden,
  });
  // 소셜룸은 뒤로 가기를 잠가 두어 싱글룸과 달리 페이지를 history 항목 없이 연다.
  /** 세션 위에 열린 전체 페이지. 둘은 동시에 열리지 않는다. */
  const [page, setPage] = useState<"subject" | "ambient" | null>(null);
  // 자동 종료 뒤에도 이 화면은 저장 중·다시 제출 안내로 남으므로 페이지가 그 안내를 가리지 않게 닫는다.
  if (phase.name !== "studying" && page !== null) {
    setPage(null);
  }
  const pageLandscape = useLandscapeLayout(page !== null);
  /** 멤버 메뉴를 연 멤버이고 메뉴는 한 번에 하나만 열린다. */
  const [menuUserId, setMenuUserId] = useState<number | null>(null);
  if (phase.name !== "studying" && menuUserId !== null) {
    setMenuUserId(null);
  }
  // 가로에서는 타일 아래가 화면 끝이라 메뉴를 버튼 위로 펼친다.
  const menuLandscape = useLandscapeLayout(menuUserId !== null);
  /** 신고 화면을 연 멤버이고, 멤버가 그사이 공부방을 나가도 신고는 마칠 수 있게 닉네임을 함께 든다. */
  const [reportTarget, setReportTarget] = useState<{ userId: number; nickname: string } | null>(
    null,
  );
  if (phase.name !== "studying" && reportTarget !== null) {
    setReportTarget(null);
  }
  // 신고 화면이 닫히면 돌아갈 그 멤버의 메뉴 버튼이다.
  const reportOpenerRef = useRef<HTMLElement | null>(null);
  /** 내보내기 확인 창을 연 멤버이고, 멤버가 그사이 공부방을 나가도 확인은 마칠 수 있게 닉네임을 함께 든다. */
  const [kickTarget, setKickTarget] = useState<{ userId: number; nickname: string } | null>(null);
  if (phase.name !== "studying" && kickTarget !== null) {
    setKickTarget(null);
  }
  // 닫히며 사라지는 동안에도 창 문구가 빈 닉네임으로 바뀌지 않게 마지막으로 연 멤버를 남겨 둔다.
  const [kickShown, setKickShown] = useState(kickTarget);
  if (kickTarget !== null && kickTarget !== kickShown) {
    setKickShown(kickTarget);
  }
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
  // 과목 시간은 플래너 하루 기준 오늘 값으로 바꿔 받는다(`loadSessionSubjects`).
  const subjects = useSubjects(
    true,
    (message) => {
      if (page === "subject") {
        showCtaToast(message);
      }
    },
    "social",
    () => loadSessionSubjects(userId),
  );
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
  const renewSeat = useCallback(() => renewRoomSeat(room), [room]);
  // 다른 방에 잡힌 자리는 이 세션이 쓰지 못하므로 바로 비운다.
  const leaveMovedSeat = useCallback(
    (seat: RoomSeat) => void leaveRoomSeat(room, seat.roomId).catch(() => undefined),
    [room],
  );
  const requestRejoin = useRoomRejoin({
    channel,
    roomId,
    renew: renewSeat,
    onRoomChanged: leaveMovedSeat,
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

  // 표시용 카메라 상태는 획득 실패(권한 거부 등)도 꺼짐으로 취급한다 — 검은 화면을
  // 켜짐으로 그리지 않는다. 컨트롤은 일시정지 여부만 본다: 룸의 카메라 끔 = 측정
  // 일시정지와 동일하고, 획득 실패의 온전한 처리(수동 타이머 모드)는 별도 티켓이다.
  // 그룹 공부방의 뽀모도로 휴식은 측정만 멈추는 일시정지라 카메라와 송신은 휴식을 뺀 일시정지만 본다.
  const flags = roomSessionFlags(sessionState);
  const cameraHeld = flags.cameraHeld;
  // 과목 표시처럼 측정이 멈췄는지를 보이는 곳은 휴식도 멈춘 것으로 그린다.
  const paused = sessionState.kind === "PAUSE";
  const cameraOn = !cameraHeld && isCameraRunning;

  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const faceMask = useFaceMaskedSend({
    sourceRef: videoRef,
    visionDetector,
    cameraStream,
    active: cameraOn || cameraDialogOpen,
  });
  const { remoteStreams, mesh } = usePeerMesh({
    channel,
    roomId,
    myUserId: userId,
    iceServers,
    cameraStream: faceMask.sendStream,
    trackEnabled: flags.trackEnabled,
    audio: room.kind === "group",
    createPeerConnection,
    onEvent: onDebugEvent,
  });
  useKeepMaskSourceLive(cameraStream, faceMask.on);
  const micOnUserIds = useMemo(
    () =>
      new Set(
        members
          .filter((member) => member.userId !== userId && member.micOn === true)
          .map((member) => member.userId),
      ),
    [members, userId],
  );
  // 소리는 그룹 공부방에서만 오간다.
  const audio = useRoomAudio({
    enabled: room.kind === "group",
    mesh,
    held: micHeld(appHidden, phase.name),
    micOnUserIds,
    onNotice: showCtaToast,
    ...audioDeps,
  });

  // 그룹장이 나를 내보내면 서버가 이미 공부방에서 나를 뺐다.
  // 채널을 먼저 끊어 자동 재연결이 방을 다시 구독하지 않게 하고 측정분을 제출한다.
  const [kicked, setKicked] = useState(false);
  const kickedRef = useRef(false);
  // 신고와 서버 차단으로 연결을 닫은 멤버이고, SNAPSHOT 뒤마다 같은 차단이 다시 온다.
  const [blockedUserIds, setBlockedUserIds] = useState<ReadonlySet<number>>(() => new Set());
  useGroupRoomEvents(channel, groupId, {
    onKicked: () => {
      if (kickedRef.current) {
        return;
      }
      kickedRef.current = true;
      setKicked(true);
      channel.disconnect();
      void endAndSubmit(autoEndReason("BACKGROUND"));
    },
    onPeerBlocked: (blockedUserId) => {
      if (blockedUserIds.has(blockedUserId)) {
        return;
      }
      mesh.blockPeer(blockedUserId);
      setBlockedUserIds((previous) => new Set(previous).add(blockedUserId));
    },
  });

  const report = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (input: { groupId: number; userId: number; reason: string }) =>
      reportGroupMember(input.groupId, input.userId, input.reason),
    // 계측은 화면 처리와 달리 공부방을 떠난 뒤 온 응답에도 남긴다.
    onSuccess: () => trackGroupRoomReported("member"),
  });

  /**
   * 공부방 신고 보내기
   *
   * 신고하면 서버가 차단도 하지만 서버의 차단 알림을 기다리지 않고 바로 그 사람과의 연결을 닫는다.
   * 결과 처리는 이번 호출에만 걸어서 공부방을 떠난 뒤 늦게 온 응답이 다른 화면에 토스트를 띄우지 않는다.
   * 보내지 못하면 신고 화면에 남아 다시 보낼 수 있다.
   * 그사이 그룹을 떠났거나 내보내진 멤버는 다시 보내도 같은 답이라 멤버 관리 화면처럼 안내 없이 신고 화면만 닫는다.
   */
  function submitReport(reason: string) {
    if (reportTarget === null || groupId === null || report.isPending) {
      return;
    }
    const target = reportTarget;
    const closeTargetLayer = () =>
      setReportTarget((current) => (current?.userId === target.userId ? null : current));
    haptic("medium");
    report.mutate(
      { groupId, userId: target.userId, reason },
      {
        onSuccess: () => {
          mesh.blockPeer(target.userId);
          setBlockedUserIds((previous) => new Set(previous).add(target.userId));
          // 설정의 차단 목록이 받아 둔 목록을 보여 주지 않게 한다.
          void queryClient.invalidateQueries({ queryKey: groupKeys.blocks(userId) });
          showCtaToast(t("liveRoomSession.reportedAndBlocked", { nickname: target.nickname }));
          closeTargetLayer();
        },
        onError: (error) => {
          if (groupErrorCode(error) === "GROUP_MEMBER_NOT_FOUND") {
            closeTargetLayer();
            return;
          }
          showCtaToast(groupErrorCopy("report", error));
        },
      },
    );
  }

  const kick = useMutation({
    ...GROUP_MUTATION_OPTIONS,
    mutationFn: (input: { groupId: number; userId: number }) =>
      kickGroupMember(input.groupId, input.userId),
  });

  /**
   * 공부방에서 멤버 내보내기
   *
   * 결과가 올 때까지 확인 창을 열어 두어 같은 멤버를 두 번 내보내지 않는다.
   * 비공개 그룹은 내보내면 서버가 초대코드를 새로 만들어서 그룹장에게 알리고 받아 둔 코드를 다시 받게 한다.
   * 그사이 그룹을 떠났거나 이미 내보낸 멤버는 다시 보내도 같은 답이라 멤버 관리 화면처럼 안내 없이 창만 닫는다.
   */
  function confirmKick() {
    if (kickTarget === null || groupId === null || kick.isPending) {
      return;
    }
    const target = kickTarget;
    const isPrivate = groupHome.data?.visibility === "PRIVATE";
    const closeTargetDialog = () =>
      setKickTarget((current) => (current?.userId === target.userId ? null : current));
    haptic("medium");
    kick.mutate(
      { groupId, userId: target.userId },
      {
        onSuccess: () => {
          closeTargetDialog();
          if (isPrivate) {
            showCtaToast(inviteCodeRenewedCopy());
            void queryClient.invalidateQueries({ queryKey: groupKeys.invite(userId, groupId) });
          }
          void invalidateGroupMembership(queryClient, userId, groupId);
        },
        onError: (error) => {
          closeTargetDialog();
          if (groupErrorCode(error) === "GROUP_MEMBER_NOT_FOUND") {
            void invalidateGroupMembership(queryClient, userId, groupId);
            return;
          }
          showCtaToast(groupErrorCopy("kick", error));
        },
      },
    );
  }

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
  const detectionEnabled = phase.name === "studying" && flags.detecting;

  useEffect(() => {
    return () => {
      visionDetector.close();
    };
  }, [visionDetector]);

  // 그룹 공부방의 타이머는 싱글룸처럼 휴식을 세션 휴식으로 바꾼다.
  // 공부방에서 멈춘 세션을 다시 시작하는 일은 카메라 켜기라서 영상 공유 확인 창을 거친다.
  // 카메라를 꺼 멈춘 공부방을 휴식으로 되돌리는 것도 카메라를 켜는 일이라 같은 확인 창을 거친다.
  // 확인하면 다시 흐르는 공부방을 타이머가 휴식으로 되돌린다.
  const timer = useMultiTimer({
    sessionState,
    studying: phase.name === "studying",
    onStartBreak: () => (cameraHeld ? openCameraConfirm() : startBreak()),
    onEndBreak: endBreak,
    onResumeSession: () => openCameraConfirm(),
    usage: multiTimerUsage,
  });
  const timerSheet = useRoomTimerSheet(timer, phase.name === "studying");
  const timerSheetLandscape = useLandscapeLayout(timerSheet.open);
  // 타이머 시트는 따로 받아서 처음 누를 때 기다리지 않게 한가한 때 미리 받는다.
  useEffect(() => {
    if (room.kind === "group") {
      whenIdle(preloadRoomTimerSheet);
    }
  }, [room.kind]);

  // 서버에 알리는 카메라 상태 — 사용자 의도(cameraWanted)를 함께 본다. 끄고 입장의
  // 첫 렌더는 pause가 effect로 적용되기 전이라, paused만 보면 켜짐이 먼저 새 나간다.
  // 마이크와 휴식은 그룹 공부방만 보내고 초대코드 방은 지금처럼 보내지 않는다.
  useRoomStatePublisher(channel, {
    sessionState,
    focusSec,
    cameraOn: cameraWanted && cameraOn,
    micOn: room.kind === "group" ? audio.micOn : undefined,
    onBreak: room.kind === "group" ? flags.onBreak : undefined,
    myUserId: userId,
  });

  // 내 타일은 로컬 세션 값 기준
  const serverMe = members.find((m) => m.userId === userId);
  // 그룹장은 공부방이 알려 주는 내 값으로 정하고, 서버가 그 값을 보내지 않는 동안에는 그룹 홈의 내 역할을 본다.
  const isOwner =
    typeof serverMe?.owner === "boolean" ? serverMe.owner : groupHome.data?.myRole === "OWNER";
  const myMember: RoomMember = {
    userId,
    nickname: profile?.nickname ?? serverMe?.nickname ?? t("me"),
    goal: profile?.goal ?? serverMe?.goal ?? null,
    profileImageUrl: profile?.profileImageUrl ?? serverMe?.profileImageUrl ?? null,
    cameraOn,
    focusState: sessionState.kind === "DISTRACTION" ? "DISTRACTED" : "FOCUS",
    focusSec,
  };
  const others = members.filter((m) => m.userId !== userId);
  const allMembers = orderedMembers([myMember, ...others], userId);
  // 메뉴를 연 멤버가 나가면 그 타일과 함께 메뉴도 사라지므로 열림을 거둔다.
  if (menuUserId !== null && !others.some((member) => member.userId === menuUserId)) {
    setMenuUserId(null);
  }
  // 함께한 시간은 휴식과 카메라를 꺼 멈춘 동안을 빼고, 차단해 영상이 오가지 않는 멤버도 세지 않는다.
  const readTogetherSec = useTogetherSeconds({
    counting: phase.name === "studying" && sessionState.kind !== "PAUSE",
    othersWithCamera: others.filter(
      (member) => member.cameraOn && !blockedUserIds.has(member.userId),
    ).length,
    systemPause,
  });
  const exitVisibility =
    groupHome.data === undefined ? undefined : toRoomVisibility(groupHome.data.visibility);

  // 숨은 원본에는 카메라를, 내 타일에는 상대에게 보내는 영상을 붙인다.
  // 보이는 것과 보내는 것이 같고, 이모지를 그리는 곳이 합성기 하나뿐이게 한다.
  useEffect(() => {
    for (const [video, stream] of [
      [videoRef.current, cameraStream],
      [tileVideoRef.current, faceMask.sendStream],
    ] as const) {
      if (video && video.srcObject !== stream) {
        video.srcObject = stream ?? null;
        if (stream) {
          startVideoPlayback(video);
        }
      }
      // autoplay 속성만으로는 iOS WKWebView에서 재생이 시작되지 않을 수 있다 —
      // 사유·재시도 규칙은 kickVideoPlayback 주석 참고.
      if (video) {
        kickVideoPlayback(video);
      }
    }
  });

  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  // 일시정지 중 카메라 켜기 미리보기가 열려 있거나 휴식 중에 영상이 나가면 이모지 자리만 구한다.
  // 세션 판정에는 넣지 않는다.
  const previewDetection = visionPreview({
    detectionEnabled,
    faceMaskOn: faceMask.on,
    cameraDialogOpen,
    onBreak: flags.onBreak,
    studying: phase.name === "studying",
  });
  useEffect(() => {
    visionDetector.setPreviewOnly(previewDetection);
    if (detectionEnabled) {
      detector.start();
    } else if (previewDetection) {
      visionDetector.start();
    } else {
      detector.stop();
      visionDetector.stop();
    }
  }, [detectionEnabled, previewDetection, detector, visionDetector]);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { selfSurfaceRef, previewAspect, measurePreviewAspect } =
    useCameraPreviewAspect(cameraDialogOpen);
  const leavingRef = useRef(false);
  // 체류 시간(social_room_exited.duration_sec)의 기점 — 이 컴포넌트 마운트가 곧 입장이다.
  const [enteredAtMs] = useState(() => Date.now());

  // 순공이 0초면 기록에 남지 않는다. 저장을 약속하면 화면이 거짓말이 된다(종료 확인 창의
  // 순공 없음 문구와 같은 원칙). 제출은 그래도 한다.
  // 두 번째 문장은 줄을 바꿔 보여준다(2026-08-26 실기기 확인 피드백). 문구는 소셜 홈이 띄운다.
  const graceEndNotice = useCallback(
    (submitted: boolean) =>
      focusSec < MIN_RECORDED_FOCUS_SEC
        ? t("notice.graceEndNoFocus")
        : submitted
          ? t("notice.graceEndSaved")
          : t("notice.graceEndPending"),
    [focusSec, t],
  );

  // 방에 다시 들어갈 수 없어(자리 회수) 세션을 마쳤을 때의 안내. 저장·미저장·순공 없음을
  // 유예 만료와 같은 기준으로 가른다.
  const roomUnavailableNotice = useCallback(
    (submitted: boolean) =>
      focusSec < MIN_RECORDED_FOCUS_SEC
        ? t("notice.roomClosedNoFocus")
        : submitted
          ? t("notice.roomClosedSaved")
          : t("notice.roomClosedPending"),
    [focusSec, t],
  );

  // 제출 성공 → 퇴장 알림은 응답을 기다리지 않는다. 백그라운드 자동 종료(유예 만료)는
  // 제출이 실패해도 내보낸다. 서버가 마지막 진행 스냅샷으로 세션을 확정한다. 안내는 도착지(소셜
  // 홈)가 띄우므로 sessionStorage 1회성 플래그로 넘긴다. 실패 이탈은 leaveRoom을
  // 부르지 않는다 — 유예가 끝났으면 서버가 이미 자리를 회수했다.
  // 그룹 공부방은 그 그룹의 그룹 홈으로 돌아가고 나가기는 그룹 공부방 나가기 API로 한다.
  useEffect(() => {
    if (leavingRef.current) {
      return;
    }
    const homePath = liveRoomHomePath(room);
    // 그룹 공부방은 소셜 탭 웹뷰 안에서 그룹 홈으로 돌아가 도착한 화면이 바로 안내를 띄워야 해서 앱 전환 표시를 싣지 않는다.
    const goHome = () =>
      navigate(
        { pathname: homePath, search: location.search },
        room.kind === "invite"
          ? { replace: true, state: { noticeHandoff: true } }
          : { replace: true },
      );
    // 내보내지면 서버가 이미 공부방에서 나를 빼서 나가기 API를 부르지 않고 결과 화면도 건너뛴다.
    // 그룹 탭도 같은 웹뷰 안이라 앱 전환 표시 없이 가서 도착한 그룹 탭이 안내를 띄운다.
    if (kicked && (phase.name === "done" || phase.name === "error")) {
      leavingRef.current = true;
      markSocialRoomNotice({
        kind: "failure",
        message: kickedNotice(groupHome.data?.name ?? null),
      });
      // 그룹 탭이 내 그룹을 다시 받는 동안 내보내진 그룹 카드가 남지 않게 받아 둔 목록과 그 그룹의 조회에서 뺀다.
      if (room.kind === "group") {
        dropFromMyGroups(queryClient, userId, room.groupId);
        forgetGroup(queryClient, userId, room.groupId);
      }
      void invalidateGroupMembership(queryClient, userId);
      navigate({ pathname: "/social", search: location.search }, { replace: true });
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
        togetherSec: readTogetherSec(),
        visibility: exitVisibility,
      });
    // 방 자체가 사라진 종료는 focusSec와 무관하게 결과 화면이 아니라 소셜 홈으로 보낸다.
    // 자리가 이미 회수됐으므로 leaveRoom은 부르지 않는다.
    if (roomUnavailable && (phase.name === "done" || phase.name === "error")) {
      leavingRef.current = true;
      const submitted = phase.name === "done";
      markSocialRoomNotice({ kind: "grace-end", message: roomUnavailableNotice(submitted) });
      trackExit();
      goHome();
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
      void leaveRoomSeat(room, roomId).catch(() => undefined);
      if (nav.to === "result") {
        // 그룹 공부방은 결과 화면으로 가는 수동 종료도 공부방을 나온 것이라 함께한 시간과 함께 센다.
        // 초대코드 방은 이 경로에서 퇴장을 보내지 않던 지금 분석을 유지하기로 정했다.
        if (room.kind === "group") {
          trackExit();
        }
        navigate(
          { pathname: liveRoomResultPath(room, roomId), search: location.search },
          { replace: true, state: { sessions: nav.sessions } },
        );
        return;
      }
      if (expired) {
        markSocialRoomNotice({ kind: "grace-end", message: graceEndNotice(true) });
      }
      trackExit();
      goHome();
      return;
    }
    if (phase.name === "error" && expired) {
      leavingRef.current = true;
      markSocialRoomNotice({ kind: "grace-end", message: graceEndNotice(false) });
      trackExit();
      goHome();
    }
  }, [
    allMembers.length,
    endReason,
    enteredAtMs,
    exitVisibility,
    focusSec,
    graceEndNotice,
    graceExpired,
    groupHome.data?.name,
    isExpiredNow,
    kicked,
    location.search,
    navigate,
    phase,
    queryClient,
    readTogetherSec,
    room,
    roomId,
    roomUnavailable,
    roomUnavailableNotice,
    userId,
  ]);

  const myVideo = (
    // 셀프뷰 보정: brightness/saturate 필터는 이 <video>의 로컬 렌더링에만 적용된다
    // — P2P 송신 트랙(cameraStream)은 필터를 거치지 않고 원본 그대로 나간다.
    // 가리는 동안에는 보내는 영상을 그대로 보여 주려고 보정을 뺀다.
    <video
      ref={tileVideoRef}
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
        "amp-block sentry-block pointer-events-none size-full object-cover",
        !faceMask.on && "filter-[brightness(1.06)_saturate(1.1)]",
        // 합성 영상도 반전하지 않은 원본 방향이라 전면 카메라는 표시만 뒤집는다.
        cameraFacing === "front" && "scale-x-[-1]",
      )}
    />
  );
  const dialogOpen = cameraDialogOpen || exitDialogOpen;
  const controlsLocked = phase.name !== "studying";
  // 모달 메뉴가 열린 동안 바와 위쪽 버튼이 누름을 받으면 메뉴 뒤에서 눌리고 바깥 누름으로 메뉴가 닫히지 않는다.
  // 신고 화면, 내보내기 확인 창, 타이머 시트가 열린 동안에도 조작이 숨지 않고 눌리지 않게 함께 막는다.
  // 앱 유리 버튼은 그 화면들의 aria-modal을 보고 숨는다.
  const controlsInactive =
    moreMenuOpen ||
    menuUserId !== null ||
    reportTarget !== null ||
    kickTarget !== null ||
    timerSheet.open;

  // 잠금(제출 중·에러)·다이얼로그 동안은 컨트롤을 강제로 보인다.
  const controlsAlwaysVisible = controlsLocked || dialogOpen || controlsInactive || page !== null;
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
    trackSubjectSheetOpened(source, "social");
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
      roomType: "social",
    });
    setPage(null);
  }

  // 알약으로 열었는데 페이지에서 과목을 해제하면 알약이 사라지므로 과목 버튼으로 돌아간다.
  function subjectReturnFocus() {
    const opener = subjectOpenerRef.current;
    return opener?.isConnected ? opener : subjectButtonRef.current;
  }

  const subjectButtonLabel =
    subjectSelection === null
      ? t("study-session:subjectSheet.title")
      : t("study-session:controls.subjectSelected");
  const subjectNative = useNativeControl<HTMLButtonElement>(
    {
      id: "room-subject",
      kind: "button",
      title: null,
      systemImage: "book",
      shape: "circle",
      disabled: controlsLocked || moreMenuOpen,
      accessibilityLabel: subjectButtonLabel,
      tone: subjectSelection === null ? "default" : "active",
      faded: !controlsVisible,
    },
    () => {
      // 앱 누름에는 누른 웹 요소가 없어서 숨겨 둔 웹 버튼을 연 요소로 둔다.
      if (subjectButtonRef.current !== null) {
        openSubjectPage("button", subjectButtonRef.current);
      }
    },
    { measureIcon: true, iconScale: SESSION_SYMBOL_SCALE },
  );

  function handleSelectSubject(next: SubjectSelection | null) {
    // 일시정지 중에 이미 고른 과목의 재생 버튼을 누르면 선택은 그대로다.
    // 전이가 없으니 계측도 남기지 않는다.
    if (next === subjectSelection) {
      return;
    }
    trackSubjectItemSelected(next === null ? "none" : "subject", "social");
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
  // 알약의 순공은 오늘(플래너 하루) 저장 기록에 이 세션 몫을 더한다.
  const subjectLabel =
    subjectSelection === null
      ? null
      : {
          name: selectedSubject?.name ?? t("study-session:subjectSheet.title"),
          focusSec:
            (selectedSubject?.focusSec ?? 0) +
            liveSubjectTime(liveSubjectTotals, subjectSelection).focusSec,
        };

  /**
   * 그룹 공부방 타일의 말하는 중, 마이크, 차단 표시와 멤버 메뉴
   *
   * 내 타일은 내 마이크로 판정하고 메뉴가 없다.
   * 닉네임을 아직 받지 못한 멤버는 누구인지 보이지 않아서 메뉴를 두지 않는다.
   * 차단한 멤버와는 소리가 오가지 않아서 마이크도 꺼짐으로 보이고 말하는 중이 아니다.
   */
  function groupTileExtras(member: RoomMember) {
    if (member.userId === userId) {
      return { speaking: audio.selfSpeaking, micOn: audio.micOn };
    }
    const nickname = member.nickname;
    const blocked = blockedUserIds.has(member.userId);
    return {
      speaking: !blocked && audio.speakingUserIds.has(member.userId),
      micOn: !blocked && member.micOn === true,
      blocked,
      menuButton:
        nickname === undefined || nickname === "" ? undefined : (
          <RoomMemberMenu
            nickname={nickname}
            volume={audio.volumeOf(member.userId)}
            muted={audio.isMuted(member.userId)}
            canKick={isOwner}
            placement={menuLandscape ? "above" : "below"}
            open={menuUserId === member.userId}
            container={sessionSurface}
            onOpen={() => setMenuUserId(member.userId)}
            onClose={() => setMenuUserId(null)}
            onVolumeChange={(volume) => audio.setVolume(member.userId, volume)}
            onToggleMute={() => audio.setMuted(member.userId, !audio.isMuted(member.userId))}
            onReport={() => {
              // 메뉴가 메뉴 버튼에 포커스를 돌려준 뒤에 불러서 지금 포커스가 그 버튼이다.
              const opener = document.activeElement;
              reportOpenerRef.current = opener instanceof HTMLElement ? opener : null;
              setReportTarget({ userId: member.userId, nickname });
            }}
            onKick={() => setKickTarget({ userId: member.userId, nickname })}
          />
        ),
    };
  }

  return (
    <main
      ref={setSessionSurface}
      data-testid="live-room-page"
      {...(room.kind === "group" ? GROUP_ROOM_ANALYTICS_MASK : undefined)}
      {...surfaceProps}
      // overflow-hidden: 자동 숨김으로 화면 밖까지 내려간 컨트롤 바를 잘라 문서 스크롤이 생기지 않게 한다.
      className="theme-dark relative flex h-dvh flex-col overflow-hidden bg-background"
      style={sessionSurfaceStyle}
    >
      {/* 추론·송신 합성용 숨은 원본. display:none이면 엔진이 영상 갱신을 멈출 수 있어 투명하게만 둔다. */}
      <video
        ref={videoRef}
        aria-hidden="true"
        playsInline
        muted
        {...VIDEO_PLAYBACK_KICK_PROPS}
        className="amp-block sentry-block pointer-events-none fixed top-0 left-0 size-px opacity-0"
      />
      {debugEnabled && (
        <RoomDebugOverlay
          roomId={roomId}
          userId={userId}
          channelStatus={channel.status}
          members={members}
          remoteStreams={remoteStreams}
          peerPaths={peerPaths}
          lines={faceMask.debugLine === "" ? debugLines : [faceMask.debugLine, ...debugLines]}
        />
      )}
      {/* 다이얼로그의 포커스 트랩·바깥 차단은 Radix 가 스스로 한다. inert 를 겹치면 닫힐 때
          포커스를 돌려줄 요소가 이미 inert 라 복귀가 실패한다. */}
      {/* 아래 바 높이는 화면 크기별로 여기서 정한다. */}
      <div className="contents [--room-bar-height:--spacing(18.5)] regular:[--room-bar-height:--spacing(22)] short-side-lg:[--room-bar-height:--spacing(27.5)]">
        <RoomGrid
          allMembers={allMembers}
          userId={userId}
          myVideo={myVideo}
          remoteStreams={remoteStreams}
          selfSurfaceRef={selfSurfaceRef}
          variant={room.kind}
          tileExtras={room.kind === "group" ? groupTileExtras : undefined}
          capsuleShown={room.kind === "group" && timerSheet.active}
          barHidden={!controlsVisible}
        />

        {room.kind === "group" ? (
          <GroupRoomTopBar
            subject={
              selectedSubject === null
                ? null
                : { name: selectedSubject.name, colorIndex: selectedSubject.colorIndex }
            }
            focusSec={focusSec}
            studySec={studySec}
            paused={paused}
            hidden={!controlsVisible}
            inactive={controlsInactive}
            subjectDisabled={controlsLocked}
            othersMuted={audio.othersMuted}
            flipDisabled={cameraHeld || controlsLocked}
            onOpenSubject={(opener) => openSubjectPage("label", opener)}
            onToggleOthersMuted={audio.toggleOthersMuted}
            onFlipCamera={() => void flipCamera()}
          />
        ) : (
          <>
            {/* 조작이 숨어도 내 시간은 계속 보여야 해서 숨김 대상 밖에 둔다. */}
            <div className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+6px)] right-[calc(env(safe-area-inset-right)+16px)] left-[calc(env(safe-area-inset-left)+16px)] flex flex-col items-start landscape-compact:top-[calc(env(safe-area-inset-top)+16px)] regular:top-[calc(env(safe-area-inset-top)+16px)]">
              <RoomTimeText
                focusSec={focusSec}
                studySec={studySec}
                totalHidden={!controlsVisible}
              />
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

            <SessionMoreMenu
              container={sessionSurface}
              hidden={!controlsVisible}
              flipDisabled={cameraHeld || controlsLocked}
              onFlipCamera={() => void flipCamera()}
              onShareInvite={() => {
                void shareInvite(room.inviteCode).then((result) => {
                  trackInviteShared(result, "room_menu");
                  trackMetaInviteShared(result);
                  // 공유 시트가 뜨거나 사용자가 닫은 경우는 OS가 이미 알려 줘서 복사만 토스트로 알린다.
                  if (result === "copied") {
                    showCtaToast(t("social-room:share.copied"));
                  }
                });
              }}
              onOpenChange={setMoreMenuOpen}
            />
          </>
        )}

        {/* 세로 폰은 바를 아래 안전 영역에 2px 걸치되, 안전 영역이 없는 기기에서는 화면 끝에 붙지 않게 8px을 남긴다.
            가로는 세로 기준 오프셋이 높아 보여서 6px만 띄운다.
            숨김 이동량은 가장 큰 오프셋인 태블릿 17px 기준이라 어느 배치에서도 바가 화면 밖까지 나간다. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(calc(env(safe-area-inset-bottom)-2px),8px)] flex flex-col items-center gap-2 landscape-compact:bottom-[calc(env(safe-area-inset-bottom)+6px)] regular:bottom-[calc(env(safe-area-inset-bottom)+17px)]">
          {/* 페이지가 열린 동안은 페이지 푸터의 Toaster가 받는다.
              둘이 함께 있으면 토스트가 두 번 뜬다. */}
          {page === null && <CtaToaster />}
          {phase.name === "submitting" && (
            <p className="text-sm text-white/80">{t("study-session:submit.saving")}</p>
          )}
          {room.kind === "group" && timerSheet.active && timer.mode !== null && (
            // 세로는 바 바로 위에 두고, 바 옆에 자리가 넉넉한 가로 폰은 바와 같은 높이의 오른쪽 끝에 둔다.
            // 좁은 가로 폰은 바 옆에 두면 나가기 버튼에 겹쳐서 세로처럼 바 위에 둔다.
            // 타일 격자가 이 자리에서 나온 캡슐 띠를 비우므로 자리를 바꾸면 RoomGrid의 띠도 함께 바꾼다.
            <div className="mb-1 flex landscape-compact:md:absolute landscape-compact:md:right-[calc(env(safe-area-inset-right)+6px)] landscape-compact:md:bottom-3.25 landscape-compact:md:mb-0">
              <RoomTimerCapsule
                mode={timer.mode}
                remainingMs={timer.remainingMs}
                held={timer.held}
                timerId={timerSheet.capsuleTimerId}
                primaryRef={timerSheet.capsulePrimaryRef}
                onPrimary={timer.pressPrimary}
                onOff={timer.close}
              />
            </div>
          )}
          {phase.name === "error" && (
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              <p className="text-sm text-(--session-exit-bg)">{phase.message}</p>
              <button
                type="button"
                onClick={() => void endAndSubmit()}
                className="min-h-11 rounded-full bg-white/12 px-5 text-sm font-semibold text-white"
              >
                {t("study-session:submit.retry")}
              </button>
            </div>
          )}
          {/* "저장 중..."·"다시 제출"은 숨김 대상이 아니다 — 바만 아래로 내려간다. */}
          <RoomControlBar
            cameraOn={!cameraHeld}
            disabled={controlsLocked}
            hidden={!controlsVisible}
            inactive={controlsInactive}
            onToggleCamera={() => {
              // 휴식 중에 카메라를 끄면 휴식이 끝나고 카메라를 끈 일시정지가 된다.
              if (!cameraHeld) {
                trackSocialRoomCameraToggled(false, faceMask.on);
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
            {room.kind === "group" ? (
              <>
                <MicButton
                  on={audio.micOn}
                  disabled={controlsLocked}
                  inactive={controlsInactive}
                  hidden={!controlsVisible}
                  onToggle={() => {
                    haptic("light");
                    audio.toggleMic();
                  }}
                />
                <TimerButton
                  on={timerSheet.active}
                  expanded={timerSheet.open}
                  disabled={controlsLocked}
                  inactive={controlsInactive}
                  hidden={!controlsVisible}
                  describedBy={timerSheet.capsuleTimerId}
                  onOpen={timerSheet.pressTimerButton}
                />
              </>
            ) : (
              <button
                ref={(node) => {
                  subjectButtonRef.current = node;
                  subjectNative.ref(node);
                }}
                type="button"
                // 이 버튼은 과목을 고르지 않고 페이지를 열어서, 고른 상태는 이름과 색으로 전한다.
                aria-label={subjectButtonLabel}
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
            )}
            <AmbientSoundButton
              ref={ambientButtonRef}
              nativeId="room-ambient"
              className={roomBarButtonClassName}
              onPointerDown={playPressPop}
              disabled={controlsLocked}
              inactive={controlsInactive}
              faded={!controlsVisible}
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
          faceMask.supported ? (
            // 원본과 가린 영상을 미리 둘 다 재생해 겹쳐 두고 스위치는 위쪽만 숨긴다.
            // 바꿀 때마다 영상을 새로 붙이면 iOS가 첫 프레임을 꽉 채우지 않고 그려 좌우 여백이 잠깐 보인다.
            <div className="relative size-full">
              <ClonedTrackPreview
                stream={cameraStream}
                facing={cameraFacing}
                targetAspect={previewAspect ?? undefined}
              />
              <div className={cn("absolute inset-0", !faceMask.on && "opacity-0")}>
                <ClonedTrackPreview
                  stream={cameraStream === null ? null : faceMask.maskedStream}
                  facing={cameraFacing}
                  targetAspect={previewAspect ?? undefined}
                />
                {faceMask.on && faceMask.faceSpot === null && <FaceMaskSearchingBadge />}
              </div>
            </div>
          ) : (
            <ClonedTrackPreview
              stream={cameraStream}
              facing={cameraFacing}
              targetAspect={previewAspect ?? undefined}
            />
          )
        }
        faceMask={{
          supported: faceMask.supported,
          on: faceMask.on,
          onChange: faceMask.setOn,
          emojis: FACE_MASK_EMOJIS,
          emojiId: faceMask.emojiId,
          onEmojiChange: faceMask.setEmojiId,
        }}
        onCancel={() => {
          trackSocialRoomCameraOnDismissed();
          setCameraDialogOpen(false);
        }}
        onConfirm={() => {
          haptic("medium");
          trackSocialRoomCameraToggled(true, faceMask.on);
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
        title={t("study-session:subjectSheet.title")}
        headerExtras={
          <SessionPageHeaderTime
            focusSec={focusSec}
            stateColor={sessionStateColors[sessionState.kind].dark}
          />
        }
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
            // 휴식 중에는 카메라가 켜져 있어서 확인 창 없이 과목만 바꾼다.
            if (cameraHeld) {
              openCameraConfirm(subjectReturnFocus);
            }
          }}
          paused={paused}
          onNotice={showCtaToast}
          liveTotals={liveSubjectTotals}
          landscape={pageLandscape}
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
        title={t("study-session:exitConfirm.title")}
        description={exitConfirmDescription(focusSec)}
        cancelLabel={t("study-session:exitConfirm.cancel")}
        confirmLabel={t("study-session:exitConfirm.confirm")}
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
      {room.kind === "group" && (
        <LazyRoomTimerSheet
          open={timerSheet.open}
          landscape={timerSheetLandscape}
          container={sessionSurface}
          timer={timer}
          onClose={timerSheet.closeSheet}
        />
      )}
      {room.kind === "group" && (
        <SessionConfirmDialog
          open={kickTarget !== null}
          container={sessionSurface}
          {...kickDialogCopy(kickShown?.nickname ?? "")}
          pending={kick.isPending}
          // 창 제목과 설명에 멤버의 닉네임이 들어간다.
          maskFromAnalytics
          // 내보낸 멤버의 메뉴 버튼은 그 타일과 함께 사라져서 바의 배경음 버튼으로 돌아간다.
          returnFocus={() => ambientButtonRef.current}
          onCancel={() => setKickTarget(null)}
          onConfirm={confirmKick}
        />
      )}
      {room.kind === "group" && (
        <ReportMemberLayer
          open={reportTarget !== null}
          nickname={reportTarget?.nickname ?? ""}
          container={sessionSurface}
          pending={report.isPending}
          onSubmit={submitReport}
          onClose={() => setReportTarget(null)}
          returnFocus={() => reportOpenerRef.current}
        />
      )}
    </main>
  );
}

/**
 * 공부방 안 내보내기 확인 창 문구
 *
 * 멤버 관리와 같은 문구를 쓰고 창은 세션 모양이라 확인 버튼은 세션의 빨강이다.
 */
function kickDialogCopy(nickname: string) {
  const { title, description, cancelLabel, confirmLabel } = kickMemberDialog(nickname);
  return { title, description, cancelLabel, confirmLabel, confirmTone: "danger" as const };
}
