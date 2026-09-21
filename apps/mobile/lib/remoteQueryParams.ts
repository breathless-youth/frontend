import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Appearance, Platform } from "react-native";

import { ensureUserRegistered } from "./userApi";

/**
 * 원격 웹뷰 URL에 붙일 쿼리 파라미터 — 탭 3개(홈·기록·설정)와 세션 화면이 전부 같은
 * 파라미터 세트를 쓴다(통합 검토 확정, BY-333). 화면마다 따로 조립하면 화면 간 이동에서
 * 값이 갈라진다 — 그래서 화면이 아니라 여기 한 곳에서 만든다.
 *
 * 신원은 더 이상 URL에 싣지 않는다. 웹은 `auth-ready` handshake로 받은 `auth-token`에서
 * userId와 access 토큰을 함께 얻는다. 여기 남은 값은 전부 바이너리마다 고정된 표시라
 * 등록 결과와 무관하다. 다만 등록을 기다리는 일 자체는 `loadRemoteQueryParams`가 계속 한다.
 *
 * - `appVersion`: 설정 화면의 버전 정보 표시용. 못 읽으면 생략한다.
 * - `isNew`는 붙이지 않는다 — 소비하는 화면이 없다(2026-07-31 검토로 범위 밖 확정).
 */
export type RemoteQueryParams = Record<string, string | number>;

export async function buildRemoteQueryParams(): Promise<RemoteQueryParams> {
  const appVersion = Constants.expoConfig?.version;

  const params: RemoteQueryParams = {};
  if (appVersion) {
    params.appVersion = appVersion;
  }
  // `share=1`: 이 바이너리가 `share` 브리지 메시지를 처리할 수 있다는 표시. 웹 shareInvite가
  // 이 표시로 브리지/클립보드 폴백을 가른다 — 수신 코드가 없는 구버전 앱은 표시가 없어
  // 자동으로 폴백에 떨어진다(원격 웹은 구버전 앱에도 즉시 배포되므로 브리지 존재만으로는
  // 판단할 수 없다).
  params.share = "1";
  // `cameraGate=1`: 이 바이너리가 `request-camera-gate`를 처리할 수 있다는 표시. 웹은 이 표시가
  // 있을 때만 게이트 무응답을 차단으로 해석한다(`lib/nativeCameraGate.ts`) — 표시가 없는 구버전
  // 앱에서 소셜 룸 입장이 통째로 막히는 것을 피하기 위해서다. 원격 웹은 구버전 앱에도 즉시
  // 배포되므로 브리지 존재만으로는 처리 가능 여부를 판단할 수 없다(`share`와 같은 이유).
  params.cameraGate = "1";
  // `nativeUpdateGate=1`: 이 바이너리가 강제 업데이트를 네이티브에서 판정한다는 표시(BY-586). 웹의
  // `useForceUpdateGate`는 이 표시가 있으면 판정하지 않는다 — 웹 게이트는 이 표시가 없는 구버전
  // 바이너리 전용으로 남는다(`share`·`cameraGate`와 같은 capability 표시 방식).
  params.nativeUpdateGate = "1";
  // `guestAuth=1`: 이 바이너리가 `auth-ready`에 `auth-token`으로 답한다는 표시. 웹은 이 표시가 있을 때만
  // 첫 토큰을 기다렸다가 `Authorization`을 붙인다 — 표시 없는 구버전 앱은 답할 수 없으므로 기다리지
  // 않고 오늘처럼 보낸다(`share`·`cameraGate`와 같은 capability 표시 방식).
  params.guestAuth = "1";
  // Android WebView는 시스템 다크를 prefers-color-scheme에 전달하지 않아 웹이 스스로 알 수
  // 없다 — 초기 테마를 쿼리로 넘긴다. 값은 이 조립 시점으로 고정된다(테마가 URL을 바꾸면
  // 웹뷰가 통째로 재로드되므로, 실행 중 변경은 theme 브리지 메시지가 맡는다 —
  // `RemoteWebViewHost`). iOS는 미디어쿼리가 동작하므로 붙이지 않는다.
  if (Platform.OS === "android") {
    params.theme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
  }
  return params;
}

// 파라미터는 앱 실행 중 바뀌지 않으므로 모듈 스코프에 캐시한다(BY-333 실기기
// 확인 — 탭마다 리마운트될 때 매번 null부터 다시 시작하면 RemoteScreen이 웹뷰를 언마운트
// 했다가 새로 만들어 웹 페이지가 처음부터 다시 로드됐다). 진행 중인 조립도 공유해 SecureStore
// 중복 읽기를 막는다.
let cachedParams: RemoteQueryParams | null = null;
let pendingParams: Promise<RemoteQueryParams> | null = null;

function loadRemoteQueryParams(): Promise<RemoteQueryParams> {
  if (cachedParams !== null) {
    return Promise.resolve(cachedParams);
  }
  pendingParams ??= (async () => {
    // 등록을 먼저 기다린다. URL에 실을 값이 필요해서가 아니라, 웹뷰가 뜨기 전에 토큰이
    // 준비돼 있어야 첫 요청부터 Authorization이 붙기 때문이다. 멱등이라 이미 등록돼
    // 있으면 네트워크 호출 없이 즉시 반환한다.
    const registered = await ensureUserRegistered();
    const result = await buildRemoteQueryParams();
    // 등록에 실패한 채로 계산된 결과는 캐시하지 않는다 — 네트워크 왕복이 이 호출보다 늦게
    // 끝났을 뿐일 수 있다. 여기서 영구 고정하면 이후 등록이 끝나도 앱을 껐다 켜기 전까지
    // 웹뷰가 토큰 없이 뜬 채로 남는다(BY-333 리뷰에서 Critical로 잡힌 모양). cachedParams를
    // null로 남겨 다음 마운트가 등록을 다시 시도하게 한다.
    if (registered !== null) {
      cachedParams = result;
    }
    pendingParams = null;
    return result;
  })();
  return pendingParams;
}

/** 테스트 전용: 모듈 스코프 캐시를 초기화한다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetRemoteQueryParamsCacheForTests(): void {
  cachedParams = null;
  pendingParams = null;
}

/**
 * 첫 계산 전에만 `null`(로딩)을 돌려준다 — 화면은 이 동안 웹뷰를 띄우지 않고 기다려야
 * 한다. 등록이 끝나기 전에 웹뷰가 뜨면 첫 요청들이 토큰 없이 나가 401을 받고 갱신 경로로
 * 되돌아온다.
 *
 * 등록까지 끝나고 계산되면 이후 모든 마운트(탭 재방문 포함)는 캐시된 값을 **동기적으로
 * 즉시** 돌려준다 — `null` 구간이 다시 생기지 않는다. 이 덕분에 웹뷰가 한 번 뜬 뒤에는
 * 파라미터가 원인이 되어 언마운트되는 일도 없다(빈 화면 깜빡임 방지). 반대로 등록이
 * 실패했다면 캐시되지 않으므로, 다음 마운트는 다시 `null`부터 시작해
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
