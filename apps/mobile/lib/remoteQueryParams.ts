import Constants from "expo-constants";
import { useEffect, useState } from "react";

import { ensureUserRegistered } from "./userApi";

/**
 * 원격 웹뷰 URL에 붙일 쿼리 파라미터 — 탭 3개(홈·기록·설정)와 세션 화면이 전부 같은
 * 파라미터 세트를 쓴다(통합 검토 확정, BY-333). 화면마다 따로 조립하면 화면 간 이동에서
 * 값이 갈라진다 — 그래서 화면이 아니라 여기 한 곳에서 만든다.
 *
 * - `userId`: `ensureUserRegistered()`를 기다린다(`userApi.ts` 참고) — `getRegisteredUserId`
 *   (SecureStore 로컬 읽기만)를 썼을 때는, 등록을 시작하는 `RootLayout`의
 *   `ensureUserRegistered()`가 자식보다 나중에 끝나는 React effect 순서 때문에 신규 설치
 *   첫 실행에서 항상 로컬 읽기가 먼저 이겨 userId 없이 결과가 굳어버렸다(BY-333 리뷰,
 *   회귀 — 세션 마운트마다 다시 읽던 이전 `room/[id].tsx`에는 없던 문제).
 *   `ensureUserRegistered`는 멱등이라 이미 등록돼 있으면 네트워크 호출 없이 즉시 반환한다.
 *   등록 실패(네트워크 오류 등)는 여기서 throw하지 않고 `null`을 반환하므로(`userApi.ts`
 *   참고) 화면 자체는 항상 뜬다 — 그 경우 파라미터에서 userId를 생략한다. 웹이 없는 값을
 *   null로 받아 "브라우저 단독 모드"로 처리하고, 그 경우 세션이 저장되지 않는다.
 * - `appVersion`: 설정 화면의 버전 정보 표시용. 못 읽으면 생략한다.
 * - `isNew`는 붙이지 않는다 — 소비하는 화면이 없다(2026-07-31 검토로 범위 밖 확정).
 */
export type RemoteQueryParams = Record<string, string | number>;

export async function buildRemoteQueryParams(): Promise<RemoteQueryParams> {
  const userId = await ensureUserRegistered();
  const appVersion = Constants.expoConfig?.version;

  const params: RemoteQueryParams = {};
  if (userId !== null) {
    params.userId = userId;
  }
  if (appVersion) {
    params.appVersion = appVersion;
  }
  // `share=1`: 이 바이너리가 `share` 브리지 메시지를 처리할 수 있다는 표시. 웹 shareInvite가
  // 이 표시로 브리지/클립보드 폴백을 가른다 — 수신 코드가 없는 구버전 앱은 표시가 없어
  // 자동으로 폴백에 떨어진다(원격 웹은 구버전 앱에도 즉시 배포되므로 브리지 존재만으로는
  // 판단할 수 없다).
  params.share = "1";
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
    // userId를 못 얻은 결과는 캐시하지 않는다 — 등록(`ensureUserRegistered`)의 네트워크
    // 왕복이 이 호출보다 늦게 끝났을 뿐일 수 있다. appVersion만 있는 반쪽 결과를 여기서
    // 영구 고정하면, 이후 등록이 끝나도 앱을 껐다 켜기 전까지 userId가 영영 붙지 않는다
    // (BY-333 리뷰 — Critical). cachedParams를 null로 남겨 다음 호출이 다시 시도하게 한다.
    if (result.userId !== undefined) {
      cachedParams = result;
    }
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
 * userId까지 포함해 계산되면 이후 모든 마운트(탭 재방문 포함)는 캐시된 값을 **동기적으로
 * 즉시** 돌려준다 — `null` 구간이 다시 생기지 않는다. 이 덕분에 웹뷰가 한 번 뜬 뒤에는
 * 파라미터가 원인이 되어 언마운트되는 일도 없다(빈 화면 깜빡임 방지). 반대로 등록이 아직
 * 안 끝나 userId 없이 계산됐다면 캐시되지 않으므로, 다음 마운트는 다시 `null`부터 시작해
 * `ensureUserRegistered()`를 다시 시도한다.
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
