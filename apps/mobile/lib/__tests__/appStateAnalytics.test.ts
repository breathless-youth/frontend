import { createAppStateTracker } from "../appStateAnalytics";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";

/**
 * 포/백그라운드 전환 계측 — 실제로 떠난 것(`background`)만 세고, 돌아올 때 떠나 있던 시간을 싣는다.
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

it("background → active를 한 쌍으로 남기고 떠나 있던 시간을 초로 싣는다", () => {
  let now = 1_000;
  const track = createAppStateTracker(() => now);

  track("background");
  now += 12_400;
  track("active");

  expect(summary()).toEqual([
    ["app_backgrounded", undefined],
    ["app_foregrounded", { background_sec: 12 }],
  ]);
});

it("앱 시작 직후의 active와 inactive는 세지 않는다", () => {
  const track = createAppStateTracker(() => 1_000);

  track("active");
  track("inactive");
  track("active");

  expect(received).toEqual([]);
});

it("iOS의 inactive를 거쳐 돌아와도 한 쌍이다", () => {
  let now = 1_000;
  const track = createAppStateTracker(() => now);

  track("inactive");
  track("background");
  now += 3_000;
  track("inactive");
  track("active");

  expect(summary()).toEqual([
    ["app_backgrounded", undefined],
    ["app_foregrounded", { background_sec: 3 }],
  ]);
});

it("background가 연속으로 와도 한 번만 세고, 시계가 뒤로 가도 음수를 내지 않는다", () => {
  let now = 5_000;
  const track = createAppStateTracker(() => now);

  track("background");
  track("background");
  now = 1_000;
  track("active");

  expect(summary()).toEqual([
    ["app_backgrounded", undefined],
    ["app_foregrounded", { background_sec: 0 }],
  ]);
});
