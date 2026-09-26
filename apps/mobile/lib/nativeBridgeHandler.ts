import { router } from "expo-router";
import { Share } from "react-native";

import type { HandlerMessage, NavigateTabMessage, ToWebMessage } from "@focusmakers/types";

import { getActiveTab } from "./activeTab";
import { authTokenMessage, awaitAuth, ensureAuth, refreshAuth } from "./auth";
import { getCameraPermissionStatus, openAppSettings } from "./cameraPermission";
import { runCameraPermissionGate } from "./cameraPermissionGate";
import { getMotionSensorRelay } from "./motionSensorRelay";
import { trackNativeEvent } from "./nativeAnalytics";
import { emitSessionClosed } from "./sessionClosed";
import { setTabBarState } from "./tabBarVisibility";

/** 웹으로 응답을 되돌려 보내는 통로 — `RemoteWebViewHost`의 `injectJavaScript`가 구현한다. */
export type BridgeReply = (message: ToWebMessage) => void;

/** `navigate-tab`의 목적지 값 → 탭 id와 라우트. 계약(`NavigateTabMessage.tab`)이 넓어지면 여기도 넓힌다. */
const TAB_TARGET_BY_MESSAGE_TAB = {
  records: { id: "record", href: "/records" },
  social: { id: "social", href: "/social" },
} as const;

/**
 * 웹이 요청한 탭 전환. 탭 전환은 네이티브 탭바 소유라 웹은 신호만 보낸다. `router.navigate`는
 * 이미 활성인 탭이면 no-op이고, 그때는 탭 이동이 아니므로 `tab_pressed`도 남기지 않는다.
 * 사용자에겐 탭 바 터치와 같은 탭 이동이라 `tab_pressed`로 세되 경로만 `via`로 가른다.
 */
function openTab(tab: NavigateTabMessage["tab"], via: NonNullable<NavigateTabMessage["via"]>) {
  const target = TAB_TARGET_BY_MESSAGE_TAB[tab];
  const from = getActiveTab();
  if (from !== target.id) {
    trackNativeEvent("tab_pressed", { tab: target.id, from_tab: from, via });
  }
  router.navigate(target.href);
}

/**
 * 웹이 보낸 브리지 메시지(세션 상태 모델 스펙 §10)에 대한 네이티브 쪽 공통 반응.
 *
 * `RemoteWebViewHost`를 쓰는 화면(탭 4개와 세션) 전부가 같은 규칙으로 반응해야
 * 한다 — 어느 화면에서 메시지가 와도 동작이 갈리면 안 되므로 화면마다 복붙하지 않고
 * 한 곳에 모았다. 원래 `app/room/[id].tsx`에 있던 로직을 그대로 승격했다.
 */
export function handleBridgeMessage(message: HandlerMessage, reply: BridgeReply): void {
  switch (message.type) {
    case "start-session":
      void (async () => {
        const result = await runCameraPermissionGate("single");
        if (result === "show-denied-guide") {
          router.push("/permission-denied");
          return;
        }
        router.push("/room/1");
      })().catch((error: unknown) => {
        console.warn("[bridge] 집중 시작(start-session) 처리 실패", error);
      });
      break;
    case "request-camera-gate":
      // 소셜 룸 입장 미리보기의 권한 게이트 — start-session과 같은 분기를 태우되, 세션 화면
      // push 대신 결과를 웹에 돌려준다(카메라를 여는 주체가 웹이라서다). 거부 안내 화면
      // 연결은 start-session과 동일하다. 양 플랫폼 공통이다 — iOS도 거부 상태에서 안내 화면
      // 없이 미리보기 실패에 머무는 공백이 같다.
      void (async () => {
        const result = await runCameraPermissionGate("social");
        if (result === "show-denied-guide") {
          router.push("/permission-denied");
          reply({ type: "camera-gate-result", granted: false, atMs: Date.now() });
          return;
        }
        reply({ type: "camera-gate-result", granted: true, atMs: Date.now() });
      })().catch((error: unknown) => {
        // fail-closed — 권한을 확인하지 못한 채로 룸에 들여보내지 않는다. 게이트 자체가
        // 실패했다는 것은 권한 상태를 알 수 없다는 뜻이고, 그때 통과시키면 카메라를 켤 수
        // 없는 상태로 세션이 시작된다. 웹은 이 응답을 받아 입장을 중단한다.
        console.warn("[bridge] 카메라 게이트(request-camera-gate) 처리 실패", error);
        reply({ type: "camera-gate-result", granted: false, atMs: Date.now() });
      });
      break;
    case "navigate-home":
      // S4 결과 CTA·미달 종료 안내가 보낸다 — 세션은 탭 위에 `fullScreenModal`로 떠 있으므로
      // 모달을 닫으면 그 아래 홈 탭이 그대로 드러난다. 스택이 비어 있는 경우(딥링크 진입 등)는
      // 탭 루트로 교체한다 — 아무 일도 안 일어나면 사용자가 결과 화면에 갇힌다.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
      // 모달이 닫히며 드러나는 탭 웹뷰는 세션이 끝난 사실을 알 수 없어 여기서 알린다.
      emitSessionClosed();
      // S4 `기록으로 가기`(솔로): 모달 닫기와 탭 전환이 한 메시지로 온다 — 둘로 나누면 첫
      // 메시지가 이 웹뷰를 언마운트하는 사이 둘째가 유실될 수 있다(계약 주석 참고).
      if (message.tab !== undefined) {
        openTab(message.tab, "study_result");
      }
      break;
    case "open-settings":
      void openAppSettings();
      break;
    case "request-camera-permission":
      // 설정(S6)의 카메라 권한 토글이 물어본다. 웹은 이 값을 스스로 알 수 없다 —
      // Permissions API의 `camera`를 iOS WKWebView가 지원하지 않아서다(계약 주석 참고).
      //
      // ⚠️ **조회에 실패하면 답하지 않는다.** `granted: false`로 답하면 웹이 "허용 안 됨"
      // 토글을 그려 사용자에게 틀린 단언을 하게 된다 — 무응답이면 웹은 `null`(모름)을
      // 유지해 토글 자리를 비우고, 다음 포그라운드 복귀에서 다시 묻는다.
      //
      // `getCameraPermissionStatus`는 권한을 **요청하지 않고 조회만** 한다(`requestCameraPermission`과
      // 다른 함수다) — 설정 화면을 열었다는 이유로 OS 권한 팝업이 뜨면 안 된다.
      void getCameraPermissionStatus()
        .then((status) => {
          reply({ type: "camera-permission", granted: status === "granted", atMs: Date.now() });
        })
        .catch((error: unknown) => {
          console.warn("[bridge] 카메라 권한 조회 실패 — 웹에는 알리지 않는다", error);
        });
      break;
    case "share":
      // Android 웹뷰에는 `navigator.share`가 없어 웹이 시트를 못 연다 — 여기서 OS 공유
      // 시트를 대신 연다(계약 주석 참고). 응답은 없다 — 취소(AbortError 상당)도 OS가
      // 이미 사용자에게 보여준 결과라 웹에 알릴 것이 없다.
      //
      // Android의 `Share.share`는 `message`만 쓴다 — 링크는 웹이 만든 `message.text` 본문에
      // 이미 들어 있다. `title`은 시트 제목. 현행 웹은 `url`을 보내지 않고(BY-584, 카톡 프리뷰
      // 중복 방지) 링크를 본문에 둔다. `url`은 레거시 웹 메시지가 보낼 때만 실어 주는데,
      // Android는 어차피 무시하므로 전달해도 무해하다.
      void Share.share({
        message: message.text,
        ...(message.url !== undefined ? { url: message.url } : {}),
        ...(message.title !== undefined ? { title: message.title } : {}),
      }).catch((error: unknown) => {
        console.warn("[bridge] 공유 시트(share) 열기 실패", error);
      });
      break;
    case "navigate-tab":
      // 소셜 결과 화면의 `기록으로 가기`(탭 웹뷰라 모달이 없다)와 홈 친구 초대 카드 → 소셜 탭.
      // 발신처를 안 실은 옛 웹(연속 공부 카드 → 기록)은 `card`다.
      // 솔로 결과는 모달을 닫아야 하므로 `navigate-home {tab}`으로 온다.
      openTab(message.tab, message.via ?? "card");
      break;
    case "set-tab-bar":
      // 전체 화면 웹 라우트(가이드·문의·약관·방침)는 탭 웹뷰 안에서 웹 라우팅으로 열려
      // 네이티브 스택을 건너지 않는다 — 웹이 알려주지 않으면 탭 바가 그대로 남는다.
      setTabBarState(
        message.blockedByModal === true ? "blocked" : message.visible ? "visible" : "hidden",
      );
      break;
    case "auth-ready":
      // 웹이 auth-token 구독을 걸었다 — 이 문서에만 현재 토큰으로 답한다(home-ready·analytics-ready와 같은
      // handshake). 웹뷰는 등록이 끝난 뒤 마운트되므로 보통 저장에서 즉답하고, 갱신 중이면 그 결과를 기다린다.
      void awaitAuth().then((state) => reply(authTokenMessage(state)));
      break;
    case "request-token-refresh":
      // 갱신은 앱 전체 single-flight다. 성공하면 저장이 바뀌어 모든 호스트에 전파되지만 실패(네트워크 오류)
      // 에는 전파가 없다 — 요청한 문서의 대기를 풀기 위해 결과와 무관하게 현재 상태로 답한다. 성공 시 같은
      // 토큰이 두 번 도착하는 것은 무해하다(웹은 덮어쓴다).
      void refreshAuth()
        .then((state) => state ?? ensureAuth())
        .then((state) => reply(authTokenMessage(state)));
      break;
    case "motion-sensor":
      // 소셜룸(소셜 탭·딥링크 join WebView) 경로
      // 싱글룸은 전용 화면이 이 메시지를 가로채 화면 수명에 묶으므로 여기까지 오지 않는다(app/room/[id].tsx 주석 참고).
      getMotionSensorRelay().handle(message, reply);
      break;
    default: {
      // 모든 타입을 case로 처리했으면 여기 오는 타입은 never다. 새 메시지를 추가하고 처리를
      // 빠뜨리면 이 줄에서 컴파일이 깨진다. 런타임에 오는 경우는 타입과 파서가 어긋났을 때뿐이라
      // 예외 대신 개발 빌드 경고만 남긴다.
      const unhandled: never = message;
      if (__DEV__) {
        console.warn("[webview-bridge] ⚠️ case가 없는 타입", (unhandled as { type: string }).type);
      }
    }
  }
}
