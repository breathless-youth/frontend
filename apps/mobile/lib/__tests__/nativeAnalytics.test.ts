import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  trackNativeEvent,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";

/**
 * 네이티브 사용자 이벤트 큐 — 발신부(탭 바·권한 게이트·알림창)와 수신부(`RemoteWebViewHost`)가
 * React 트리에서 이어져 있지 않아 모듈 스코프 통로를 쓴다(`tabReset`과 같은 구도).
 * 핵심 계약은 셋이다: sink가 없으면 보관, 붙는 순간 순서대로 넘김, 활성 sink는 하나뿐.
 */

beforeEach(() => {
  __resetNativeAnalyticsForTests();
  jest.spyOn(Date, "now").mockReturnValue(1_000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function collector() {
  const received: NativeAnalyticsEvent[] = [];
  const detach = attachNativeAnalyticsSink((event) => received.push(event));
  return { received, detach };
}

it("활성 sink가 있으면 즉시 전달한다 — 속성과 발생 시각을 함께", () => {
  const { received } = collector();

  trackNativeEvent("tab_pressed", { tab: "social", from_tab: "home" });

  expect(received).toEqual([
    { name: "tab_pressed", properties: { tab: "social", from_tab: "home" }, atMs: 1_000 },
  ]);
});

it("속성이 없는 이벤트는 properties 키 자체를 싣지 않는다", () => {
  const { received } = collector();

  trackNativeEvent("permission_denied_viewed");

  expect(received).toEqual([{ name: "permission_denied_viewed", atMs: 1_000 }]);
});

it("sink가 없으면 보관했다가 붙는 순간 순서대로 넘긴다 — 권한 거부 화면이 탭을 덮은 동안의 이벤트", () => {
  trackNativeEvent("permission_denied_viewed");
  (Date.now as jest.Mock).mockReturnValue(2_000);
  trackNativeEvent("permission_denied_left", { reason: "back_home" });

  const { received } = collector();

  expect(received.map((event) => [event.name, event.atMs])).toEqual([
    ["permission_denied_viewed", 1_000],
    ["permission_denied_left", 2_000],
  ]);
});

it("한 번 넘긴 이벤트는 다음 sink에 다시 넘기지 않는다 — 이중 집계 방지", () => {
  trackNativeEvent("permission_denied_viewed");
  const first = collector();
  first.detach();

  const second = collector();

  expect(first.received).toHaveLength(1);
  expect(second.received).toHaveLength(0);
});

it("나중에 붙은 sink가 활성이고, 그것이 떨어지면 먼저 붙은 sink로 돌아간다", () => {
  const first = collector();
  const second = collector();

  trackNativeEvent("permission_denied_viewed");
  second.detach();
  trackNativeEvent("permission_denied_settings_opened");

  expect(second.received.map((event) => event.name)).toEqual(["permission_denied_viewed"]);
  expect(first.received.map((event) => event.name)).toEqual(["permission_denied_settings_opened"]);
});

it("모든 sink가 떨어지면 다시 보관한다", () => {
  const { received, detach } = collector();
  detach();

  trackNativeEvent("permission_denied_viewed");
  const next = collector();

  expect(received).toHaveLength(0);
  expect(next.received.map((event) => event.name)).toEqual(["permission_denied_viewed"]);
});

it("보관 상한을 넘으면 오래된 것부터 버린다 — 웹뷰가 오래 안 뜨는 동안의 메모리 상한", () => {
  for (let i = 0; i < 105; i += 1) {
    trackNativeEvent("webview_retry_pressed", { path: `/${i}` });
  }

  const { received } = collector();

  expect(received).toHaveLength(100);
  expect(received[0]?.properties).toEqual({ path: "/5" });
  expect(received.at(-1)?.properties).toEqual({ path: "/104" });
});
