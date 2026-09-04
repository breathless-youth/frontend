import { setPushBackgroundHandler } from "./pushMessaging";

/**
 * FCM 백그라운드·종료 상태 메시지 핸들러 (BY-586).
 *
 * 컴포넌트 밖, 앱 등록 시점에 한 번 건다(`index.ts`). Android는 앱이 종료된 상태에서도 headless로 JS를
 * 띄워 이 핸들러를 부르고, iOS는 `content-available` 메시지에서 부른다. 지금은 로그만 남긴다 — 표시·저장·
 * 배지 같은 동작은 알림 정책이 정해진 뒤 여기에 추가한다. `notification` 페이로드가 있는 메시지는 OS가
 * 알아서 표시하므로 핸들러가 없어도 알림 자체는 뜬다.
 *
 * 등록 실패(네이티브 모듈 없는 바이너리 등)는 앱을 죽이지 않고 경고로 끝낸다.
 */
export function registerPushBackgroundHandler(): void {
  try {
    setPushBackgroundHandler(async (message) => {
      if (__DEV__) {
        // eslint-disable-next-line no-console -- 개발 빌드에서 수신 확인용 로그
        console.log(
          `[push] background message id=${message.messageId ?? "?"} title=${message.notification?.title ?? "-"} data=${JSON.stringify(message.data)}`,
        );
      }
    });
  } catch (error) {
    console.warn("[push] 백그라운드 핸들러 등록 실패", error);
  }
}
