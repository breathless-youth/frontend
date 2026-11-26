import { requireOptionalNativeModule } from "expo-modules-core";
import { Alert, AppState, Platform } from "react-native";

import type * as Notifications from "expo-notifications";

import { appLockNative } from "../modules/app-lock";
import { t } from "./i18n";

const CHANNEL_ID = "rest";

function loadNotifications(): typeof Notifications {
  // expo-notifications는 네이티브 모듈이라 그것 없이 만든 Dev Client에서는 import 자체가 던진다.
  // 앱 시작을 막지 않도록 메시지가 올 때만 불러온다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드를 jest에서도 돌리려면 require뿐이다.
  return require("expo-notifications") as typeof Notifications;
}

/**
 * 이 바이너리가 휴식 끝 로컬 알림을 예약할 수 있는지
 *
 * `expo-notifications` 네이티브 모듈 없이 만든 옛 Dev Client에서는 거짓이다.
 * 웹뷰 주소의 `restNotify` 표시가 이 답을 따라, 울리지 않을 알림 말풍선을 웹이 보이지 않게 한다.
 * 던지는 require 대신 `requireOptionalNativeModule`로 있는지만 본다.
 */
export function isRestNotificationSupported(): boolean {
  return requireOptionalNativeModule("ExpoNotificationScheduler") !== null;
}

// 예약은 Android 채널을 만드느라 기다리는 동안 뒤에 온 취소가 먼저 끝날 수 있어, 모든 요청을 받은 순서대로 하나씩 처리한다.
let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  // 앞 요청이 실패해도 다음 요청은 처리한다. 실패는 부른 쪽이 받는다.
  queue = run.catch(() => undefined);
  return run;
}

type RestNotificationRequest = {
  id: string;
  fireAtMs: number;
  title: string;
  body: string;
};

// 설정에서 돌아왔을 때 다시 예약할 요청. 취소되거나 새 요청이 오면 바뀐다.
let latestRequest: RestNotificationRequest | null = null;
// `나중에`를 고른 사람에게 휴식마다 다시 묻지 않도록 앱을 켤 때마다 한 번만 묻는다.
let askedExactAlarm = false;

/**
 * Android 14부터는 `알람 및 리마인더`가 꺼진 채로 시작해 휴식 끝 알림이 몇 분 늦게 울린다.
 * 휴식 알림을 고른 그때 허용을 묻고, 허용하고 돌아오면 같은 알림을 정확한 시각으로 다시 예약한다.
 * 근사치로 이미 잡힌 예약은 권한이 생겨도 그대로라 다시 예약해야 한다.
 */
function askExactAlarm(request: RestNotificationRequest): void {
  const native = appLockNative;
  if (Platform.OS !== "android" || native === null || askedExactAlarm) return;
  if (native.canScheduleExactAlarms()) return;
  askedExactAlarm = true;
  Alert.alert(t("notification.exactAlarmTitle"), t("notification.exactAlarmBody"), [
    { text: t("notification.exactAlarmLater"), style: "cancel" },
    {
      text: t("common.openSettings"),
      onPress: () => {
        const subscription = AppState.addEventListener("change", (state) => {
          if (state !== "active") return;
          subscription.remove();
          if (latestRequest !== request || request.fireAtMs <= Date.now()) return;
          if (!native.canScheduleExactAlarms()) return;
          void scheduleRestNotification(request).catch((error: unknown) => {
            console.warn("[rest] 정확한 시각으로 다시 예약하지 못함", error);
          });
        });
        native.openExactAlarmSettings();
      },
    },
  ]);
}

/**
 * 휴식 끝 로컬 알림 예약
 *
 * 같은 `id`의 이전 예약은 먼저 거둬서 휴식마다 알림이 하나만 남는다.
 * Android는 정확한 시각에 울리도록 휴식 채널을 높은 중요도로 만든다. 채널 생성은 같은 값이면 덮어써도 그대로다.
 */
export function scheduleRestNotification(request: RestNotificationRequest): Promise<void> {
  const { id, fireAtMs, title, body } = request;
  latestRequest = request;
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
    askExactAlarm(request);
  });
}

/** 휴식 끝 로컬 알림 예약 취소 */
export function cancelRestNotification(id: string): Promise<void> {
  if (latestRequest?.id === id) latestRequest = null;
  return enqueue(() => loadNotifications().cancelScheduledNotificationAsync(id));
}
