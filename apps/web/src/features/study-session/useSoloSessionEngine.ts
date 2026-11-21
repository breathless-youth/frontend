import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { StudySessionResponse, SubjectResponse } from "@focusmakers/types";

import { createAmbientUsage } from "@/features/ambient-sound/ambientUsage";
import { readMeasureMode } from "@/features/measure-mode/measureMode";
import { createMultiTimerUsage } from "@/features/multi-timer/useMultiTimer";
import { useMascotLookPrefetch } from "@/features/points/model/prefetchMyMascotLook";
import { createTimelapseRecorder } from "@/features/timelapse/timelapseRecorder";
import type { SessionDisplayEnd } from "@/lib/amplitude";
import { queryClient } from "@/lib/queryClient";
import { hasTokenSource } from "@/lib/userId";

import type { CameraAdapter } from "./adapters/cameraAdapter";
import { createMockCameraAdapter } from "./adapters/cameraAdapter";
import { createDeviceHandlingDetector } from "./adapters/deviceHandlingDetector";
import { combineFocusDetectors, createMockFocusDetector } from "./adapters/focusDetector";
import { createMediaStreamCameraAdapter } from "./adapters/mediaStreamCamera";
import { completedTaskIdsSince } from "./completedTasks";
import { resolveDevDetectorOverride } from "./devMockDetector";
import { createDisplayUsage } from "./displayUsage";
import { MIN_RECORDED_FOCUS_SEC } from "./formatDuration";
import { plannerCompletedTaskIds } from "./plannerCompletedTasks";
import type { RestoredSession } from "./restoreActiveSession";
import type { AutoEndTrigger, SessionEndReason } from "./sessionState";
import type { StudyRoomPhase } from "./useStudyRoomSession";
import { useStudyRoomSession } from "./useStudyRoomSession";
import { useTrackedVisionDetector } from "./useVisionReadyTracking";

export interface SoloSessionEngineOptions {
  readonly userId: number | null;
  readonly restored: RestoredSession | null;
  /** 이어서 공부하기로 고른 복원이라 공백을 공부 구간으로 연다. */
  readonly resumeAway?: boolean;
  /**
   * 화면이 가려져도 관리 모드를 멈추지 않는 세션
   *
   * 가려져도 카메라가 계속 재는 PC 브라우저만 넘긴다.
   */
  readonly keepMeasuringWhenHidden?: boolean;
  readonly initialSubjectId?: number;
  /** 저장한 측정 방식과 상관없이 카메라 없이 여는 세션 */
  readonly forceTimer?: boolean;
  /** 개발 빌드에서 콘솔 감지기를 고르는 이름 */
  readonly devDetector?: string | null;
  /** 시작 전에 열어 둔 카메라. 카메라로 재는 세션이면 새로 열지 않고 이것을 쓴다. */
  readonly camera?: CameraAdapter;
  /** 세션 중에 받은 초대. 있으면 결과 화면으로 가지 않는다. */
  readonly invite?: string | null;
  /** 카메라 꺼짐과 전환 결과를 알리는 토스트 */
  readonly notify: (message: string) => void;
  /** 저장이 끝난 세션을 결과 화면으로 넘긴다. */
  readonly onResult: (sessions: StudySessionResponse[], startedAtMs: number) => void;
}

/**
 * 혼자 공부 세션 엔진
 *
 * 휴대폰 세션 화면과 PC 홈이 함께 쓰는 세션 로직이고, 그리는 코드는 쓰는 쪽에 남는다.
 * 결과로 가는 길과 알리는 방법은 쓰는 쪽이 함수로 넘겨서 휴대폰은 지금 이동 코드를 그대로 넘긴다.
 * 세션 훅처럼 마운트하면 세션이 시작되고, 세션을 여는 옵션(카메라, 측정 방식, 복원값, 처음 과목)은 처음 한 번만 읽는다.
 * invite, notify, onResult는 렌더마다 최신 값을 쓴다.
 */
export function useSoloSessionEngine(options: SoloSessionEngineOptions) {
  const { userId, restored, invite = null, notify } = options;
  const { t } = useTranslation("study-session");
  /**
   * 카메라로 측정하는 세션인가
   *
   * 마운트할 때 한 번 정하고 세션 동안 바꾸지 않는다.
   * 이어받은 세션은 처음 측정한 방식을 따르고 새 세션은 기기에 저장한 방식을 따른다.
   * 앱의 권한 거부 화면에서 카메라 없이 연 세션은 forceTimer로 와서 저장한 방식보다 먼저다.
   * 카메라 없는 모드면 아무것도 열지 않는 카메라와 신호를 내지 않는 감지기를 넘겨 타이머만 돈다.
   */
  const [cameraOn] = useState(() =>
    restored !== null
      ? restored.source !== "TIMER"
      : options.forceTimer !== true && readMeasureMode() === "camera",
  );
  // 시작 전에 열어 본 카메라를 그대로 써서 권한 창과 카메라 열기가 한 번으로 끝난다.
  const [camera] = useState(() =>
    cameraOn ? (options.camera ?? createMediaStreamCameraAdapter()) : createMockCameraAdapter(),
  );
  // 열어 본 카메라를 넘겼는데 이어받은 세션이 카메라 없는 세션이면 쓰지 않으므로 닫는다.
  // 닫지 않으면 세션 내내 카메라 표시등이 켜져 있다.
  const [unusedCamera] = useState(() => (cameraOn ? undefined : options.camera));
  useEffect(() => {
    unusedCamera?.stop();
  }, [unusedCamera]);
  /**
   * 프리뷰
   * — 이 화면이 소유하고 두 곳에 나눠준다.
   * 표시는 `CameraPreviewSurface`가, 추론은 `createVisionFocusDetector`가 같은 엘리먼트를 본다.
   */
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * DEV에서 `?detector=mock`이면 콘솔 mock이 이긴다 — 실기기 없이 비집중 시나리오를 재현해야
   * 할 때가 계속 있다. 그 외에는(프로덕션 포함) 아래 Vision 감지기가 쓰인다.
   */
  const [devDetector] = useState(() =>
    cameraOn ? resolveDevDetectorOverride(options.devDetector ?? null) : undefined,
  );
  /**
   * 타임랩스 촬영
   *
   * 소셜룸은 이 엔진을 쓰지 않으므로 찍지 않는다.
   */
  const [timelapse] = useState(() => createTimelapseRecorder());
  const { visionDetector, visionReady } = useTrackedVisionDetector(
    videoRef,
    "single",
    timelapse.photoTap,
  );
  /**
   * 카메라(`AWAY`·`PHONE`)와 가속도 센서(`DEVICE`).
   * 담당 트리거가 겹치지 않으므로 하나로 묶어 훅에 넘긴다.
   * 센서 정지 시점은 "카메라 추론 정지와 동일한 시점"이다.
   */
  const [sensorDetector] = useState(() =>
    cameraOn
      ? combineFocusDetectors([visionDetector, createDeviceHandlingDetector()])
      : createMockFocusDetector(),
  );
  const detector = devDetector ?? sensorDetector;
  // 제출 시점에 읽을 과목 목록 — 쓰는 쪽이 커밋마다 최신 값으로 덮는다.
  const subjectsListRef = useRef<SubjectResponse[]>([]);
  /**
   * 배경음 재생 누적 시간 그릇 — 두 훅 사이에 순환이 생기지 않게 여기서 만들어 양쪽에
   * 넘긴다. 세션 훅은 종료 시점에 `snapshot`만 읽고, 배경음 훅이 `start`/`stop`을 부른다.
   */
  const [ambientUsage] = useState(() => createAmbientUsage(Date.now));
  // 배경음 그릇과 같은 까닭으로 여기서 만들어 세션 훅과 타이머 훅에 함께 넘긴다.
  const [multiTimerUsage] = useState(createMultiTimerUsage);
  // 화면 표시 모드별 머문 시간. 세션은 심플 모드로 시작한다.
  const [displayUsage] = useState(() => createDisplayUsage(Date.now));
  // 종료 이벤트에 실을 공간과 얼굴 가림. 둘 다 쓰는 쪽에서 정해져 커밋마다 최신 값으로 덮는다.
  const displayContextRef = useRef<Pick<SessionDisplayEnd, "spaceKind" | "faceMask">>({
    spaceKind: "simple",
    faceMask: false,
  });
  const session = useStudyRoomSession(userId, {
    camera,
    detector,
    restored,
    resumeAway: options.resumeAway,
    keepMeasuringWhenHidden: options.keepMeasuringWhenHidden,
    initialSubjectId: options.initialSubjectId,
    // 과목 목록은 쓰는 쪽이 들고 있어 제출 시점에 ref로 읽는다(옵션 주석 참고).
    getCompletedTaskIds: (startedAtMs) =>
      hasTokenSource() && userId !== null
        ? plannerCompletedTaskIds(queryClient, userId, startedAtMs)
        : completedTaskIdsSince(subjectsListRef.current, startedAtMs),
    ambientUsage: ambientUsage.snapshot,
    ambientSoundPlays: ambientUsage.soundSeconds,
    multiTimerUsage: multiTimerUsage.snapshot,
    displayUsage: () => ({ ...displayUsage.snapshot(), ...displayContextRef.current }),
    onEnded: cameraOn ? timelapse.finish : undefined,
    onCameraLost: () => notify(t("cameraToast.cameraOff")),
    source: cameraOn ? "MEASURED" : "TIMER",
  });
  const { startedAtMs, phase, sessionState, focusSec, endReason } = session;
  // 이어받은 세션은 같은 시작 시각이라 같은 타임랩스에 이어 찍는다.
  useEffect(() => {
    if (cameraOn) timelapse.begin(startedAtMs);
  }, [cameraOn, startedAtMs, timelapse]);
  // 결과 화면은 이 문서에서 웹 라우터 이동으로 열려 같은 캐시를 쓴다. 그 화면이 그릴 내 마스코트 모습을 미리 받는다.
  const prefetchMascotLook = useMascotLookPrefetch(queryClient, userId);
  /**
   * 카메라 전환이 진행 중인가 — **추론 정지 구간을 표시하는 값이지 화면 상태가 아니다.**
   * 전환 중에는 기존 트랙이 멈추고 새 스트림이 `<video>`에 다시 붙는데, 그 사이의 프레임은
   * 판정에 쓸 수 없다(설계 §3 "카메라 전환"). 전환 실패는 기존 `CameraFlipResult` 그대로다.
   */
  const [flippingCamera, setFlippingCamera] = useState(false);
  const paused = sessionState.kind === "PAUSE";

  /**
   * 추론 수명
   *
   * | 상황             | 카메라 | 추론 |
   * | ---------------- | ------ | ---- |
   * | 일시정지         | 유지   | 정지 |
   * | 카메라 전환 중   | 재연결 | 정지 |
   * | 세션 종료·제출   | 훅이 정리 | 정지 |
   *
   * 일시정지에서 스트림을 끄지 않는 이유는 셋이다 — Figma가 프리뷰를 그대로 보여주고,
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
   * 세션 이탈 — 모델과 GPU 컨텍스트를 해제한다.
   * `stop()`은 추론만 멈추고 모델을 들고 있으므로 이게 없으면 wasm 힙과 GPU 컨텍스트가 orphan이 된다
   * (브라우저가 컨텍스트 개수를 제한한다).
   * 로딩 중에 언마운트돼도 뒤늦게 도착한 detector를 닫는다(멱등).
   */
  useEffect(() => {
    return () => {
      visionDetector.close();
    };
  }, [visionDetector]);

  /**
   * 순공 1분 미만으로 끝났는가
   *
   * 판정에 서버 응답(`phase.sessions`)이 아니라 클라이언트가 잰 `focusSec`을 쓴다.
   * 자정을 넘는 세션은 서버가 날짜별로 쪼개서 내려주므로, 응답 한 건씩 보면 둘 다 순공이 짧은데
   * 세션 전체로는 기준을 넘는 경우가 생긴다.
   * 사용자가 한 번 공부한 것을 두 조각으로 판정하면 안 된다.
   *
   * `endAndSubmit`이 제출 전에 최종 집계를 `setTotals`로 반영하므로 이 값은 이미 확정값이다.
   */
  const endedWithoutFocus = focusSec < MIN_RECORDED_FOCUS_SEC;

  // 결과로 가는 함수는 쓰는 쪽이 렌더마다 새로 줄 수 있어 effect 의존성에 넣지 않는다.
  const showResult = useEffectEvent((sessions: StudySessionResponse[]) => {
    options.onResult(sessions, startedAtMs);
  });
  /**
   * `공부 종료` 경로
   *
   * - 자동 종료: 안내 화면을 먼저 보여주고 사용자가 `결과 보기`를 눌렀을 때 같은 `onResult`를 탄다.
   * - 순공 1분 미만: 미달 안내를 보여주고 홈으로 보낸다. 자동 종료와 수동 종료 양쪽 모두에 걸린다.
   * 30초 공부하고 20분 방치해 자동 종료된 세션도 기록에 남지 않으므로 `여기까지 기록을 저장했어요`가 거짓이 된다.
   */
  useEffect(() => {
    if (
      phase.name === "done" &&
      invite === null &&
      !endedWithoutFocus &&
      endReason?.kind !== "AUTO"
    ) {
      showResult(phase.sessions);
    }
  }, [endReason, endedWithoutFocus, invite, phase]);

  /**
   * 전환 중에는 추론을 멈춘다(위 `detectionEnabled`). 전환이 끝나면 — 성공이든 실패든 —
   * 다시 켠다. 실패했을 때 꺼 두면 "전환할 카메라가 없어요" 토스트 한 번에 세션이 통째로
   * 측정 불가가 되는데, 어댑터는 실패 시 이전 카메라를 복원하므로 추론은 계속 가능하다.
   * 복원까지 실패한 경우에만 카메라가 꺼지고, 그때는 훅이 실행 상태를 내려 화면이 따라간다.
   *
   * 새 스트림이 `<video>`에 붙어 첫 프레임을 그리기까지는 시간이 걸리지만, 그 구간은
   * 감지기가 `readyState`를 보고 스스로 건너뛴다 — 여기서 기다릴 필요가 없다.
   */
  function flipCamera() {
    setFlippingCamera(true);
    return session
      .flipCamera()
      .then((result) => {
        if (result.ok) {
          notify(t("cameraToast.flipped"));
          return;
        }
        notify(
          result.reason === "camera-off"
            ? t("cameraToast.cameraOff")
            : t("cameraToast.noAlternative"),
        );
      })
      .finally(() => {
        setFlippingCamera(false);
      });
  }

  return {
    ...session,
    cameraOn,
    videoRef,
    visionDetector,
    visionReady,
    ambientUsage,
    multiTimerUsage,
    displayUsage,
    displayContextRef,
    subjectsListRef,
    flippingCamera,
    flipCamera,
    endedWithoutFocus,
    prefetchMascotLook,
  };
}

/**
 * 타입 가드로 두는 이유는 `endReason.trigger` 접근이 좁혀진 타입에서만 안전하기 때문이다.
 *
 * `phase === "done"`을 요구하는 것이 핵심이다 — `submitting`(로딩)·`error`(재시도)·
 * `unsaved`(userId 없음)는 전부 "아직/영영 저장되지 않은" 상태이다.
 */
export function autoEndNoticeVisible(
  phase: StudyRoomPhase,
  endReason: SessionEndReason | null,
): endReason is { kind: "AUTO"; trigger: AutoEndTrigger } {
  return phase.name === "done" && endReason?.kind === "AUTO";
}
