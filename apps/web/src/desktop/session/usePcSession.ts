import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { readMeasureMode, writeMeasureMode } from "@/features/measure-mode/measureMode";
import type { CameraAdapter } from "@/features/study-session/adapters/cameraAdapter";
import { trackFocusStartTapped } from "@/lib/amplitude";
import { requestSessionStart } from "@/lib/sessionStart";
import { showActionToast, showToast } from "@/lib/toast";

import { loadPcStudySession } from "./loadPcStudySession";
import { readPcSessionMarker } from "./pcSessionMarker";

/** PC 홈 위에 연 공부 세션 */
export interface PcSessionRequest {
  /** 새로 열 때마다 바뀌어 세션 화면을 새로 만든다. */
  readonly key: number;
  /** 새로고침 전에 이 탭에서 열었던 세션을 서버 기록에서 이어 가는가 */
  readonly resume: boolean;
  readonly subjectId?: number;
  /** 시작 전에 열어 본 카메라. 자율 모드와 이어 가기에는 없다. */
  readonly camera?: CameraAdapter;
}

/**
 * PC 홈의 공부 세션 열기와 닫기
 *
 * 경로를 바꾸지 않고 홈 위에 세션을 연다.
 * 관리 모드는 카메라를 먼저 열어 보고, 열리지 않으면 세션을 열지 않고 자율 모드로 시작하는 버튼을 띄운다.
 * 휴대폰의 첫 세션 가이드 화면으로 가지 않고, 가이드는 세션 화면이 상자 안에서 띄운다.
 * 세션이 끝나거나 홈을 떠나면 넘긴 카메라를 닫아, 세션 화면이 만들어지기 전에 떠나도 카메라가 켜진 채 남지 않는다.
 * 넘기기 전의 카메라는 이 훅이 들고 있다가, 권한 창이나 옛 세션 마감을 기다리는 사이 홈을 떠나면 닫고 시작을 멈춘다.
 * 요청으로 넘긴 뒤에는 세션 쪽 카메라라 들고 있던 자리를 비워 떠날 때 두 번 닫지 않는다.
 * 새로고침 전에 이 탭에서 연 세션이 있으면 이어 가기 요청으로 시작한다.
 * 옛 세션 마감이 실패해 자율 모드 세션을 이어받으면 넘긴 카메라를 쓰지 않아 세션 엔진이 닫는다.
 */
export function usePcSession(userId: number, pc: boolean) {
  const { t } = useTranslation(["desktop", "home"]);
  const [request, setRequest] = useState<PcSessionRequest | null>(() =>
    pc && readPcSessionMarker() === userId ? { key: 0, resume: true } : null,
  );
  const keyRef = useRef(0);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  // 열었지만 아직 요청으로 넘기지 않은 카메라
  const heldCameraRef = useRef<CameraAdapter | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      heldCameraRef.current?.stop();
      heldCameraRef.current = null;
    };
  }, []);
  useEffect(() => {
    const camera = request?.camera;
    return () => camera?.stop();
  }, [request]);

  async function start(subjectId: number | null, retry = false): Promise<void> {
    // 옛 세션 마감을 기다리는 동안 다시 눌러도 요청이 두 번 나가지 않게 한다.
    if (startingRef.current) return;
    startingRef.current = true;
    void loadPcStudySession();
    // 카메라 실패 토스트에서 자율 모드로 다시 시작하는 것은 같은 누름의 이어짐이라 다시 세지 않는다.
    if (!retry) trackFocusStartTapped("home");
    let camera: CameraAdapter | undefined;
    try {
      if (readMeasureMode() === "camera") {
        const { openCameraForSession } =
          await import("@/features/study-session/adapters/mediaStreamCamera");
        if (!mountedRef.current) return;
        const opened = await openCameraForSession();
        if (!mountedRef.current) {
          opened?.stop();
          return;
        }
        if (opened === null) {
          showActionToast(t("session.cameraUnavailable"), {
            label: t("session.startTimer"),
            onClick: () => {
              writeMeasureMode("timer");
              start(subjectId, true).catch(() => showToast(t("home:v3.startFailed")));
            },
          });
          return;
        }
        camera = opened;
        heldCameraRef.current = opened;
      }
      const opened = camera;
      await requestSessionStart(
        userId,
        () => {
          // 옛 세션을 마감하는 사이 홈을 떠났으면 세션을 열지 않는다. 카메라는 훅 정리가 닫았다.
          if (!mountedRef.current) return;
          heldCameraRef.current = null;
          keyRef.current += 1;
          setRequest({
            key: keyRef.current,
            resume: false,
            ...(subjectId === null ? {} : { subjectId }),
            ...(opened === undefined ? {} : { camera: opened }),
          });
        },
        subjectId === null ? {} : { subjectId },
      );
    } finally {
      startingRef.current = false;
      // 넘기지 못한 카메라는 시작이 실패했거나 끝난 것이라 닫는다.
      if (camera !== undefined && heldCameraRef.current === camera) {
        camera.stop();
        heldCameraRef.current = null;
      }
    }
  }

  return { request, start, end: () => setRequest(null) };
}
