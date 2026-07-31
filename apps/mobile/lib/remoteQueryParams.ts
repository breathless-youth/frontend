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

/**
 * 조립이 끝나기 전엔 `null`(로딩)을 돌려준다. 화면은 이 동안 웹뷰를 띄우지 않고 기다려야
 * 한다 — userId 없이 먼저 떴다가 값이 붙어 다시 로드되면 깜빡임과 이중 로드가 생기고,
 * 그 첫 로드는 "브라우저 단독 모드"로 세션이 저장되지 않는 채로 지나간다.
 */
export function useRemoteQueryParams(): RemoteQueryParams | null {
  const [params, setParams] = useState<RemoteQueryParams | null>(null);

  useEffect(() => {
    let active = true;
    void buildRemoteQueryParams().then((result) => {
      if (active) {
        setParams(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return params;
}
