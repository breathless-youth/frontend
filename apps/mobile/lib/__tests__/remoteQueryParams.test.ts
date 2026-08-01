import { renderHook, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";

import {
  __resetRemoteQueryParamsCacheForTests,
  buildRemoteQueryParams,
  useRemoteQueryParams,
} from "../remoteQueryParams";
import { ensureUserRegistered } from "../userApi";

/**
 * 원격 웹뷰 쿼리 파라미터 조립(BY-333) — 탭 3개 + 세션이 공유하는 단일 조립처.
 *
 * 검증 범위: userId 있음/없음, appVersion 유무, isNew를 붙이지 않는 것(2026-07-31 검토),
 * 훅이 첫 계산 전엔 null(로딩)을 돌려주는 것, **모듈 스코프 캐시**(두 번째 마운트부터는
 * null 없이 즉시 값을 돌려주고, 읽기는 한 번만 일어나는 것 — BY-333 실기기에서 탭 전환마다
 * 웹뷰가 통째로 재로드되던 결함의 원인), 그리고 **userId 없는 결과는 캐시되지 않고 다음
 * 호출에서 재시도되는 것**(BY-333 리뷰 — 신규 설치 첫 실행에서 등록 네트워크 왕복이
 * `getRegisteredUserId`의 로컬 읽기보다 늦게 끝나 userId가 영영 안 붙던 Critical 결함).
 */

jest.mock("../userApi", () => ({ ensureUserRegistered: jest.fn() }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.4.2" } },
}));

const mockedEnsureUserRegistered = ensureUserRegistered as jest.MockedFunction<
  typeof ensureUserRegistered
>;
const mockedConstants = Constants as unknown as { expoConfig: { version?: string } | null };

beforeEach(() => {
  jest.clearAllMocks();
  mockedConstants.expoConfig = { version: "1.4.2" };
  __resetRemoteQueryParamsCacheForTests();
});

describe("buildRemoteQueryParams", () => {
  it("userId가 등록돼 있으면(ensureUserRegistered가 즉시 반환) userId·appVersion을 함께 붙인다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    await expect(buildRemoteQueryParams()).resolves.toEqual({ userId: 7, appVersion: "1.4.2" });
  });

  it("등록 실패(ensureUserRegistered가 null)해도 throw하지 않고 파라미터에서 userId만 생략한다 — 화면 자체는 뜬다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(null);

    await expect(buildRemoteQueryParams()).resolves.toEqual({ appVersion: "1.4.2" });
  });

  it("appVersion을 읽지 못하면 그것만 생략한다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);
    mockedConstants.expoConfig = null;

    await expect(buildRemoteQueryParams()).resolves.toEqual({ userId: 7 });
  });

  it("isNew는 붙이지 않는다 — 소비하는 화면이 없다(2026-07-31 검토로 범위 밖 확정)", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    const params = await buildRemoteQueryParams();

    expect(params).not.toHaveProperty("isNew");
  });
});

describe("useRemoteQueryParams", () => {
  it("조립이 끝나기 전엔 null을 돌려주다가 완료되면 값을 채운다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    const { result } = renderHook(() => useRemoteQueryParams());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ userId: 7, appVersion: "1.4.2" }));
  });

  it("두 번째 마운트부터는 null 없이 캐시된 값을 즉시 돌려준다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    const first = renderHook(() => useRemoteQueryParams());
    await waitFor(() => expect(first.result.current).toEqual({ userId: 7, appVersion: "1.4.2" }));
    first.unmount();

    // 두 번째 마운트: 캐시가 채워져 있으므로 첫 렌더부터 바로 값이 나와야 한다(null 구간 없음).
    const second = renderHook(() => useRemoteQueryParams());

    expect(second.result.current).toEqual({ userId: 7, appVersion: "1.4.2" });
  });

  it("캐시가 채워진 뒤에는 등록 확인(ensureUserRegistered) 호출이 다시 일어나지 않는다", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    const first = renderHook(() => useRemoteQueryParams());
    await waitFor(() => expect(first.result.current).not.toBeNull());
    first.unmount();

    renderHook(() => useRemoteQueryParams());
    renderHook(() => useRemoteQueryParams());

    expect(mockedEnsureUserRegistered).toHaveBeenCalledTimes(1);
  });

  it("동시에 마운트된 여러 훅은 진행 중인 조립 하나를 공유한다(중복 호출 방지)", async () => {
    mockedEnsureUserRegistered.mockResolvedValue(7);

    const a = renderHook(() => useRemoteQueryParams());
    const b = renderHook(() => useRemoteQueryParams());

    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());

    expect(mockedEnsureUserRegistered).toHaveBeenCalledTimes(1);
  });

  it("userId 없이 계산된 결과는 캐시되지 않는다 — 다음 마운트에서 등록을 다시 시도해 userId를 붙인다(BY-333 Critical 회귀 방지)", async () => {
    // 신규 설치 첫 실행 재현: 첫 마운트 시점엔 아직 등록이 안 끝나 null, 두 번째 마운트
    // 시점엔(예: 탭 재방문) 등록이 끝나 있어 7을 돌려준다.
    mockedEnsureUserRegistered.mockResolvedValueOnce(null).mockResolvedValueOnce(7);

    const first = renderHook(() => useRemoteQueryParams());
    await waitFor(() => expect(first.result.current).toEqual({ appVersion: "1.4.2" }));
    first.unmount();

    // 캐시되지 않았으므로 두 번째 마운트는 다시 null(로딩)부터 시작한다.
    const second = renderHook(() => useRemoteQueryParams());
    expect(second.result.current).toBeNull();

    await waitFor(() => expect(second.result.current).toEqual({ userId: 7, appVersion: "1.4.2" }));
    expect(mockedEnsureUserRegistered).toHaveBeenCalledTimes(2);
  });
});
