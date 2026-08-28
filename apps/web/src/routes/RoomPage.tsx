import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { StudySessionResponse } from "@focusmakers/types";

import { Toast } from "@/components/ui/toast";
import { createDeviceHandlingDetector } from "@/features/study-session/adapters/deviceHandlingDetector";
import {
  combineFocusDetectors,
  createVisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { AutoEndNotice } from "@/features/study-session/components/AutoEndNotice";
import { CameraPreviewSurface } from "@/features/study-session/components/CameraPreviewSurface";
import { DevVisionFailureNotice } from "@/features/study-session/components/DevVisionFailureNotice";
import { SessionCaption } from "@/features/study-session/components/SessionCaption";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { SessionControlBar } from "@/features/study-session/components/SessionControlBar";
import { SessionStatusPill } from "@/features/study-session/components/SessionStatusPill";
import type { SessionStatusPillState } from "@/features/study-session/components/SessionStatusPill";
import { SessionTimer } from "@/features/study-session/components/SessionTimer";
import { SimpleModeSurface } from "@/features/study-session/components/SimpleModeSurface";
import { SubMinuteEndNotice } from "@/features/study-session/components/SubMinuteEndNotice";
import { resolveDevDetectorOverride } from "@/features/study-session/devMockDetector";
import { SUB_MINUTE_SEC, formatElapsed } from "@/features/study-session/formatDuration";
import {
  CAMERA_TOAST_COPY,
  EXIT_CONFIRM_COPY,
  captionFor,
  exitConfirmDescription,
  statusCopyFor,
} from "@/features/study-session/sessionCopy";
import type {
  PauseTrigger,
  SessionEndReason,
  SessionState,
} from "@/features/study-session/sessionState";
import { MANUAL_END_REASON } from "@/features/study-session/sessionState";
import { sessionGlowStyle, sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { useToast } from "@/lib/useToast";
import { useRotationRepaintNudge } from "@/lib/rotationRepaint";
import { useGestureVideoPlaybackKick } from "@/lib/videoPlayback";
import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import { parseUserId, useStudyRoomSession } from "@/features/study-session/useStudyRoomSession";
import { postToNative } from "@/lib/bridge";
import { cn } from "@/lib/utils";

/**
 * 세션 레이어의 세로/가로 배치 (S3-1~S3-4 ↔ S3-5·S3-6).
 *
 * **세로는 flex 컬럼, 가로는 3열 그리드**다. 방향은 `@media (orientation: landscape)`만 보고
 * 갈린다 — JS 방향 감지도, 방향 상태도 없다(`useStudyRoomSession`은 방향을 모른다).
 * 회전해도 **DOM 트리가 그대로**여야 포커스와 진행 중인 세션이 살아남기 때문이다
 * (SCR-S3-5·S3-6 Accessibility). 그래서 가로 프레임을 별도 라우트·별도 컴포넌트로 만들지 않고
 * 같은 자식들을 그리드 셀에 재배치하기만 한다.
 *
 * 가로 그리드(`1fr auto 1fr` × `auto 1fr auto auto auto`):
 *
 * ```text
 * row1 |        | 상태 필 | 순공 타이머(프리뷰) |  ← 필은 상단 중앙, 타이머는 우상단
 * row2 |         (심플 타이머 / 여백)          |  ← 1fr — 남는 세로 공간
 * row3 |               캡션                    |
 * row4 |            컨트롤 바                  |
 * row5 |          userId 미지정 안내           |
 * ```
 *
 * 절대 좌표를 쓰지 않는 이유: 가로 타이포(35/13/11px)가 세로보다 작아 폰트 확대 시 상태 필과
 * 우상단 타이머가 겹칠 수 있다. 두 요소를 **다른 열**에 두면 트랙이 늘어나며 서로 밀어낼 뿐
 * 겹치지 않는다(SCR-S3-5·S3-6 Accessibility).
 *
 * 여백은 Figma 실측(가로 pt 18 · pb 14 · px 28) + `env(safe-area-inset-*)`다. 가로에서는 좌우
 * 인셋이 커지므로(노치 쪽) `px-6` 대신 좌우를 따로 계산한다.
 */
const SESSION_LAYER_LAYOUT = [
  "pointer-events-none relative flex h-full w-full flex-col items-center",
  "pt-[calc(env(safe-area-inset-top)+13px)] pb-[calc(env(safe-area-inset-bottom)+17px)]",
  "pl-[calc(env(safe-area-inset-left)+24px)] pr-[calc(env(safe-area-inset-right)+24px)]",
  "landscape:grid landscape:grid-cols-[1fr_auto_1fr] landscape:grid-rows-[auto_1fr_auto_auto_auto] landscape:items-start",
  "landscape:pt-[calc(env(safe-area-inset-top)+18px)] landscape:pb-[calc(env(safe-area-inset-bottom)+14px)]",
  "landscape:pl-[calc(env(safe-area-inset-left)+28px)] landscape:pr-[calc(env(safe-area-inset-right)+28px)]",
].join(" ");

/**
 * 회전 구간의 수명 (BY-336, 2026-08-01).
 *
 * - `rotating`: 회전이 감지된 순간부터 뷰포트가 확정될 때까지.
 * - `settling`: 확정된 뒤 원래대로 되돌아가는 중. 전환이 끝나면 `idle`이다.
 */
type RotationPhase = "idle" | "rotating" | "settling";

function currentOrientation(): "portrait" | "landscape" {
  return window.innerWidth <= window.innerHeight ? "portrait" : "landscape";
}

/** 회전 애니메이션이 끝나고 뷰포트가 확정되기를 기다리는 시간(네이티브 회전은 약 300ms). */
const ROTATION_SETTLE_MS = 450;
/** 원래 배율로 되돌아가는 시간. 아래 `duration-300`과 같아야 한다 — 어긋나면 툭 끊긴다. */
const ROTATION_REVEAL_MS = 300;

/**
 * 지금이 회전 구간인가 — **프리뷰의 빈 공간을 막는 데 쓴다**(그 사용처는 `CameraPreviewSurface`).
 *
 * 기기를 돌리면 네이티브 뷰 회전과 WebView 리레이아웃이 한 프레임 어긋나면서, 카메라 서피스가
 * 잠깐 뷰포트보다 작게 잡혀 **가장자리에 빈 공간이 생긴다**(BY-336 실기기 관측).
 *
 * 처음에는 화면 전체를 블러로 덮어 그 구간을 안 보이게 했지만, 덮는 것 자체가 눈에 띈다는
 * 확인으로 걷어냈다. 지금은 **가리지 않고 메운다** — 회전 구간에만 프리뷰를 살짝 확대해
 * 빈 자리를 덮고, 뷰포트가 확정되면 원래 배율로 되돌린다. 정지 상태의 화각은 그대로다.
 *
 * `resize`만 보면 키보드·주소창 변화에도 반응하므로 **방향이 바뀐 경우**와
 * `orientationchange` 이벤트만 통과시킨다.
 */
function useRotationPhase(): RotationPhase {
  const [phase, setPhase] = useState<RotationPhase>("idle");

  useEffect(() => {
    let settled = currentOrientation();
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    function clearTimers() {
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (revealTimer !== null) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
    }

    function handle(fromOrientationEvent: boolean) {
      // 회전 도중의 중간 resize는 아직 이전 방향을 보고할 수 있어 `orientationchange`도 함께 받는다.
      if (!fromOrientationEvent && currentOrientation() === settled) {
        return;
      }
      clearTimers();
      setPhase("rotating");
      settleTimer = setTimeout(() => {
        settleTimer = null;
        settled = currentOrientation();
        setPhase("settling");
        revealTimer = setTimeout(() => {
          revealTimer = null;
          setPhase("idle");
        }, ROTATION_REVEAL_MS);
      }, ROTATION_SETTLE_MS);
    }

    const onResize = () => {
      handle(false);
    };
    const onOrientationChange = () => {
      handle(true);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientationChange);
    return () => {
      clearTimers();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, []);

  return phase;
}

/**
 * 세션 화면 — S3-1(집중)·S3-2(비집중)·S3-3(일시정지)·S3-4(심플 모드)는 **같은 화면**이다.
 * 별도 라우트를 만들지 않고 두 개의 **직교하는 축**으로 프레젠테이션이 갈린다:
 *
 * - **세션 상태**(`sessionState`: FOCUS / DISTRACTION / PAUSE) — "세션이 어떤 상태인가".
 *   상태 필·타이머 색·컨트롤 바 첫 버튼·하단 캡션이 여기 반응한다.
 * - **표시 모드**(`simpleMode`: 프리뷰 / 심플) — "어떻게 보여줄 것인가".
 *   카메라 프리뷰·하단 캡션의 유무와 타이머 발광·세로 배치가 여기 반응한다.
 *
 * 두 축은 서로를 리셋하지 않는다 — 심플 모드에서 일시정지했다가 다시 시작하면 심플 모드로
 * 돌아온다. 그래서 `simpleMode`는 `SessionState`에 넣지 않고 별도 토글로 둔다.
 *
 * **S3-5(가로 프리뷰)·S3-6(가로 심플)은 세 번째 축이 아니다** — 같은 두 축에 걸리는 순수
 * 레이아웃 변형이다. 방향은 상태로 들고 있지 않고 `@media (orientation: landscape)`가 판정한다
 * (`SESSION_LAYER_LAYOUT` 주석 참고). 명시적 회전 트리거 정책은 `ai-wiki` 어디에도 없다는 것이
 * SCR-S3-5·S3-6에서 확인됐고, 디자인에 방향 잠금·수동 전환 컨트롤도 없다.
 *
 * 라우트는 기존 `/room/:id?userId=N`을 유지하되 **방 번호를 표시하지 않는다** —
 * V1.0 싱글룸에는 사용자에게 보여줄 "방" 개념이 없다(`:id` 존치 여부는 리뷰 항목).
 *
 * 세션 계산(2축 타이머·상태 머신·이벤트 누적)은 전부 `useStudyRoomSession`과 그 아래
 * 순수 모듈에 있다 — 이 파일은 표시와 입력 배선만 한다.
 */
export function RoomPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = parseUserId(searchParams.get("userId"));
  const [camera] = useState(createMediaStreamCameraAdapter);
  // 저전력 모드에서 멈춘 카메라 프리뷰를 탭 제스처로 되살린다 — lib/videoPlayback.ts 주석 참고.
  useGestureVideoPlaybackKick();
  // iOS 회전 백지 방어 — 소셜룸 실기기에서 확인된 증상의 예방적 적용(같은 웹뷰 셸,
  // 이 화면도 회전 대상). 사유는 lib/rotationRepaint.ts 주석.
  useRotationRepaintNudge();
  /**
   * 프리뷰 `<video>` — **이 화면이 소유하고 두 곳에 나눠준다.**
   * 표시는 `CameraPreviewSurface`가, 추론은 `createVisionFocusDetector`가 같은 엘리먼트를 본다.
   * 감지용 `<video>`를 따로 만들면 디코드 경로가 하나 늘어난다(설계 §3).
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * DEV에서 `?detector=mock`이면 콘솔 mock이 이긴다 — 실기기 없이 비집중 시나리오를 재현해야
   * 할 때가 계속 있다. 그 외에는(프로덕션 포함) 아래 Vision 감지기가 쓰인다.
   */
  const [devDetector] = useState(() => resolveDevDetectorOverride(searchParams.get("detector")));
  const [visionDetector] = useState(() =>
    createVisionFocusDetector({ video: () => videoRef.current }),
  );
  /**
   * 감지기는 둘이다 — 카메라(`AWAY`·`PHONE`)와 가속도 센서(`DEVICE`). 담당 트리거가 겹치지
   * 않으므로 하나로 묶어 훅에 넘긴다. 수명(`start`/`stop`)도 함께 움직이는 것이 맞다 —
   * 설계 §5가 센서 정지 시점을 "카메라 추론 정지와 동일한 시점"으로 못박았다.
   */
  const [sensorDetector] = useState(() =>
    combineFocusDetectors([visionDetector, createDeviceHandlingDetector()]),
  );
  const detector = devDetector ?? sensorDetector;
  const {
    focusSec,
    studySec,
    sessionState,
    phase,
    endReason,
    cameraStream,
    cameraFacing,
    pause,
    resume,
    flipCamera,
    endAndSubmit,
  } = useStudyRoomSession(userId, { camera, detector });
  const { message: toastMessage, showToast } = useToast();
  // 심플 모드(S3-4)는 상태가 아니라 프레젠테이션 토글이다 — SessionState에 넣지 않는다.
  const [simpleMode, setSimpleMode] = useState(false);
  // S3-7 종료 확인 다이얼로그. 열려 있는 동안에도 **세션은 계속 진행된다**(Figma에서 딤 뒤
  // 상태 필이 `집중 측정 중`이고 타이머가 살아 있음을 확인 — ai-wiki 명시 서술은 없는
  // Figma 근거 추론이라 SCR-S3-7·S3-8 Review Checklist에 확인 항목으로 올라가 있다).
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  /**
   * 카메라 전환이 진행 중인가 — **추론 정지 구간을 표시하는 값이지 화면 상태가 아니다.**
   * 전환 중에는 기존 트랙이 멈추고 새 스트림이 `<video>`에 다시 붙는데, 그 사이의 프레임은
   * 판정에 쓸 수 없다(설계 §3 "카메라 전환"). 전환 실패는 기존 `CameraFlipResult` 그대로다.
   */
  const [flippingCamera, setFlippingCamera] = useState(false);
  const rotationPhase = useRotationPhase();

  const paused = sessionState.kind === "PAUSE";
  const statusCopy = statusCopyFor(sessionState);
  const pillState = toPillState(sessionState);
  /**
   * 공부 상태의 식별 키 — 심플 모드 엣지 글로우 **잔향**(SimpleModeSurface)이 상태 전환을
   * 감지하는 값이다. `isSameSessionState`와 같은 기준(kind + trigger)이라 실제 전환에서만
   * 바뀐다(200ms tick 리렌더로는 안 바뀜 — 훅이 같은 상태면 참조를 유지한다). 심플 모드
   * 진입도 잔향을 한 번 틀어야 하므로(design.md "전환 시 1~2초 잔향") `simpleMode`를 키에
   * 포함한다. 프리뷰로 돌아갈 때도 키는 바뀌지만, 서피스가 300ms 페이드아웃 중이라 그대로면
   * 잔향이 부분 가시 상태에서 재점화된다 — 그래서 SimpleModeSurface가 hidden일 때는
   * 잔향을 재생하지 않는다(그쪽 주석 참고).
   */
  const glowKey = `${simpleMode ? "simple" : "preview"}:${sessionState.kind}${
    sessionState.kind === "FOCUS" ? "" : `:${sessionState.trigger}`
  }`;

  /**
   * 추론 수명 (설계 §3) — **카메라 스트림과 분리된 축**이다.
   *
   * | 상황             | 카메라 | 추론 |
   * | ---------------- | ------ | ---- |
   * | 일시정지         | 유지   | 정지 |
   * | 카메라 전환 중   | 재연결 | 정지 |
   * | 세션 종료·제출   | 훅이 정리 | 정지 |
   *
   * 일시정지에서 스트림을 끄지 않는 이유는 셋이다 — Figma S3-3이 프리뷰를 그대로 보여주고,
   * 배터리 주 소모원은 카메라 피드가 아니라 추론이며, 스트림을 끄면 재개 시 `getUserMedia`
   * 재호출로 1~2초 공백이 생겨 그 구간이 측정되지 않는다.
   *
   * `start`/`stop`은 멱등이라 훅이 마운트 시 부르는 `detector.start()`와 겹쳐도 안전하다.
   */
  const detectionEnabled = phase.name === "studying" && !paused && !flippingCamera;
  useEffect(() => {
    if (detectionEnabled) {
      detector.start();
    } else {
      detector.stop();
    }
  }, [detectionEnabled, detector]);

  /**
   * 세션 이탈 — 모델과 GPU 컨텍스트를 놓는다. `stop()`은 추론만 멈추고 모델을 들고 있으므로
   * 이게 없으면 wasm 힙과 GPU 컨텍스트가 고아로 남는다(브라우저가 컨텍스트 개수를 제한한다).
   * 로딩 중에 언마운트돼도 뒤늦게 도착한 detector를 그 자리에서 닫는다(멱등).
   */
  useEffect(() => {
    return () => {
      visionDetector.close();
    };
  }, [visionDetector]);

  /**
   * S4(공부 결과)로 이동 — **세션 결과의 유일한 출구**다.
   *
   * S4가 세션 단건 조회 API를 아직 쓰지 않으므로, 제출 응답을 **라우터 state로 넘기는 것이
   * 지금의 전달 수단**이다. S4는 이 state가 없으면 데이터를 지어내지 않고 홈으로 되돌린다.
   *
   * 경로를 `/room/${id}/result`로 조립하지 않고 상대 이동(`"result"`)을 쓴다 — 현재 매치된
   * 라우트(`/room/:id`) 기준으로 해석되므로 `:id`를 다시 읽어 문자열을 맞출 필요가 없다.
   *
   * `replace: true`: 세션은 끝났다. 뒤로 가기로 이미 종료된 룸에 되돌아가면 타이머가 0부터
   * 다시 도는 새 세션이 시작돼 사용자에게 거짓이 된다 — 히스토리에서 룸을 치운다.
   */
  const goToResult = useCallback(
    (sessions: StudySessionResponse[]) => {
      // 쿼리(`?userId=N`)를 함께 넘긴다 — S4의 `확인`이 홈으로 되돌릴 때 같은 식별자가 필요하고,
      // 상대 이동은 검색 문자열을 자동으로 물려주지 않는다(BY-327 통합에서 실증).
      navigate(
        { pathname: "result", search: searchParams.toString() },
        { state: { sessions }, replace: true },
      );
    },
    [navigate, searchParams],
  );

  /**
   * 홈으로 이탈 — 미달 종료(순공 1분 미만)의 유일한 출구다.
   *
   * **네이티브 앱 안에서는 웹 라우터 이동만으로 부족하다.** 이 화면이 WebView로 로드된
   * 것이라 `navigate("/home")`는 WebView 안의 웹 홈을 열 뿐, 그 WebView를 담고 있는 네이티브
   * `fullScreenModal`을 닫아 탭 화면으로 돌아가지는 못한다(ADR 0001). 그래서 네이티브에
   * `navigate-home`을 먼저 보낸다 — 네이티브가 모달을 닫으면 이 화면 전체가 사라지므로
   * 아래 웹 라우터 이동은 그 사이 잠깐이라도 화면이 있을 브라우저 단독 모드(ADR 0001)를 위한
   * 폴백이다. 네이티브가 없으면 `postToNative`가 조용히 아무 일도 하지 않는다.
   *
   * 목적지는 `/`가 아니라 `/home`이고 쿼리(`?userId=N`)를 승계한다 — `/`는 개발용 데모 랜딩이고
   * 잃으면 홈이 미저장 모드로 뜬다(`ResultPage.handleConfirm`과 같은 규칙, BY-327 통합에서 발견).
   */
  const goHome = useCallback(() => {
    postToNative({ type: "navigate-home", atMs: Date.now() });
    // `replace: true`: 세션은 끝났다. 뒤로 가기로 룸에 돌아오면 타이머가 0부터 도는 새 세션이
    // 시작돼 사용자에게 거짓이 된다(`goToResult`와 같은 이유).
    navigate({ pathname: "/home", search: searchParams.toString() }, { replace: true });
  }, [navigate, searchParams]);

  /**
   * 순공 1분 미만으로 끝났는가 — **S4로 보내지 않는 조건**이다(2026-07-27 확정).
   *
   * 판정에 서버 응답(`phase.sessions`)이 아니라 클라이언트가 잰 `focusSec`을 쓴다. 자정(KST)을
   * 넘는 세션은 서버가 날짜별로 **쪼개서** 내려주므로, 응답 한 건씩 보면 둘 다 1분 미만인데
   * 세션 전체로는 1분을 넘는 경우가 생긴다. 사용자가 한 번 공부한 것을 두 조각으로 판정하면
   * 안 된다.
   *
   * `endAndSubmit`이 제출 전에 최종 집계를 `setTotals`로 반영하므로 이 값은 이미 확정값이다.
   */
  const endedBelowMinute = focusSec < SUB_MINUTE_SEC;

  /**
   * S3-7 `공부 종료` 경로 — 제출이 **성공했을 때만**(`phase === "done"`) S4로 넘어간다.
   * `submitting`·`error`·`unsaved`는 S3 쪽 상태라 여기 남는다(WG5와 상호 확인한 계약).
   *
   * 두 경우를 제외한다.
   *
   * - **자동 종료(S3-8)**: 안내 화면을 먼저 보여주고 사용자가 `결과 보기`를 눌렀을 때 같은
   *   `goToResult`를 탄다.
   * - **순공 1분 미만**: S4 대신 미달 안내를 보여주고 홈으로 보낸다. 자동 종료와 수동 종료
   *   **양쪽 모두**에 걸린다 — 30초 공부하고 20분 방치해 자동 종료된 세션도 기록에 남지 않으므로
   *   S3-8의 `여기까지 기록을 저장했어요`가 거짓이 된다.
   */
  useEffect(() => {
    if (phase.name === "done" && !endedBelowMinute && endReason?.kind !== "AUTO") {
      goToResult(phase.sessions);
    }
  }, [endReason, endedBelowMinute, goToResult, phase]);

  /**
   * 전환 중에는 추론을 멈춘다(위 `detectionEnabled`). 전환이 끝나면 — 성공이든 실패든 —
   * 다시 켠다. 실패했을 때 꺼 두면 "전환할 카메라가 없어요" 토스트 한 번에 세션이 통째로
   * 측정 불가가 되는데, 어댑터는 실패 시 **이전 카메라를 복원하므로** 추론은 계속 가능하다.
   * 복원까지 실패한 경우에만 카메라가 꺼지고, 그때는 훅이 실행 상태를 내려 화면이 따라간다.
   *
   * 새 스트림이 `<video>`에 붙어 첫 프레임을 그리기까지는 시간이 걸리지만, 그 구간은
   * 감지기가 `readyState`를 보고 스스로 건너뛴다 — 여기서 기다릴 필요가 없다.
   */
  async function handleFlipCamera() {
    setFlippingCamera(true);
    try {
      const result = await flipCamera();
      if (result.ok) {
        showToast(CAMERA_TOAST_COPY.flipped);
        return;
      }
      showToast(
        result.reason === "camera-off"
          ? CAMERA_TOAST_COPY.cameraOff
          : CAMERA_TOAST_COPY.noAlternative,
      );
    } finally {
      setFlippingCamera(false);
    }
  }

  /** 컨트롤 바 종료 버튼 — **세션을 끝내지 않는다.** S3-7 확인 다이얼로그를 먼저 띄운다. */
  function handleRequestExit() {
    setExitDialogOpen(true);
  }

  /** `계속하기` — 직전 세션 상태 그대로 복귀한다(집중/비집중/일시정지 어디서 열었든). */
  function handleCancelExit() {
    setExitDialogOpen(false);
  }

  /** `공부 종료` — 여기서만 실제로 종료된다. */
  function handleConfirmExit() {
    setExitDialogOpen(false);
    void endAndSubmit(MANUAL_END_REASON);
  }

  return (
    <main
      style={{ ...sessionSurfaceStyle, ...sessionGlowStyle(sessionState.kind) }}
      data-simple-mode={simpleMode}
      // 컨트롤 바 아이콘(`<img>`)과 캡션·타이머 텍스트가 마우스/터치 드래그로 끌리는 것을
      // 막는다 — `session-no-drag`(index.css)가 CSS를, onDragStart가 브라우저 네이티브
      // 드래그 이벤트 자체를 막는다(카메라 프리뷰가 있는 화면이라 드래그 고스트가 특히 튄다).
      onDragStart={(event) => event.preventDefault()}
      className="session-no-drag relative flex h-svh w-full flex-col items-center overflow-hidden bg-[var(--session-camera-base)] text-white"
    >
      {/* 심플 모드는 **보이는 프리뷰만** 걷어낸다 — `<video>`는 계속 마운트된 채 숨어 있다.
          카메라 서피스(`data-session-surface="camera"`)는 사라지므로 S3-4 화면 스펙은 그대로다.

          그냥 언마운트하면 `videoRef.current`가 `null`이 되어 **추론이 프레임을 못 받고**,
          신호가 직전 값에 굳은 채 심플 모드 내내 유지된다(계약 2: `detect()`가 `null`이면
          "판정 없음"이지 "사람 없음"이 아니다). 즉 심플 모드로 들어간 순간의 상태가 세션 끝까지
          기록된다 — 조용히 틀린다. 측정은 화면 표시 방식과 무관해야 하므로 숨긴 채 유지한다
          (2026-07-29 리더 결정).

          SimpleModeSurface도 카메라 서피스와 같은 hidden 패턴으로 **상시 마운트**한다 —
          조건부 마운트면 전환 순간 배경이 0ms에 스왑되어, 300ms를 끄는 타이머 이동과 시차가
          벌어진다(BY-336). 두 서피스가 각자 300ms 페이드로 교차하면 배경도 같은 박자를 탄다. */}
      <SimpleModeSurface hidden={!simpleMode} glowKey={glowKey} />
      {/* 회전 오버스캔은 **프리뷰에만** 건다 — 심플 모드는 카메라를 걷어낸 화면이라 회전해도
          메울 빈 자리가 없고, 단색 배경을 확대해 봐야 보이는 변화가 없다. */}
      <CameraPreviewSurface
        stream={cameraStream}
        facing={cameraFacing}
        videoRef={videoRef}
        hidden={simpleMode}
        rotating={!simpleMode && rotationPhase === "rotating"}
      />

      {phase.name === "studying" ? (
        <>
          {/* 화면 탭(컨트롤 바 제외) → 심플 모드 전환. 컨트롤 바가 pointer-events-auto로 이 레이어를 가린다.
              대칭 복귀: 심플 모드에서 한 번 더 탭하면 프리뷰로 돌아온다(별도 닫기 버튼을 만들지 않는다).
              다이얼로그가 떠 있는 동안은 inert — 딤 뒤를 탭해도 심플 모드가 토글되지 않는다. */}
          <button
            type="button"
            aria-label="심플 모드 전환"
            aria-pressed={simpleMode}
            onClick={() => setSimpleMode((prev) => !prev)}
            inert={exitDialogOpen}
            className="absolute inset-0 cursor-default"
          />

          {/* 다이얼로그가 열리면 배경 세션 화면 전체를 inert로 만든다 — 포커스가 뒤로 새지 않고
              스크린리더도 다이얼로그만 읽는다(SCR-S3-7·S3-8 Accessibility). */}
          <div className={SESSION_LAYER_LAYOUT} inert={exitDialogOpen}>
            {/* 가로에서도 상단 중앙 — 서브 문구(비집중·일시정지)는 세로와 같이 필 바로 아래에
                붙는다. 가로 비집중·일시정지 프레임은 Figma 미설계라(SCR-S3-5·S3-6 Current
                Limitations 3) 세로와 같은 상대 위치를 유지하는 가장 보수적인 배치를 쓴다. */}
            <SessionStatusPill
              state={pillState}
              label={statusCopy.label}
              subLabel={statusCopy.subLabel}
              className="landscape:col-start-2 landscape:row-start-1 landscape:justify-self-center"
            />

            {/* 타이머 세로 위치는 이 스페이서 두 개의 flex-grow 비가 정한다 — 프리뷰는 위만
                늘려(1:0) 컨트롤 바 바로 위에, 심플 모드는 균등(1:1)하게 나눠 상태 필과 컨트롤 바
                사이 여백의 중앙에 놓는다. Figma S3-4 실측은 207:350(≈3:5)으로 중앙보다 위지만
                실기기에서 너무 높다는 확인(BY-336)으로 균등 배분으로 낮췄다.

                ⚠️ **전환 애니메이션을 다시 넣지 말 것.** 예전에는 `transition-[flex-grow]`로
                300ms ease-out(Figma Spec `14:7`) 슬라이드를 줬는데, 실기기 확인에서 타이머가
                미끄러지는 것 자체가 거슬린다는 판단으로 걷어냈다(2026-07-31). 지금은 위치만
                즉시 바뀌고 배경·발광은 그대로 300ms로 페이드한다 — 움직이는 것은 타이머가
                아니라 화면이라는 인상이 된다. 타이머는 여전히 언마운트/재마운트하지 않으므로
                숫자가 끊기거나 리셋되지는 않는다.
                가로에서는 그리드 트랙이 같은 일을 하므로 스페이서를 접는다. */}
            <div className="grow landscape:hidden" />

            {/* 가로 배치만 표시 모드에 따라 갈린다 — 프리뷰는 우상단(row1/col3), 심플은 중앙
                (row2 전폭). 세로에서는 두 경우 모두 흐름 그대로다.

                프리뷰의 음수 마진은 타이머를 레이어 패딩(우 28px) 안쪽에서 **우측 모서리로
                끌어당긴다**(BY-336 확인: 상단은 그대로, 우측만 — Figma 실측 우28에서 의도적으로
                이탈, 결과 여백은 우 8px + safe-area). 패딩 자체를 줄이지 않는 이유는 그 패딩이
                상태 필·컨트롤 바·캡션까지 함께 밀기 때문이고, 음수 마진은 safe-area 몫을
                침범하지 않는다 — 노치 쪽 인셋은 그대로 남는다. */}
            <SessionTimer
              focusSec={focusSec}
              studySec={studySec}
              state={pillState}
              glow={simpleMode}
              className={
                simpleMode
                  ? "landscape:col-span-full landscape:row-start-2 landscape:justify-self-center landscape:self-center"
                  : "landscape:col-start-3 landscape:row-start-1 landscape:-mr-5 landscape:justify-self-end"
              }
            />

            {/* 캡션은 심플 모드에 존재하지 않는 행이다(S3-4·S3-6 프레임 실측 — 프리뷰와 함께
                사라진다). 프리뷰에서는 일시정지 여부에 따라 프라이버시 캡션 ↔ 일시정지 캡션이
                교체된다. 가로에서는 컨트롤 바 바로 위 자기 행을 갖는다(간격은 바가 준다).

                래퍼가 세로에서 캡션 높이(14px+mt 8px)를 **상주 예약**한다 — 캡션을 그냥
                언마운트하면 전환 시작 프레임에 그 높이가 flex 가용 공간으로 즉시 편입/이탈해
                타이머가 한 프레임에 스텝 점프한 뒤 미끄러지기 시작한다(BY-336).
                텍스트는 여전히 DOM에서 빠지므로 "심플 모드에 캡션 없음" 스펙은 그대로다 —
                텍스트 자체가 0ms에 사라지는 것은 알고 남긴 트레이드오프다(페이드를 주려면
                지연 언마운트가 필요해 DOM 부재 스펙·테스트와 충돌한다).
                높이 예약은 세로 전용이다: 가로는 스페이서가 없어 이 문제가 없고 캡션이
                11px/13px로 줄므로 `landscape:h-auto`로 되돌린다. 빈 래퍼가 그리드 행 트랙을
                차지하지 않도록 심플일 때는 숨긴다. */}
            <div
              className={cn(
                "mt-2 h-[14px] landscape:col-span-full landscape:row-start-3 landscape:mt-0 landscape:h-auto landscape:justify-self-center",
                simpleMode && "landscape:hidden",
              )}
            >
              {!simpleMode && <SessionCaption text={captionFor(sessionState)} />}
            </div>

            <div className={cn(simpleMode ? "grow" : "grow-0", "landscape:hidden")} />

            {/* 토스트는 컨트롤 바 위에 띄운다 — 뜨고 사라질 때 레이아웃이 흔들리지 않도록 absolute. */}
            <div className="relative mt-4 flex flex-col items-center landscape:col-span-full landscape:row-start-4 landscape:mt-2 landscape:justify-self-center">
              {toastMessage !== null && (
                <Toast
                  message={toastMessage}
                  className="absolute bottom-[calc(100%+12px)] whitespace-nowrap"
                />
              )}
              {/* 심플 모드에서는 카메라 전환을 잠근다 — 프리뷰가 없어 결과를 볼 수 없는데
                  추론만 끊긴다(그쪽 prop 주석). 화면을 한 번 탭해 프리뷰로 돌아오면 풀린다. */}
              <SessionControlBar
                paused={paused}
                flipDisabled={simpleMode}
                onTogglePause={() => (paused ? resume() : pause())}
                onFlipCamera={() => void handleFlipCamera()}
                onRequestExit={handleRequestExit}
              />
            </div>

            {userId === null && (
              <p className="mt-3 text-center text-[12px] leading-[16px] text-white/55 landscape:col-span-full landscape:row-start-5 landscape:justify-self-center">
                userId가 없어 이 세션은 서버에 저장되지 않습니다 (주소에 ?userId=N 필요)
              </p>
            )}
          </div>

          {/* ⚠️ **여기가 다이얼로그의 올바른 자리다** — `SESSION_LAYER_LAYOUT` div의 자식이 아니라
              **형제**이고, `main` 바로 아래 `absolute inset-0`이다. 자식으로 넣으면 세 가지가
              동시에 깨진다(qa-WG3가 프로브를 실제로 삽입해 재현 확인):
                (1) 가로에서 그리드 자동 배치로 row1/col1 = 좌상단에 앉는다 — 중앙 모달이 구석에 그려진다
                (2) row1 트랙이 커지면서 1fr인 row2가 줄어 심플 타이머(S3-6) 수직 위치가 밀린다
                (3) 레이어의 `pointer-events-none`을 상속해 확인·취소 버튼이 클릭을 못 받는다
              세로에서도 같은 컨테이너가 flex-col이라 흐름 자식이 되어 컨트롤 바를 밀어낸다 —
              가로 전용 문제가 아니다. `pointer-events-auto`는 컴포넌트가 직접 갖는다.

              가로(S3-5/S3-6)용 종료 확인 프레임은 Figma에 없다 — 세로와 같은 330w 다이얼로그를
              가로 캔버스 중앙에 띄운다(임의로 가로 전용 레이아웃을 새로 디자인하지 않는다). */}
          {exitDialogOpen && (
            <SessionConfirmDialog
              title={EXIT_CONFIRM_COPY.title}
              description={exitConfirmDescription(focusSec)}
              cancelLabel={EXIT_CONFIRM_COPY.cancel}
              confirmLabel={EXIT_CONFIRM_COPY.confirm}
              onCancel={handleCancelExit}
              onConfirm={handleConfirmExit}
            />
          )}
        </>
      ) : /* 미달 종료 안내 — **S3-8보다 먼저 검사한다.** 순공 1분 미만이면 자동 종료로 끝났든
             수동으로 끝냈든 기록에 남지 않으므로, S3-8의 `여기까지 기록을 저장했어요`도 S4의
             결과 표시도 모두 사실과 어긋난다(위 `endedBelowMinute` 주석).

             `phase === "done"`을 요구하는 이유는 S3-8과 같다 — 제출 중·실패·미저장 상태에서는
             아래 폴백의 재시도 경로로 가야 한다. 저장 자체는 1분 미만이어도 정상적으로 하고,
             걸러내는 것은 표시·합산 단계다(mvp-scope). */
      phase.name === "done" && endedBelowMinute ? (
        <SubMinuteEndNotice onGoHome={goHome} />
      ) : /* `phase.name === "done"`을 여기서 한 번 더 좁히는 이유: 타입 가드는 `endReason`만
             좁혀서 아래 `phase.sessions` 접근이 타입상 열리지 않는다. 조건 자체는 가드 안의
             검사와 동일하다. */
      phase.name === "done" && autoEndNoticeVisible(phase, endReason) ? (
        /* S3-8 자동 종료 안내 — 저장이 **끝난 뒤에만** 보여준다(`phase === "done"`).
           타이틀이 `여기까지 기록을 저장했어요`로 단언하므로 제출 중·실패·미저장(userId 없음)
           상태에서 이 화면을 띄우면 사실과 달라진다 — 그 경우는 아래 폴백의 재시도 경로로 간다
           (SCR-S3-7·S3-8 Interaction Contract).

           `결과 보기`는 **이미 저장된 결과를 들고 S4로 이동**한다 — 여기서 다시 제출하지 않는다
           (SCR-S4 진입 경로 표). */
        <AutoEndNotice
          trigger={endReason.trigger}
          focusSec={focusSec}
          studySec={studySec}
          onSeeResult={() => goToResult(phase.sessions)}
        />
      ) : (
        <SessionResultFallback phase={phase} onRetry={() => void endAndSubmit()} />
      )}

      {/* ⚠️ **개발 빌드 전용 — 걷어낼 때 지울 두 지점 중 하나가 이 줄이다**(나머지 하나는
          `components/DevVisionFailureNotice.tsx` 파일 자체). 모델 로딩이 최종 실패했을 때
          프로덕션은 에러 화면 없이 감지만 없는 채로 세션을 계속 진행하고(리더 결정 2026-07-29),
          개발 빌드만 그 사실을 화면에 띄운다 — 조용히 mock처럼 도는 상태를 개발 중에 못 알아채는
          쪽이 더 위험하기 때문이다. Vite가 프로덕션에서 `import.meta.env.DEV`를 `false`로
          치환하므로 이 블록과 컴포넌트 모듈이 통째로 번들에서 빠진다. */}
      {import.meta.env.DEV && <DevVisionFailureNotice detector={visionDetector} />}
    </main>
  );
}

/**
 * S3-8을 띄울 조건. 타입 가드로 두는 이유는 `endReason.trigger` 접근이 좁혀진 타입에서만
 * 안전하기 때문이다.
 *
 * `phase === "done"`을 요구하는 것이 핵심이다 — `submitting`(로딩)·`error`(재시도)·
 * `unsaved`(userId 없음)는 전부 "아직/영영 저장되지 않은" 상태라 S3-8의 타이틀이 거짓이 된다.
 */
function autoEndNoticeVisible(
  phase: StudyRoomPhase,
  endReason: SessionEndReason | null,
): endReason is { kind: "AUTO"; trigger: PauseTrigger } {
  return phase.name === "done" && endReason?.kind === "AUTO";
}

function toPillState(state: SessionState): SessionStatusPillState {
  switch (state.kind) {
    case "FOCUS":
      return "focus";
    case "DISTRACTION":
      return "distract";
    case "PAUSE":
      return "paused";
  }
}

/**
 * 종료 이후 **S4로 가지 못하는** 상태들의 표시 — 제출 중 · 제출 실패(재시도) · 미저장.
 *
 * `done`은 여기 없다. 제출이 성공하면 위 `goToResult`가 S4(`ResultPage`)로 넘기므로 이 컴포넌트가
 * 그릴 결과 화면은 존재하지 않는다(WG5가 라우트를 만들면서 임시 결과 표시를 걷어냈다).
 * 렌더 직후 한 프레임 동안 `done`으로 여기 머물 수 있어 타입에는 남아 있지만 그리는 것은 없다.
 *
 * ⚠️ **아래 재시도 버튼을 없애지 말 것.** S4는 "저장 실패" 배너·재시도 버튼을 만들지 않기로
 * 스펙됐다(SCR-S4 Interaction Contract) — 실패의 사용자 대면 처리는 전적으로 S3의 책임이고,
 * 이 경로가 사라지면 제출 실패가 조용히 삼켜져 사용자에게 아무 안내도 남지 않는다.
 *
 * 이 블록의 시각 디자인은 확정 스펙이 아니다(로딩·에러 상태 디자인이 Figma에 없다).
 */
function SessionResultFallback({
  phase,
  onRetry,
}: {
  phase: Exclude<StudyRoomPhase, { name: "studying" }>;
  onRetry: () => void;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-6">
      {phase.name === "submitting" && <p className="text-sm text-white/80">저장 중...</p>}

      {phase.name === "error" && (
        <>
          <p className="text-center text-sm text-[var(--session-exit-bg)]">{phase.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-white/12 px-6 py-3 text-white"
          >
            다시 제출
          </button>
        </>
      )}

      {phase.name === "unsaved" && (
        <p className="text-center text-sm text-white/80">
          공부 시간 {formatElapsed(phase.studySec)} — userId가 없어 서버에 저장되지 않았습니다.
        </p>
      )}
    </div>
  );
}
