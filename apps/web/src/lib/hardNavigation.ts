/**
 * 문서 단위(하드) 내비게이션 헬퍼 — SPA 라우팅(`navigate()`) 대신 브라우저 내비게이션으로
 * **새 문서를 요청해야 하는** 라우트에서 쓴다.
 *
 * 왜 필요한가: COEP 같은 문서 정책 헤더는 **문서 요청의 응답**에서만 정해지고, SPA 라우팅
 * (`pushState`)은 문서를 새로 만들지 않아 이전 문서의 정책을 그대로 승계한다. `/contact`는
 * CORP 헤더가 없는 구글 폼(docs.google.com)을 iframe으로 임베드해야 해서 `vercel.json`이
 * COEP(`require-corp`)를 빼고 내려주는데, 설정(`require-corp` 문서)에서 SPA로 들어가면 그
 * 예외가 적용될 기회가 없어 iframe이 네트워크 레벨에서 차단된다 — 앱 웹뷰에서 문의 폼이
 * 로딩 화면에 영영 멈춰 있던 원인(2026-08-07 iOS 시뮬레이터 WebKit 로그
 * `NetworkLoadChecker::validateResponse … isAccessControl=1`로 확인. 브라우저로 `/contact`를
 * 직접 열면 문서 요청이라 예외가 걸려 재현되지 않는다).
 *
 * jsdom은 실제 내비게이션을 구현하지 않고(`Not implemented: navigation`) `window.location`을
 * 스텁할 수도 없다([LegacyUnforgeable]) — 테스트는 이 모듈을 `vi.mock`으로 갈아끼운다.
 */
export function hardNavigate(url: string): void {
  window.location.assign(url);
}

/** `hardNavigate`의 replace 판 — 현재 문서를 히스토리에 남기지 않는다. */
export function hardReplace(url: string): void {
  window.location.replace(url);
}

/**
 * 하드 내비게이션으로 열린 문서에서 "이전 문서로 `history.back()` 해도 되는가"를 판정한다
 * (순수 함수 — 테스트 대상, `historyGuard.ts`의 판정 분리와 같은 패턴).
 *
 * SPA 라우트가 쓰는 `history.state.idx` 검사는 여기서 못 쓴다 — 하드 내비게이션으로 열린
 * 새 문서에는 BrowserRouter가 `idx: 0`을 심어 항상 딥링크로 보인다. 대신 (1) 같은 오리진에서
 * 넘어왔고(referrer) (2) 뒤로 갈 항목이 실제로 있으면(length) 이전 문서로 되돌아간다.
 *
 * referrer 검사가 없으면 다른 사이트에서 딥링크로 열렸을 때 back()이 앱 밖으로 나간다.
 * 비교는 `${origin}/` 접두로 한다 — `origin` 접두만 보면 `https://호스트.evil.com`류의
 * 위장 오리진이 통과한다.
 */
export function canExitViaHistoryBack(
  referrer: string,
  origin: string,
  historyLength: number,
): boolean {
  return referrer.startsWith(`${origin}/`) && historyLength > 1;
}
