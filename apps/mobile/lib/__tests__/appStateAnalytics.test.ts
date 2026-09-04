import { createAppStateTracker } from "../appStateAnalytics";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";

/**
 * 백그라운드 복귀 계측 — 떠난 시점은 기록만 하고, 돌아올 때 떠나 있던 시간을 한 건으로 싣는다.
 * iOS `inactive`와 앱 시작 직후의 첫 `active`는 세지 않는다.
 */
let received: NativeAnalyticsEvent[];

beforeEach(() => {
  __resetNativeAnalyticsForTests();
  received = [];
  attachNativeAnalyticsSink((event) => received.push(event));
});

afterEach(() => {
  __resetNativeAnalyticsForTests();
});

const summary = () => received.map((event) => [event.name, event.properties]);

it("background → active에서 떠나 있던 시간을 초로 싣는다 — 떠난 시점 자체는 이벤트가 아니다", () => {
  let now = 1_000;
  const track = createAppStateTracker(() => now);

  track("background");
  now += 12_400;
  track("active");

  expect(summary()).toEqual([["app_foregrounded", { background_sec: 12 }]]);
});

it("앱 시작 직후의 active와 inactive는 세지 않는다", () => {
  const track = createAppStateTracker(() => 1_000);

  track("active");
  track("inactive");
  track("active");

  expect(received).toEqual([]);
});

it("iOS의 inactive를 거쳐 돌아와도 한 건이다", () => {
  let now = 1_000;
  const track = createAppStateTracker(() => now);

  track("inactive");
  track("background");
  now += 3_000;
  track("inactive");
  track("active");

  expect(summary()).toEqual([["app_foregrounded", { background_sec: 3 }]]);
});

it("background가 연속으로 와도 첫 시각을 쓰고, 시계가 뒤로 가도 음수를 내지 않는다", () => {
  let now = 5_000;
  const track = createAppStateTracker(() => now);

  track("background");
  track("background");
  now = 1_000;
  track("active");

  expect(summary()).toEqual([["app_foregrounded", { background_sec: 0 }]]);
});
