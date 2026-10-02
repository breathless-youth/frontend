import {
  getInitialPushNotification,
  getPushToken,
  onPushMessage,
  onPushNotificationOpened,
  onPushTokenRefresh,
  type PushMessage,
  type PushPermissionStatus,
  requestPushPermission,
} from "./pushMessaging";
import { trackNativeEvent } from "./nativeAnalytics";
import { resolvePushRoute } from "./pushNotificationRouting";

/**
 * 푸시 알림 부팅 배선 (BY-586). `app/_layout.tsx`가 마운트 때 한 번 부르고 언마운트 때 해제한다.
 *
 * 지금 하는 일은 "코드는 갖춰 두고 나중에 쓴다"의 최소 범위다:
 * - 포그라운드 수신: 로그만. 표시하지 않는다(세션 화면 방해 금지, 정책 미정).
 * - 알림 탭(백그라운드 `onNotificationOpened`·종료 `getInitialNotification`): data.link를 앱 경로로 바꿔 이동.
 * - 토큰 갱신: 로그만. 서버 등록은 BE API가 생기면 여기서 부른다.
 * - 권한 요청은 여기서 하지 않는다 — 아래 `ensurePushPermission`을 `app/_layout.tsx`가 따로 부른다.
 *
 * 어떤 실패도 앱을 죽이지 않는다 — 구독 실패는 경고, 비동기 실패는 catch.
 */
export type PushBootstrapDeps = {
  navigate(route: string): void;
  devBuild: boolean;
  onTokenRefresh(listener: (token: string) => void): () => void;
  onMessage(listener: (message: PushMessage) => void): () => void;
  onNotificationOpened(listener: (message: PushMessage) => void): () => void;
  getInitialNotification(): Promise<PushMessage | null>;
};

type Overrides = Partial<PushBootstrapDeps> & Pick<PushBootstrapDeps, "navigate">;

export function startPushMessaging(overrides: Overrides): () => void {
  const deps: PushBootstrapDeps = {
    devBuild: __DEV__,
    onTokenRefresh: onPushTokenRefresh,
    onMessage: onPushMessage,
    onNotificationOpened: onPushNotificationOpened,
    getInitialNotification: getInitialPushNotification,
    ...overrides,
  };
  const unsubscribers: (() => void)[] = [];
  let active = true;

  const devLog = (line: string) => {
    if (deps.devBuild) {
      // eslint-disable-next-line no-console -- 개발 빌드에서 수신·토큰 확인용 로그
      console.log(`[push] ${line}`);
    }
  };
  const openRoute = (message: PushMessage) => {
    if (!active) return;
    const route = resolvePushRoute(message.data);
    devLog(`notification opened id=${message.messageId ?? "?"} → ${route}`);
    // 알림 탭은 네이티브만 아는 진입 경로다 — 쿼리(초대코드 등)는 떼고 경로만 싣는다.
    trackNativeEvent("push_notification_opened", { route: route.replace(/[?#].*$/, "") });
    deps.navigate(route);
  };

  try {
    unsubscribers.push(
      deps.onMessage((message) => {
        devLog(
          `foreground message id=${message.messageId ?? "?"} title=${message.notification?.title ?? "-"} data=${JSON.stringify(message.data)}`,
        );
      }),
    );
    unsubscribers.push(deps.onNotificationOpened(openRoute));
    unsubscribers.push(deps.onTokenRefresh((token) => devLog(`token refreshed ${token}`)));
  } catch (error) {
    console.warn("[push] 핸들러 구독 실패", error);
  }

  deps
    .getInitialNotification()
    .then((message) => {
      if (message) openRoute(message);
    })
    .catch((error: unknown) => console.warn("[push] 초기 알림 조회 실패", error));

  return () => {
    active = false;
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

export type PushPermissionDeps = {
  devBuild: boolean;
  requestPermission(): Promise<PushPermissionStatus>;
  getToken(): Promise<string | null>;
};

/**
 * OS 알림 권한 요청. 권한이 없으면 iOS는 알림을 표시하지 않으므로 운영 빌드에서도 묻는다. OS는 창을 한 번만
 * 띄우고 이후 호출에는 저장된 답을 돌려주므로 실행마다 불러도 된다.
 *
 * `app/_layout.tsx`가 ATT 프롬프트 뒤, 권장 업데이트 알림창 앞에 부른다. 실패해도 거부하지 않는다 — 뒤에
 * 이어지는 알림창이 막히면 안 된다. 개발 빌드는 수신 검증용으로 토큰까지 로그에 남긴다.
 */
export async function ensurePushPermission(
  overrides: Partial<PushPermissionDeps> = {},
): Promise<void> {
  const deps: PushPermissionDeps = {
    devBuild: __DEV__,
    requestPermission: requestPushPermission,
    getToken: getPushToken,
    ...overrides,
  };
  try {
    const status = await deps.requestPermission();
    if (deps.devBuild) {
      const token = await deps.getToken();
      // eslint-disable-next-line no-console -- 개발 빌드에서 수신·토큰 확인용 로그
      console.log(`[push] permission=${status} token=${token ?? "(없음)"}`);
    }
  } catch (error) {
    console.warn("[push] 권한 요청·토큰 확인 실패", error);
  }
}
