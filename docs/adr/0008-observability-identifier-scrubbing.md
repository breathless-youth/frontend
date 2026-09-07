# 0008. 관측 도구로 나가는 사용자 식별자를 fail-closed로 정제한다

- Status: Accepted
- Date: 2026-09-07
- Relates to: [ADR 0001](./0001-webview-based-study-room-architecture.md)(활성 아키텍처 — WebView), `apps/web/src/lib/sanitizePath.ts`(정제 규칙 단일 소스), `apps/web/src/lib/__tests__/amplitudePipeline.test.ts`·`sentryReplay.test.ts`(계약 고정 테스트)

## 배경

네이티브 셸이 모든 웹뷰 탭을 `?userId=N`으로 연다. 이 값은 서버가 익명 기기 UUID를 등록받고 1:1로 돌려주는 번호라 실명·이메일과 연결되지 않지만, 화면 사용 흐름만 봐야 하는 GA4·Sentry로 새면 화면이 사용자 수만큼 다른 값으로 쪼개져 집계가 망가지고, 개인정보 관점에서도 원칙과 어긋난다. 세 관측 도구(GA4·Sentry·Amplitude)가 각기 다른 경로로 URL을 담기 때문에 한 곳만 막아서는 새는 지점이 남는다.

이 결정은 웹에만 해당한다. 네이티브 Sentry는 쿼리스트링 붙은 요청도 URL 로그도 없어 같은 정제를 두지 않았고, 그 전제가 깨지는 변경을 하면 웹과 같은 정제를 네이티브에도 넣어야 한다.

정제를 한 곳만 믿으면 안 된다는 것을 두 번 겪었다. 2026-08-09 리뷰에서 Amplitude `sanitizeUrlPlugin`이 `init()`보다 먼저 등록됐는데도, 뒤에 실행되는 SDK 내부 플러그인이 `location.href`를 덧붙여 정제가 통째로 우회되고 있었다. "먼저 등록했으니 다 걸린다"는 직관이 틀렸던 것이다. Sentry 쪽도 `beforeSend`가 에러 이벤트에서만 불려, 트랜잭션·스팬으로 같은 URL이 그대로 나가는 경로가 따로 있었다.

## 결정

**세 도구로 나가는 모든 URL에서 알려진 식별자 쿼리 파라미터를 전송 직전에 지운다.**

정제 규칙의 단일 소스는 `sanitizePath.ts`의 `ALLOWED_SEARCH_PARAMS` 화이트리스트다. GA4와 Sentry가 같은 헬퍼를 쓰므로, 분석용 쿼리를 새로 추가할 때 이 목록 한 곳만 고치면 양쪽에 반영된다. URL 파싱 자체가 실패하면 이벤트를 버리는 대신 값을 `[unparseable]`로 치환한다(`sanitizePath.ts`).

fail-closed는 한 곳에만 적용된다. Sentry Session Replay 녹화는 압축 등으로 문자열 정제가 불가능한 형태가 될 수 있어, 그때는 transport가 리플레이를 통째로 버린다(`sentry.ts`). 유출보다 수집 손실을 택하는 선택이고, 나머지 경로는 값 치환으로 이벤트를 살린다.

### GA4

`sanitizePagePath()`를 반드시 거친다. 화이트리스트에 없는 쿼리는 버리고 숫자 경로 세그먼트는 `:id`로 템플릿화한다. 공부 상태·집중률·카메라 데이터·사용자 식별자는 GA4로 보내지 않는다.

### Sentry

스크러빙 콜백을 네 개 모두 둔다. `beforeSend`는 에러 이벤트에서만 불리므로, 트랜잭션·스팬·브레드크럼으로 새는 같은 URL을 `beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb`이 따로 막는다. 에러 경로만 막고 계약을 지켰다고 판단하면 안 된다. 가장 직접적인 유출 지점은 fetch 스팬의 `http.query`다. SDK가 스팬 이름은 정제하지만 속성은 정제하지 않는다.

Session Replay는 카메라 차단 조건으로만 켠다. `replayIntegration`의 `blockAllMedia`가 모든 `<video>`를 기록 시점에 차단하고, 카메라 요소에는 `sentry-block` 클래스로 이중 태깅한다. 리플레이 이벤트는 event processor·recording 훅으로 씻지만, 그 훅이 custom 이벤트에만 불려 rrweb Meta가 세그먼트마다 싣는 원본 `location.href`는 못 씻는다. 그 경로는 transport의 `stripUserIdParam`이 전송 직전 문자열에서 지운다.

**transport와 `useCompression: false`는 한 세트다.** 압축을 되켜면 정제할 수 없는 형태가 되어 transport가 리플레이를 통째로 버린다. 유출보다 수집 손실을 택하는 fail-closed다. `stripUserIdParam`은 이 저장소에서 유일하게 화이트리스트 방식이 아닌 정제기다. 직렬화된 녹화 전체에서 URL을 찾아 재작성하면 오탐 위험이 있어 아는 파라미터만 지운다. `ALLOWED_SEARCH_PARAMS`는 전송을 허용하는 목록이므로 식별자를 여기에 넣으면 안 되고, 새 식별자 파라미터는 `stripUserIdParam`의 제거 패턴에만 추가한다. 빠뜨리면 rrweb Meta `href` 경로로만 티 나지 않게 샌다.

### Amplitude

Amplitude만 수집 범위가 넓다. 서버 `user_id` 연결, 클릭·폼 autocapture, UTM attribution, IP 수집, 공부 도메인 지표를 켰다. GA4·Sentry의 식별자 금지 원칙은 그대로이므로 이 넓힌 규칙을 두 도구로 옮겨 쓰면 안 된다.

URL 정제는 `sanitizeUrlPlugin`이 전송 직전 일괄로 한다. autocapture가 담는 URL은 우리 코드를 거치지 않기 때문이다. 이 플러그인은 enrichment 중 가장 먼저 실행되므로, 뒤에 실행되는 플러그인이 덧붙이는 값은 정제하지 못한다. 그래서 뒤에서 URL을 주입하는 두 경로를 설정으로 막는다. `pageUrlEnrichment: false`와 `attribution: { trackingMethod: "userProperty" }`가 그것이고, 플러그인과 이 둘은 한 세트라 하나만 되돌리면 누수가 되살아난다.

`remoteConfig.fetchRemoteConfig`는 다시 켜지 않는다. 켜면 콘솔의 autocapture 설정이 로컬 설정을 원격으로 덮어써 수집 범위 변경이 코드 리뷰를 우회한다.

## 결과

- 관측 도구로 나가는 데이터에서 사용자 식별자를 정제하는 것이 웹의 상시 규칙이 됐다. 규칙은 각 `apps/web/CLAUDE.md`에 한 줄씩 남기고 근거는 이 문서가 가진다.
- 정제 계약은 `amplitudePipeline.test.ts`(SDK를 mock하지 않고 실제로 돌려 fetch body를 본다)와 `sentryReplay.test.ts`가 고정한다. mock 기반 테스트는 실행 순서 문제를 잡지 못하므로 수집 설정을 바꾸면 파이프라인 테스트로 확인한다.
- 개인정보 이유가 사라진 뒤에도 데이터 품질 이유로 정제를 유지한다. 신원은 `setUserId` 제 자리로만 보낸다.

## 대안

- **한 곳에서만 막기**: 세 도구가 서로 다른 경로로 URL을 담아 한 곳만 막으면 나머지로 샌다. 기각.
- **모든 URL을 통째로 재작성**: rrweb 직렬화 녹화에서 URL을 찾아 재작성하면 오탐으로 정상 데이터를 깨뜨린다. `stripUserIdParam`은 그 대신 알려진 식별자 파라미터만 지운다. 다른 정제기가 쓰는 화이트리스트(허용 목록)와 반대로, 아는 파라미터만 골라 지우는 방식이라 녹화 전체를 건드리지 않는다.
- **압축 켠 채 리플레이 정제**: 압축된 페이로드는 정제할 수 없다. 압축을 끄고 정제 불가 시 버리는 fail-closed를 택했다.
