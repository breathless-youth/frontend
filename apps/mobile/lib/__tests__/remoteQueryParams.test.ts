import { renderHook, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";

import { buildRemoteQueryParams, useRemoteQueryParams } from "../remoteQueryParams";
import { getRegisteredUserId } from "../userApi";

/**
 * 원격 웹뷰 쿼리 파라미터 조립(BY-333) — 탭 3개 + 세션이 공유하는 단일 조립처.
 *
 * 검증 범위: userId 있음/없음, appVersion 유무, isNew를 붙이지 않는 것(2026-07-31 검토),
 * 그리고 훅이 조립 완료 전엔 null(로딩)을 돌려주는 것.
 */

jest.mock("../userApi", () => ({ getRegisteredUserId: jest.fn() }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.4.2" } },
}));

const mockedGetRegisteredUserId = getRegisteredUserId as jest.MockedFunction<
  typeof getRegisteredUserId
>;
const mockedConstants = Constants as unknown as { expoConfig: { version?: string } | null };

beforeEach(() => {
  jest.clearAllMocks();
  mockedConstants.expoConfig = { version: "1.4.2" };
});

describe("buildRemoteQueryParams", () => {
  it("userId가 등록돼 있으면 userId·appVersion을 함께 붙인다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    await expect(buildRemoteQueryParams()).resolves.toEqual({ userId: 7, appVersion: "1.4.2" });
  });

  it("userId가 미등록이면 파라미터에서 생략한다(웹이 null로 처리)", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(null);

    await expect(buildRemoteQueryParams()).resolves.toEqual({ appVersion: "1.4.2" });
  });

  it("appVersion을 읽지 못하면 그것만 생략한다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);
    mockedConstants.expoConfig = null;

    await expect(buildRemoteQueryParams()).resolves.toEqual({ userId: 7 });
  });

  it("isNew는 붙이지 않는다 — 소비하는 화면이 없다(2026-07-31 검토로 범위 밖 확정)", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    const params = await buildRemoteQueryParams();

    expect(params).not.toHaveProperty("isNew");
  });
});

describe("useRemoteQueryParams", () => {
  it("조립이 끝나기 전엔 null을 돌려주다가 완료되면 값을 채운다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    const { result } = renderHook(() => useRemoteQueryParams());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ userId: 7, appVersion: "1.4.2" }));
  });
});
