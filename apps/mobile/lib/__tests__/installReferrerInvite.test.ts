import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";

import {
  consumePendingInviteRoute,
  inviteRouteFromInstallReferrer,
} from "../installReferrerInvite";

jest.mock("expo-application", () => ({ getInstallReferrerAsync: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedReferrer = Application.getInstallReferrerAsync as jest.Mock;
const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockResolvedValue(null);
  mockedSet.mockResolvedValue(undefined);
});

describe("inviteRouteFromInstallReferrer", () => {
  it("referrer의 code로 join 라우트를 만든다", () => {
    expect(inviteRouteFromInstallReferrer("code=0412")).toBe("/social/join?code=0412");
  });

  it("앞자리 0을 보존한다", () => {
    expect(inviteRouteFromInstallReferrer("code=0007")).toBe("/social/join?code=0007");
  });

  it("code가 없으면(오가닉 설치) null을 돌려준다", () => {
    expect(inviteRouteFromInstallReferrer("utm_source=google-play")).toBeNull();
  });

  it("숫자 4자리가 아니면 null을 돌려준다", () => {
    expect(inviteRouteFromInstallReferrer("code=12a4")).toBeNull();
    expect(inviteRouteFromInstallReferrer("code=123")).toBeNull();
  });

  it("빈 값이면 null을 돌려준다", () => {
    expect(inviteRouteFromInstallReferrer("")).toBeNull();
    expect(inviteRouteFromInstallReferrer(null)).toBeNull();
    expect(inviteRouteFromInstallReferrer(undefined)).toBeNull();
  });
});

describe("consumePendingInviteRoute", () => {
  it("referrer의 코드를 라우트로 돌려주고 소비 플래그를 남긴다", async () => {
    mockedReferrer.mockResolvedValue("code=0412");

    await expect(consumePendingInviteRoute()).resolves.toBe("/social/join?code=0412");
    expect(mockedSet).toHaveBeenCalledWith("inviteReferrerConsumedV1", "1");
  });

  it("이미 소비했으면 referrer를 조회하지 않고 null을 돌려준다", async () => {
    mockedGet.mockResolvedValue("1");

    await expect(consumePendingInviteRoute()).resolves.toBeNull();
    expect(mockedReferrer).not.toHaveBeenCalled();
  });

  it("코드 없는 referrer도 소비 처리해 다음 실행에서 재조회하지 않는다", async () => {
    mockedReferrer.mockResolvedValue("utm_source=google-play");

    await expect(consumePendingInviteRoute()).resolves.toBeNull();
    expect(mockedSet).toHaveBeenCalledWith("inviteReferrerConsumedV1", "1");
  });

  it("조회가 던지면 null이고 플래그를 남기지 않는다", async () => {
    mockedReferrer.mockRejectedValue(new Error("unavailable"));

    await expect(consumePendingInviteRoute()).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("플래그 쓰기가 실패해도 확정된 경로는 돌려준다", async () => {
    mockedReferrer.mockResolvedValue("code=0412");
    mockedSet.mockRejectedValue(new Error("keystore not ready"));

    await expect(consumePendingInviteRoute()).resolves.toBe("/social/join?code=0412");
  });
});
