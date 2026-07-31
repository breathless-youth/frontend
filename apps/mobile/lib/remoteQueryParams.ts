import Constants from "expo-constants";
import { useEffect, useState } from "react";

import { getRegisteredUserId } from "./userApi";

/**
 * 원격 웹뷰 URL에 붙일 쿼리 파라미터 — 탭 3개(홈·기록·설정)와 세션 화면이 전부 같은
 * 파라미터 세트를 쓴다(통합 검토 확정, BY-333). 화면마다 따로 조립하면 화면 간 이동에서
 * 값이 갈라진다 — 그래서 화면이 아니라 여기 한 곳에서 만든다.
 *
 * - `userId`: 이미 등록된 값만 읽는다(`getRegisteredUserId` — 새 네트워크 호출을 만들지
 *   않는다, `userApi.ts` 참고). 미등록이면 파라미터를 생략한다 — 웹이 없는 값을 null로
 *   받아 "브라우저 단독 모드"로 처리하고, 그 경우 세션이 저장되지 않는다.
 * - `appVersion`: 설정 화면의 버전 정보 표시용. 못 읽으면 생략한다.
 * - `isNew`는 붙이지 않는다 — 소비하는 화면이 없다(2026-07-31 검토로 범위 밖 확정).
 */
export type RemoteQueryParams = Record<string, string | number>;

export async function buildRemoteQueryParams(): Promise<RemoteQueryParams> {
  const userId = await getRegisteredUserId();
  const appVersion = Constants.expoConfig?.version;

  const params: RemoteQueryParams = {};
  if (userId !== null) {
    params.userId = userId;
  }
  if (appVersion) {
    params.appVersion = appVersion;
  }
  return params;
}

// userId·appVersion은 앱 실행 중 바뀌지 않으므로 모듈 스코프에 캐시한다(BY-333 실기기
// 확인 — 탭마다 리마운트될 때 매번 null부터 다시 시작하면 RemoteScreen이 웹뷰를 언마운트
// 했다가 새로 만들어 웹 페이지가 처음부터 다시 로드됐다). 진행 중인 조립도 공유해 SecureStore
// 중복 읽기를 막는다.
let cachedParams: RemoteQueryParams | null = null;
let pendingParams: Promise<RemoteQueryParams> | null = null;

function loadRemoteQueryParams(): Promise<RemoteQueryParams> {
  if (cachedParams !== null) {
    return Promise.resolve(cachedParams);
  }
  pendingParams ??= buildRemoteQueryParams().then((result) => {
    cachedParams = result;
    pendingParams = null;
    return result;
  });
  return pendingParams;
}

/** 테스트 전용: 모듈 스코프 캐시를 초기화한다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetRemoteQueryParamsCacheForTests(): void {
  cachedParams = null;
  pendingParams = null;
}

/**
 * 첫 계산 전에만 `null`(로딩)을 돌려준다 — 화면은 이 동안 웹뷰를 띄우지 않고 기다려야
 * 한다(userId 없이 먼저 떴다가 값이 붙어 다시 로드되면 깜빡임과 이중 로드, 그리고 그 첫
 * 로드가 "브라우저 단독 모드"로 세션이 저장되지 않는 채 지나가는 문제가 생긴다).
 *
 * 한 번 계산되면 이후 모든 마운트(탭 재방문 포함)는 캐시된 값을 **동기적으로 즉시** 돌려준다
 * — `null` 구간이 다시 생기지 않는다. 이 덕분에 웹뷰가 한 번 뜬 뒤에는 파라미터가 원인이 되어
 * 언마운트되는 일도 없다(빈 화면 깜빡임 방지).
 */
export function useRemoteQueryParams(): RemoteQueryParams | null {
  const [params, setParams] = useState<RemoteQueryParams | null>(cachedParams);

  useEffect(() => {
    if (params !== null) {
      return;
    }
    let active = true;
    void loadRemoteQueryParams().then((result) => {
      if (active) {
        setParams(result);
      }
    });
    return () => {
      active = false;
    };
  }, [params]);

  return params;
}
