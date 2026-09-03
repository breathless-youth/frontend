import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  hasPermission,
  onTokenRefresh,
  requestPermission,
} from "@react-native-firebase/messaging";

/**
 * FCM(푸시) 어댑터 (BY-585).
 *
 * 화면·컴포넌트가 `@react-native-firebase/messaging`을 직접 import하지 않게 격리한다. 이 티켓에서는
 * 권한 조회·요청과 토큰 발급까지만 감싼다 — 메시지 핸들러(포그라운드·백그라운드·알림 탭)와
 * 서버 토큰 등록은 BY-586에서 이 어댑터에 추가한다.
 *
 * 권한 요청 함수는 어떤 화면에도 연결돼 있지 않다 — 푸시 정책이 미정이다
 * (`docs/screens/SCR-S6-settings.md`). iOS 토큰 발급 자체는 권한 없이도 된다(APNs 등록은
 * RNFB가 자동으로 한다).
 */

export type PushPermissionStatus = "undetermined" | "granted" | "denied";

export type PushMessagingAdapter = {
  /** OS가 보유한 현재 알림 권한 상태. 다이얼로그를 띄우지 않는다. */
  getPermissionStatus(): Promise<PushPermissionStatus>;
  /** OS 알림 권한 다이얼로그를 띄우고 응답을 반환한다. */
  requestPermission(): Promise<PushPermissionStatus>;
  /** FCM 등록 토큰. 발급 불가(시뮬레이터 등)면 null. */
  getToken(): Promise<string | null>;
  /** 토큰이 갱신될 때 호출된다. 반환값은 구독 해제 함수. */
  onTokenRefresh(listener: (token: string) => void): () => void;
};

/**
 * RNFB `AuthorizationStatus`를 카메라 권한과 같은 3단 상태로 좁힌다. iOS의 provisional·ephemeral은
 * 알림이 실제로 전달되므로 granted로 본다.
 */
export function toPushPermissionStatus(status: number): PushPermissionStatus {
  switch (status) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
    case AuthorizationStatus.EPHEMERAL:
      return "granted";
    case AuthorizationStatus.DENIED:
      return "denied";
    default:
      return "undetermined";
  }
}

export const rnfbPushMessagingAdapter: PushMessagingAdapter = {
  async getPermissionStatus() {
    return toPushPermissionStatus(await hasPermission(getMessaging()));
  },
  async requestPermission() {
    return toPushPermissionStatus(await requestPermission(getMessaging()));
  },
  async getToken() {
    const token = await getToken(getMessaging());
    return token ? token : null;
  },
  onTokenRefresh(listener) {
    return onTokenRefresh(getMessaging(), listener);
  },
};

let adapter: PushMessagingAdapter = rnfbPushMessagingAdapter;

/** 테스트에서 어댑터를 교체한다. */
export function setPushMessagingAdapter(next: PushMessagingAdapter): void {
  adapter = next;
}

export function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  return adapter.getPermissionStatus();
}

export function requestPushPermission(): Promise<PushPermissionStatus> {
  return adapter.requestPermission();
}

export function getPushToken(): Promise<string | null> {
  return adapter.getToken();
}

export function onPushTokenRefresh(listener: (token: string) => void): () => void {
  return adapter.onTokenRefresh(listener);
}
