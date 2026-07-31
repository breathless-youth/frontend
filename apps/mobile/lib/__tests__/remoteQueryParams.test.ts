import { renderHook, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";

import {
  __resetRemoteQueryParamsCacheForTests,
  buildRemoteQueryParams,
  useRemoteQueryParams,
} from "../remoteQueryParams";
import { getRegisteredUserId } from "../userApi";

/**
 * 원격 웹뷰 쿼리 파라미터 조립(BY-333) — 탭 3개 + 세션이 공유하는 단일 조립처.
 *
 * 검증 범위: userId 있음/없음, appVersion 유무, isNew를 붙이지 않는 것(2026-07-31 검토),
 * 훅이 첫 계산 전엔 null(로딩)을 돌려주는 것, 그리고 **모듈 스코프 캐시**(두 번째 마운트부터는
 * null 없이 즉시 값을 돌려주고, SecureStore 읽기는 한 번만 일어나는 것 — BY-333 실기기에서
 * 탭 전환마다 웹뷰가 통째로 재로드되던 결함의 원인).
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
  __resetRemoteQueryParamsCacheForTests();
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

  it("두 번째 마운트부터는 null 없이 캐시된 값을 즉시 돌려준다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    const first = renderHook(() => useRemoteQueryParams());
    await waitFor(() => expect(first.result.current).toEqual({ userId: 7, appVersion: "1.4.2" }));
    first.unmount();

    // 두 번째 마운트: 캐시가 채워져 있으므로 첫 렌더부터 바로 값이 나와야 한다(null 구간 없음).
    const second = renderHook(() => useRemoteQueryParams());

    expect(second.result.current).toEqual({ userId: 7, appVersion: "1.4.2" });
  });

  it("캐시가 채워진 뒤에는 SecureStore(getRegisteredUserId) 읽기가 다시 일어나지 않는다", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    const first = renderHook(() => useRemoteQueryParams());
    await waitFor(() => expect(first.result.current).not.toBeNull());
    first.unmount();

    renderHook(() => useRemoteQueryParams());
    renderHook(() => useRemoteQueryParams());

    expect(mockedGetRegisteredUserId).toHaveBeenCalledTimes(1);
  });

  it("동시에 마운트된 여러 훅은 진행 중인 조립 하나를 공유한다(중복 읽기 방지)", async () => {
    mockedGetRegisteredUserId.mockResolvedValue(7);

    const a = renderHook(() => useRemoteQueryParams());
    const b = renderHook(() => useRemoteQueryParams());

    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());

    expect(mockedGetRegisteredUserId).toHaveBeenCalledTimes(1);
  });
});
