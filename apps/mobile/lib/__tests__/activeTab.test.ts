import { __resetActiveTabForTests, getActiveTab, setActiveTabRoute } from "../activeTab";

/** 활성 탭 기록 — 탭 레이아웃이 쓰고 브리지 핸들러가 읽는 모듈 스코프 통로. */
afterEach(() => {
  __resetActiveTabForTests();
});

it("기본값은 홈이고, 라우트 이름을 탭 id로 바꿔 기록한다", () => {
  expect(getActiveTab()).toBe("home");

  setActiveTabRoute("records");
  expect(getActiveTab()).toBe("record");

  setActiveTabRoute("social");
  expect(getActiveTab()).toBe("social");
});

it("모르는 라우트는 직전 값을 유지한다 — 탭 밖 화면이 잠깐 끼어도 출발 탭이 사라지지 않는다", () => {
  setActiveTabRoute("settings");
  setActiveTabRoute("permission-denied");

  expect(getActiveTab()).toBe("settings");
});
