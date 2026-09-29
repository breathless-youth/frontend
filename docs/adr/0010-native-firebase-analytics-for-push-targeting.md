# 0010. 푸시 타겟팅을 위해 앱 스트림에만 Firebase Analytics를 붙인다

- Status: Accepted
- Date: 2026-09-29
- Relates to: [ADR 0008](./0008-observability-identifier-scrubbing.md)(웹 GA4·Sentry의 식별자 금지 — 이 ADR은 그 예외를 앱 스트림 하나로 한정한다), [BY-585 설계 문서](../superpowers/specs/2026-09-03-by-585-firebase-sdk-design.md)("Analytics 미링크" 결정을 뒤집는다), `apps/web/src/lib/firebaseAnalyticsBridge.ts`, `apps/mobile/lib/firebaseAnalytics.ts`, `packages/types/src/bridge.ts`(계약 상수)

## 배경

FCM 콘솔의 세그먼트 타겟팅(오디언스·유저 속성·최근 참여)은 Firebase Analytics **앱 스트림** 데이터만 본다. 앱 인스턴스가 어떤 이벤트를 했는지 알아야 그 인스턴스의 푸시 토큰으로 보낼 수 있기 때문이다. 이 앱은 웹뷰 셸이라 사용자 행동 이벤트가 전부 웹 Amplitude로만 나가고, 앱 인스턴스에는 아무 이벤트도 붙지 않아 세그먼트를 만들 수 없었다.

대안은 백엔드가 푸시 토큰을 저장하고 Admin SDK로 보내는 것이다(세그먼트 = DB 쿼리). 데이터가 있는 곳이라 더 정확하고 싸지만, 캠페인 발송을 마케팅이 콘솔에서 직접 하기로 정해(2026-09-29) GA 경로를 택했다. 개인 알림(1:1)은 어차피 백엔드 토큰 발송이 필요하므로 그때 도입한다.

ADR 0008은 웹 GA4·Sentry에 사용자 식별자를 보내지 않는다고 정했다. 그 규칙은 웹 GA4 스트림(gtag)과 Sentry에 그대로 남고, 이 ADR은 **앱 스트림(네이티브 Firebase Analytics) 하나만** 예외로 둔다.

## 결정

1. `@react-native-firebase/analytics`를 앱에 링크한다. 웹 Amplitude 파이프라인의 끝(destination 플러그인)에서 이벤트 사본을 브리지 `analytics-event`로 앱 SDK에 넘긴다. 이벤트 이름은 화이트리스트하지 않는다 — 목록을 따로 두면 Amplitude 카탈로그와 갈라진다.
2. **값은 토큰만** 통과한다(`ANALYTICS_PARAM_VALUE_PATTERN`: enum·에러 코드·정제된 경로·버전). 공백·한글이 든 자유 문자열은 웹과 네이티브가 각각 버린다. 유저 속성은 웹의 화이트리스트(`FIREBASE_USER_PROPERTY_KEYS`)만 넘기고 `$unset`은 `null`로 옮겨 GA 쪽 값을 지운다. 계약 상수는 `packages/types`가 소유해 양쪽이 같은 값으로 거른다.
3. GA user_id에 백엔드 userId를 붙인다. Amplitude와 같은 번호라 두 도구의 사용자가 조인된다. 이 값은 익명 기기 등록의 서버 핸들이지 실명 식별자가 아니다(ADR 0008의 같은 설명).
4. SDK의 자동 화면 보고(`screen_view`)는 `firebase.json`으로 끈다 — 웹뷰 셸이라 RN 화면 하나만 반복 보고돼 잡음이다.
5. dev·prod Firebase 프로젝트에 GA4 속성을 각각 붙인다(GA4 속성 하나에 Firebase 프로젝트 하나). 기존 웹 GA4 속성에는 붙이지 않는다 — 웹뷰 안 gtag 스트림이 이미 앱 사용자를 세고 있어 같은 사람이 둘로 잡힌다.

## 결과

- **릴리즈 게이트**: 앱스토어 개인정보 라벨과 `docs/privacy-policy-analytics-sync.md`를 갱신하기 전에는 이 코드가 든 빌드를 스토어에 내지 않는다. 사용자 ID와 행동 이벤트가 Google로 나가는 변경이다.
- GA 숫자는 Amplitude와 다르다(세션 정의·신원 처리). GA 속성은 알림 타겟팅 전용이고 지표의 기준은 Amplitude다.
- 오디언스는 만든 시점 이후 데이터만 누적하고 처리에 24~48시간이 걸린다. 캠페인보다 먼저 만들어 둔다. 100 인스턴스 미만이면 콘솔이 사용자 수를 숨긴다.
- 세션 시작 이벤트 중복(웹뷰 이중 로드)이 GA에도 그대로 옮겨간다 — 별도 티켓.
- 유저 속성 키를 늘리면 GA 관리 → 맞춤 정의에도 등록해야 FCM 조건에 뜬다. GA4 커스텀 유저 속성 한도는 25개다.

## 대안

- **백엔드 토큰 저장 + Admin SDK 발송**: 세그먼트를 SQL로 계산하고, 마케팅 콘솔 발송이 필요하면 서버가 세그먼트별 토픽에 토큰을 구독시킨다. 더 정확하고 Analytics SDK가 필요 없지만 콘솔 셀프서비스를 우선해 보류. 개인 알림 시점에 함께 도입한다.
- **기존 웹 GA4 속성에 앱 스트림 추가**: 웹뷰 gtag 스트림과 이중 집계라 기각.
- **토픽 구독**: 앱이 아는 상태(디데이 등록 여부 등)에는 즉시 반영돼 낫지만 행동 이력 조건은 못 만든다. 필요해지면 병행한다.
