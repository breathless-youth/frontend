import {
  AuthorizationStatus,
  getAPNSToken,
  getInitialNotification,
  getMessaging,
  getToken,
  hasPermission,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import { Platform } from "react-native";

/**
 * FCM(푸시) 어댑터 (BY-585).
 *
 * 화면·컴포넌트가 `@react-native-firebase/messaging`을 직접 import하지 않게 격리한다. 권한 조회·요청,
 * 토큰 발급·갱신, 메시지 핸들러(포그라운드·알림 탭·초기 알림·백그라운드)를 감싼다(BY-586). RNFB의
 * `RemoteMessage`는 `PushMessage`로 좁혀 내보내므로 바깥 코드는 RNFB 타입을 모른다. 서버 토큰 등록은
 * BE API가 생기면 추가한다.
 *
 * 권한 요청 함수는 운영 빌드의 어떤 화면에도 연결돼 있지 않다 — 푸시 정책이 미정이다
 * (`docs/screens/SCR-S6-settings.md`). 개발 빌드만 `lib/pushBootstrap.ts`가 수신 검증용으로 부른다.
 * iOS 토큰 발급 자체는 권한 없이도 되지만 APNs 기기 토큰이
 * 먼저 있어야 한다. RNFB는 앱 시작 시 자동으로 APNs에 등록하지만(firebase.json 기본값) 토큰은 잠시
 * 뒤에 도착하므로, `getToken`은 APNs 토큰 유무를 먼저 보고 없을 때만 명시 등록으로 도착을 기다린다.
 * 이미 등록된 상태에서 `registerDeviceForRemoteMessages`를 다시 부르면 UIKit의 등록 상태가 잠시
 * NO로 떨어져 바로 이어지는 `getToken`이 `[messaging/unregistered]`로 실패한다(2026-09-03 실기기).
 * JS 쪽 `isDeviceRegisteredForRemoteMessages`는 자동 등록을 반영하지 않아(JS가 직접 등록하기 전엔
 * 항상 false) 판단 근거로 쓰지 않는다. 등록은 OS 권한 다이얼로그를 띄우지 않는다.
 */

export type PushPermissionStatus = "undetermined" | "granted" | "denied";

/** RNFB `RemoteMessage` 중 우리가 쓰는 부분. 구조적 타입이라 RNFB 타입을 밖으로 내보내지 않는다. */
type RemoteMessageLike = {
  messageId?: string;
  data?: { [key: string]: string | object };
  notification?: { title?: string; body?: string };
};

/** 앱이 다루는 푸시 메시지. data는 문자열 값만 남긴다(서버 계약도 문자열). */
export type PushMessage = {
  messageId: string | null;
  data: Record<string, string>;
  notification: { title: string | null; body: string | null } | null;
};

export function toPushMessage(message: RemoteMessageLike): PushMessage {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(message.data ?? {})) {
    if (typeof value === "string") data[key] = value;
  }
  return {
    messageId: message.messageId ?? null,
    data,
    notification: message.notification
      ? { title: message.notification.title ?? null, body: message.notification.body ?? null }
      : null,
  };
}

export type PushMessagingAdapter = {
  /** OS가 보유한 현재 알림 권한 상태. 다이얼로그를 띄우지 않는다. */
  getPermissionStatus(): Promise<PushPermissionStatus>;
  /** OS 알림 권한 다이얼로그를 띄우고 응답을 반환한다. */
  requestPermission(): Promise<PushPermissionStatus>;
  /** FCM 등록 토큰. 발급 불가(시뮬레이터 등)면 null. */
  getToken(): Promise<string | null>;
  /** iOS APNs 기기 토큰. 아직 못 받았거나 Android면 null. FCM 토큰은 이 토큰이 있어야 발급된다. */
  getApnsToken(): Promise<string | null>;
  /** 토큰이 갱신될 때 호출된다. 반환값은 구독 해제 함수. */
  onTokenRefresh(listener: (token: string) => void): () => void;
  /** 앱이 포그라운드일 때 메시지가 오면 호출된다. OS는 이때 알림을 표시하지 않는다. 반환값은 구독 해제 함수. */
  onMessage(listener: (message: PushMessage) => void): () => void;
  /** 백그라운드 상태에서 사용자가 알림을 눌러 앱이 앞으로 왔을 때. 반환값은 구독 해제 함수. */
  onNotificationOpened(listener: (message: PushMessage) => void): () => void;
  /** 종료 상태에서 알림을 눌러 앱이 켜졌으면 그 메시지, 아니면 null. 한 번만 값이 나온다. */
  getInitialNotification(): Promise<PushMessage | null>;
  /** 백그라운드·종료 상태 메시지 핸들러. 컴포넌트 밖(`index.ts`)에서 한 번만 건다. */
  setBackgroundHandler(handler: (message: PushMessage) => Promise<void>): void;
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

/** APNs 토큰 조회. 미등록 상태에서는 RNFB가 `[messaging/unregistered]`로 던지므로 null로 흡수한다. */
async function readApnsToken(messaging: ReturnType<typeof getMessaging>): Promise<string | null> {
  try {
    return (await getAPNSToken(messaging)) ?? null;
  } catch {
    return null;
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
    const messaging = getMessaging();
    if (Platform.OS === "ios") {
      let apnsToken = await readApnsToken(messaging);
      if (!apnsToken) {
        try {
          await registerDeviceForRemoteMessages(messaging);
        } catch (error) {
          console.warn("[push-messaging] APNs 등록 실패", error);
          return null;
        }
        apnsToken = await readApnsToken(messaging);
      }
      if (!apnsToken) {
        return null;
      }
    }
    const token = await getToken(messaging);
    return token ? token : null;
  },
  async getApnsToken() {
    return readApnsToken(getMessaging());
  },
  onTokenRefresh(listener) {
    return onTokenRefresh(getMessaging(), listener);
  },
  onMessage(listener) {
    return onMessage(getMessaging(), (message) => listener(toPushMessage(message)));
  },
  onNotificationOpened(listener) {
    return onNotificationOpenedApp(getMessaging(), (message) => listener(toPushMessage(message)));
  },
  async getInitialNotification() {
    const message = await getInitialNotification(getMessaging());
    return message ? toPushMessage(message) : null;
  },
  setBackgroundHandler(handler) {
    setBackgroundMessageHandler(getMessaging(), (message) => handler(toPushMessage(message)));
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

export function getApnsToken(): Promise<string | null> {
  return adapter.getApnsToken();
}

export function onPushTokenRefresh(listener: (token: string) => void): () => void {
  return adapter.onTokenRefresh(listener);
}

export function onPushMessage(listener: (message: PushMessage) => void): () => void {
  return adapter.onMessage(listener);
}

export function onPushNotificationOpened(listener: (message: PushMessage) => void): () => void {
  return adapter.onNotificationOpened(listener);
}

export function getInitialPushNotification(): Promise<PushMessage | null> {
  return adapter.getInitialNotification();
}

export function setPushBackgroundHandler(handler: (message: PushMessage) => Promise<void>): void {
  adapter.setBackgroundHandler(handler);
}
