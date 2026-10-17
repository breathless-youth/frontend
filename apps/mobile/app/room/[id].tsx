import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";

import type { HandlerMessage } from "@focusmakers/types";

import { RemoteScreen } from "../../components/RemoteScreen";
import { handleAppLockMessage } from "../../lib/appLock/appLockRelay";
import { createDeviceMotionSource } from "../../lib/deviceMotionSource";
import { type BridgeReply, handleBridgeMessage } from "../../lib/nativeBridgeHandler";
import { lockPortrait, unlockForSession } from "../../lib/orientation";
import { setSessionInviteHandler } from "../../lib/sessionInvite";
import { markSessionOpen } from "../../lib/sessionPresence";

/**
 * 싱글룸 세션
 *
 * 화면 구현체는 `apps/web`이고 여기서는 `RemoteScreen`으로 원격 경로를 로드한다.
 * 타이머·상태 판정·이벤트 누적은 전부 웹이 소유한다(여기에 세션 로직을 넣지 말 것).
 *
 * 파라미터 조립(appVersion·capability 표시)·브리지 수신(start-session·navigate-home·open-settings)·
 * 초기 로딩 스플래시는 탭 3개와 동일하게 `RemoteScreen`이 공용으로 처리한다
 * (`lib/remoteQueryParams.ts`·`lib/nativeBridgeHandler.ts`).
 *
 * 탭 화면과 다른 점은 둘이다:
 * 1. `blockHardwareBack`
 *   — 세션 중 안드로이드 뒤로가기로 WebView가 파괴되면 측정한 시간이 통째로 사라진다(사유는 `RemoteScreen`의 prop 주석).
 * 2. 가속도 센서
 *   — 기기 조작(`DEVICE`) 감지는 세션에서만 쓰므로 공용 핸들러가 아니라 이 화면이 센서 수명을 소유한다(아래 `motionSource` 주석).
 */
export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  /**
   * 기기 조작(`DEVICE`) 감지용 가속도 센서
   *
   * 웹이 켜고 끈다(`motion-sensor` 메시지)
   * — 감지 수명(일시정지·카메라 전환 중 정지)은 세션 상태를 아는 웹의 판단이고,
   * 센서는 네이티브에만 있어서 소유가 갈릴 뿐이다. 여기서 세션 상태를 보고 스스로 켜지 말 것.
   */
  const [motionSource] = useState(createDeviceMotionSource);
  /**
   * `device-handling`을 웹으로 되돌려 보낼 통로. 통로(`injectJavaScript`)는
   * `RemoteWebViewHost` 안에 있어 메시지가 올 때 받은 `reply`를 잡아 둔다 — 센서 신호는
   * 웹이 `motion-sensor: true`를 보낸 뒤에만 발생하므로 그 시점엔 항상 채워져 있다.
   */
  const replyRef = useRef<BridgeReply | null>(null);

  // 세션은 가로 회전을 허용한다
  //
  // 화면 방향 정책의 실제 집행은 rn-screens가 아니라 expo-screen-orientation이 한다.
  // 언마운트 시 다시 세로로 잠근다
  // — 가로인 채 홈으로 돌아오면 잠금이 즉시 세로로 되돌린다.
  useEffect(() => {
    unlockForSession();
    return () => {
      lockPortrait();
    };
  }, []);

  // 세션 중에 업데이트 알림창이 끼어들지 않게 화면이 떠 있음을 알린다.
  useEffect(() => markSessionOpen(), []);

  /**
   * 화면이 닫힐 때 방해 앱 잠금 해제
   *
   * 웹뷰가 해제 메시지를 보내기 전에 사라지면 잠금이 12시간 안전 해제나 다음 실행까지 남아서 네이티브가 직접 푼다.
   * 기다리는 시작보다 먼저 풀리면 잠금이 다시 걸리므로 브리지 메시지와 같은 순서로 처리한다.
   * 웹뷰 프로세스가 죽어 다시 불러올 때는 이 화면이 그대로 있어 공부 중 잠금이 유지된다.
   */
  useEffect(
    () => () => {
      void handleAppLockMessage({ type: "app-lock-stop", atMs: Date.now() }, () => undefined).catch(
        (error: unknown) => {
          console.warn("[app-lock] 세션 화면 닫힘 해제 실패", error);
        },
      );
    },
    [],
  );

  /**
   * 세션 전용 브리지 확장
   *
   * — `motion-sensor`만 여기서 받고 나머지는 전부 공용 `handleBridgeMessage`에 그대로 넘긴다.
   * 공용 핸들러에 넣지 않는 이유:
   * 센서 구독은 이 화면의 수명에 묶여야 한다.
   * 웹이 보내는 `motion-sensor: false`는 일시정지·카메라 전환에만 오고, WebView가 통째로 사라지는 경로(모달 닫기)에서는 오지 않는다
   * — 그 정리는 아래 effect의 cleanup이 맡는다.
   */
  const handleMessage = (message: HandlerMessage, reply: BridgeReply) => {
    replyRef.current = reply;
    if (message.type === "motion-sensor") {
      if (message.enabled) {
        motionSource.start();
      } else {
        motionSource.stop();
      }
      return;
    }
    handleBridgeMessage(message, reply);
  };

  /**
   * 가속도 원신호를 웹으로 올린다
   *
   * — boolean이 바뀔 때만 간다(`createDeviceMotionSource`가 변화 감지를 이미 한다).
   * 유지시간 디바운스(0.5초/2초)는 웹의 `stepDetection` 몫이라 여기서 다시 구현하지 않는다.
   *
   * 세션 화면을 벗어날 때 `stop()`을 부르는 것이 이 effect의 나머지 절반이다
   * — 구독이 남으면 화면이 사라진 뒤에도 센서가 계속 돈다.
   */
  useEffect(() => {
    const unsubscribe = motionSource.subscribe((active) => {
      replyRef.current?.({ type: "device-handling", active, atMs: Date.now() });
    });
    return () => {
      unsubscribe();
      motionSource.stop();
    };
  }, [motionSource]);

  /**
   * 세션 중에 들어온 초대를 웹으로 넘기는 창구
   *
   * 기록 저장은 웹만 시작할 수 있어서, 확인 창과 저장은 웹이 하고 끝나면 `navigate-home`으로 돌아온다.
   * 웹이 아직 한 번도 메시지를 보내지 않았다면 로드 전이라 시작된 공부가 없으므로 바로 초대코드 화면으로 간다.
   */
  useEffect(
    () =>
      setSessionInviteHandler((code) => {
        const reply = replyRef.current;
        if (reply === null) {
          handleBridgeMessage(
            { type: "navigate-home", inviteCode: code, atMs: Date.now() },
            () => undefined,
          );
          return;
        }
        reply({ type: "session-invite", code, atMs: Date.now() });
      }),
    [],
  );

  return (
    <>
      {/* 시스템 테마와 무관하게 항상 다크모드 
          — 상태 바 아이콘도 밝게 고정
          (라이트 모드 기기에서 `style="auto"`가 어두운 아이콘을 골라 배경에 묻힌다) */}
      <StatusBar style="light" />
      <RemoteScreen
        testID="session-webview"
        path={`/room/${id ?? "1"}`}
        backgroundColor="#0B0F14"
        blockHardwareBack
        onBridgeMessage={handleMessage}
      />
    </>
  );
}
