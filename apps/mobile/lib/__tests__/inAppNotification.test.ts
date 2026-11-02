import {
  __resetInAppNotificationsForTests,
  GROUP_PUSH_TYPES,
  inAppNotificationFrom,
  publishInAppNotification,
  subscribeInAppNotifications,
} from "../inAppNotification";
import type { PushMessage } from "../pushMessaging";

/**
 * 앱을 쓰는 중에 온 그룹 알림 고르기와 전달
 *
 * 탭 웹뷰 다섯 개가 함께 떠 있어 가장 최근에 구독한 하나만 받아야 토스트가 겹치지 않는다.
 */

// 링크 허용 목록은 설정의 extra에서 오고, jest 환경의 expo-constants에는 그 값이 없다.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { appSchemes: ["focusmakers"], deepLinkHosts: ["web.focusmakers.app"] } },
  },
}));

const push = (
  data: Record<string, string>,
  notification: PushMessage["notification"] = {
    title: "새 신청을 확인해 볼까요?",
    body: "민준님이 새벽 공시반에 신청했어요",
  },
): PushMessage => ({ messageId: "m1", data, notification });

const NOTIFICATION = { title: "t", body: "b", link: "/social" };

afterEach(() => {
  __resetInAppNotificationsForTests();
});

describe("inAppNotificationFrom", () => {
  it("그룹 푸시 8종만 앱 안 알림이 된다", () => {
    expect(
      inAppNotificationFrom(
        push({ type: "group_application_received", link: "/social/groups/10/applications" }),
      ),
    ).toEqual({
      title: "새 신청을 확인해 볼까요?",
      body: "민준님이 새벽 공시반에 신청했어요",
      link: "/social/groups/10/applications",
      pushType: "group_application_received",
    });
    expect(
      inAppNotificationFrom(push({ type: "first_session_reminder", link: "/home" })),
    ).toBeNull();
    expect(inAppNotificationFrom(push({ link: "/social" }))).toBeNull();
  });

  it.each(GROUP_PUSH_TYPES)("%s는 앱 안 알림이 된다", (type) => {
    expect(inAppNotificationFrom(push({ type, link: "/social" }))).toMatchObject({
      pushType: type,
    });
  });

  it("제목이 없거나 허용되지 않은 링크면 넘기지 않는다", () => {
    expect(
      inAppNotificationFrom({
        ...push({ type: "group_member_kicked", link: "/social?tab=public" }),
        notification: null,
      }),
    ).toBeNull();
    expect(
      inAppNotificationFrom(push({ type: "group_member_kicked", link: "https://evil.example/x" })),
    ).toBeNull();
    expect(
      inAppNotificationFrom(
        push({ type: "group_member_kicked", link: "/social" }, { title: "t", body: null }),
      ),
    ).toBeNull();
    expect(inAppNotificationFrom(push({ type: "group_member_kicked" }))).toBeNull();
  });

  it("허용된 앱 스킴 링크는 받은 그대로 넘기고 웹이 돌려주면 앱이 다시 확인한다", () => {
    expect(
      inAppNotificationFrom(
        push({ type: "group_owner_transferred", link: "focusmakers://social/groups/10" }),
      ),
    ).toMatchObject({ link: "focusmakers://social/groups/10" });
  });
});

describe("앱 안 알림 전달", () => {
  it("보이는 탭 웹뷰 하나에만 넘긴다", () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = subscribeInAppNotifications(first);
    const offSecond = subscribeInAppNotifications(second);

    publishInAppNotification(NOTIFICATION);

    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(NOTIFICATION);
    expect(first).not.toHaveBeenCalled();
    offFirst();
    offSecond();
  });

  it("앞서 구독한 웹뷰가 나중에 풀려도 최근 구독자는 남는다", () => {
    // 탭을 바꾸면 새로 보이는 탭이 구독한 뒤에 이전 탭의 구독이 풀릴 수 있다.
    const previous = jest.fn();
    const next = jest.fn();
    const offPrevious = subscribeInAppNotifications(previous);
    subscribeInAppNotifications(next);
    offPrevious();

    publishInAppNotification(NOTIFICATION);

    expect(next).toHaveBeenCalledTimes(1);
    expect(previous).not.toHaveBeenCalled();
  });

  it("최근 구독자가 풀리면 그 앞의 구독자가 받는다", () => {
    const below = jest.fn();
    subscribeInAppNotifications(below);
    const offTop = subscribeInAppNotifications(jest.fn());
    offTop();

    publishInAppNotification(NOTIFICATION);

    expect(below).toHaveBeenCalledTimes(1);
  });

  it("받을 웹뷰가 없으면 버리고 나중에 구독한 웹뷰에도 넘기지 않는다", () => {
    publishInAppNotification(NOTIFICATION);
    const late = jest.fn();
    subscribeInAppNotifications(late);

    expect(late).not.toHaveBeenCalled();
  });
});
