import type { PushMessage } from "./pushMessaging";
import { PUSH_LINK_KEY, routeFromPushLink } from "./pushNotificationRouting";

/**
 * 앱을 쓰는 중에 온 그룹 알림 고르기와 전달
 *
 * 앱이 포그라운드일 때 OS는 알림을 띄우지 않으므로 그룹 알림만 보이는 탭 웹뷰에 넘겨 웹이 토스트로 그린다.
 * 받는 쪽은 `RemoteWebViewHost`이고 푸시 부팅 코드와 React 트리에서 이어지지 않아 모듈 스코프 통로를 쓴다.
 * 웹뷰 호스트도 이 파일을 불러오므로 RNFB를 끌고 오지 않게 푸시 메시지 타입만 가져온다.
 */

/** 서버가 그룹 푸시의 데이터 `type`에 싣는 값 */
export const GROUP_PUSH_TYPES = [
  "group_application_received",
  "group_owner_transferred",
  "group_application_accepted",
  "group_application_declined",
  "group_application_expired",
  "group_application_room_closed",
  "group_member_started",
  "group_member_kicked",
] as const;

export interface InAppNotification {
  title: string;
  body: string;
  /** 서버가 보낸 링크 그대로다. 웹이 누름으로 돌려주면 앱이 허용 규칙으로 다시 확인한다. */
  link: string;
  /** 열림 계측에 실을 알림 종류 */
  pushType?: string;
}

type GroupPushType = (typeof GROUP_PUSH_TYPES)[number];

function isGroupPushType(value: string | undefined): value is GroupPushType {
  return (GROUP_PUSH_TYPES as readonly (string | undefined)[]).includes(value);
}

/**
 * 포그라운드 푸시에서 앱 안 알림 고르기
 *
 * 그룹 푸시 8종이고 제목과 본문이 있고 링크가 허용 규칙을 통과할 때만 넘긴다.
 * 다른 푸시는 지금처럼 띄우지 않는다.
 * 외부 주소는 웹으로도 넘기지 않아 누름이 라우터에 닿을 일이 없다.
 */
export function inAppNotificationFrom(message: PushMessage): InAppNotification | null {
  const pushType = message.data.type;
  if (!isGroupPushType(pushType)) {
    return null;
  }
  const title = message.notification?.title;
  const body = message.notification?.body;
  const link = message.data[PUSH_LINK_KEY];
  if (!title || !body || link === undefined || routeFromPushLink(link) === null) {
    return null;
  }
  return { title, body, link, pushType };
}

type InAppNotificationListener = (notification: InAppNotification) => void;

/** 구독한 순서대로 두고 마지막 구독자가 받는다. 최근 구독자가 풀리면 앞의 구독자가 다시 받는다. */
const listeners: InAppNotificationListener[] = [];

/**
 * 보이는 탭 웹뷰에 앱 안 알림 보내기
 *
 * 탭 웹뷰 다섯 개가 함께 떠 있어 가장 최근에 구독한 하나에만 보내야 토스트가 겹치지 않는다.
 * 받을 웹뷰가 없으면 버린다.
 * 나중에 뜬 화면이 지난 알림을 토스트로 띄우면 이미 지나간 일이 새 일처럼 보인다.
 */
export function publishInAppNotification(notification: InAppNotification): void {
  listeners[listeners.length - 1]?.(notification);
}

/**
 * 앱 안 알림 구독
 *
 * 반환값을 부르면 풀린다.
 * 웹뷰 호스트는 보이는 동안 웹이 준비 신호를 보낸 문서일 때만 구독한다.
 */
export function subscribeInAppNotifications(listener: InAppNotificationListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.lastIndexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

/** 테스트 전용: 구독자를 비운다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetInAppNotificationsForTests(): void {
  listeners.length = 0;
}
