import { afterEach, describe, expect, it } from "vitest";

import { __resetAppPointsGatewayForTests, appPointsGateway } from "../appPointsGateway";

function openAt(search: string) {
  window.history.replaceState(null, "", `/${search}`);
  __resetAppPointsGatewayForTests();
}

afterEach(() => openAt(""));

describe("appPointsGateway", () => {
  it("기본은 받기·충전·광고가 없는 실제 API 경계다", () => {
    openAt("?points=1");
    expect(appPointsGateway().capabilities).toEqual({
      earn: false,
      history: true,
      charge: false,
      ads: false,
    });
  });

  it("개발 빌드에서 pointsMock 장면이 있으면 그 장면의 가짜 경계를 쓴다", async () => {
    openAt("?pointsMock=empty");
    const gateway = appPointsGateway();
    expect(gateway.capabilities.earn).toBe(true);
    await expect(gateway.getBalance()).resolves.toBe(0);
  });

  it("모르는 장면 이름이면 실제 경계를 쓴다", () => {
    openAt("?pointsMock=nope");
    expect(appPointsGateway().capabilities.earn).toBe(false);
  });

  it("주소가 바뀌어도 문서 안에서는 처음 고른 경계를 나눠 쓴다", () => {
    openAt("?pointsMock=default");
    const first = appPointsGateway();
    window.history.replaceState(null, "", "/home");
    expect(appPointsGateway()).toBe(first);
  });
});
