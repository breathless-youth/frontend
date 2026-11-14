import { Platform } from "react-native";

import type * as Notifications from "expo-notifications";

import { t } from "./i18n";

const CHANNEL_ID = "rest";

function loadNotifications(): typeof Notifications {
  // expo-notifications는 네이티브 모듈이라 그것 없이 만든 Dev Client에서는 import 자체가 던진다.
  // 앱 시작을 막지 않도록 메시지가 올 때만 불러온다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드를 jest에서도 돌리려면 require뿐이다.
  return require("expo-notifications") as typeof Notifications;
}

// 예약은 Android 채널을 만드느라 기다리는 동안 뒤에 온 취소가 먼저 끝날 수 있어, 모든 요청을 받은 순서대로 하나씩 처리한다.
let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  // 앞 요청이 실패해도 다음 요청은 처리한다. 실패는 부른 쪽이 받는다.
  queue = run.catch(() => undefined);
  return run;
}

/**
 * 휴식 끝 로컬 알림 예약
 *
 * 같은 `id`의 이전 예약은 먼저 거둬서 휴식마다 알림이 하나만 남는다.
 * Android는 정확한 시각에 울리도록 휴식 채널을 높은 중요도로 만든다. 채널 생성은 같은 값이면 덮어써도 그대로다.
 */
export function scheduleRestNotification({
  id,
  fireAtMs,
  title,
  body,
}: {
  id: string;
  fireAtMs: number;
  title: string;
  body: string;
}): Promise<void> {
  return enqueue(async () => {
    const notifications = loadNotifications();
    if (Platform.OS === "android") {
      await notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: t("notification.restChannel"),
        importance: notifications.AndroidImportance.HIGH,
      });
    }
    await notifications.cancelScheduledNotificationAsync(id);
    await notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAtMs,
        channelId: CHANNEL_ID,
      },
    });
  });
}

/** 휴식 끝 로컬 알림 예약 취소 */
export function cancelRestNotification(id: string): Promise<void> {
  return enqueue(() => loadNotifications().cancelScheduledNotificationAsync(id));
}
