# BY-608 앱 권장 업데이트 안내(Remote Config `latest_version`) 설계

- 대상: `apps/mobile`
- 관련 티켓: BY-608 (선행 BY-586 — PR #121 위에 쌓음, 머지 후 dev로 리베이스)
- 작성일: 2026-09-04

## 배경

BY-586이 `min_supported_version`으로 "이 아래는 막는다"를 만들었다. 이 티켓은 같은 판정에 `latest_version`을 더해 "이보다 낮으면 한 번 권한다"를 만든다. 코드는 BY-586 작업 중 만들었다가 범위를 나누려 분리해 둔 것이다(사용자 결정 2026-09-04).

## Remote Config 키

- `latest_version` (string, `x.y.z`). 앱 기본값 `"0.0.0"` — 어떤 버전에도 권장을 띄우지 않는 값. 콘솔 조건("앱 버전 < x", 플랫폼)으로 값을 갈라 줄 수 있고 앱 쪽 비교와 겹쳐도 무해하다.
- 기본값은 `lib/forceUpdate.ts`의 `UPDATE_CONFIG_DEFAULTS`에 `min_supported_version`·문구 키와 **함께 한 번의 `setDefaults`**로 등록한다(RNFB는 맵을 통째로 바꾼다).

## `lib/forceUpdate.ts`

- `shouldRecommendUpdate(appVersion, latestVersion)`: 강제와 같은 규칙(세그먼트 숫자 비교, `x.y.z` 아니면 false).
- `resolveForceUpdate()`가 두 값을 한 번의 activate에서 읽고 `recommended`(막히지 않았고 `latest_version`이 더 높음)와 `latestVersion`을 함께 돌려준다. forced면 `recommended`는 항상 false — 알림창 두 장을 띄우지 않는다.

## `lib/recommendedUpdateAlert.ts` + `app/_layout.tsx`

- 통과했고 `recommended`면 홈이 그려진 뒤(폰트·게이트 준비 후) `maybeShow(latestVersion)`. 앱 시작을 막지 않는다.
- OS 알림창(`Alert.alert`) "나중에"(cancel) / "지금 업데이트"(`openAppStore`). Android `cancelable: true` — 뒤로가기·바깥 터치 = 나중에.
- 빈도는 **최신 버전당 한 번**: 어느 경로로 닫혀도 그 `latest_version`을 SecureStore(`focuson.recommendedUpdateDismissedVersion`)에 기록하고 같은 값엔 다시 묻지 않는다. 더 높은 값이 게시되면 다시 묻는다. 기록을 못 읽으면 묻는 쪽으로 기운다(권장은 잔소리가 차단보다 낫다).
- 문구는 확정 카피가 없어 초안("새 버전이 나왔어요" / "최신 버전으로 업데이트하면 더 나아진 포메를 쓸 수 있어요."). 카피가 나오면 상수만 바꾼다.

## 확정한 결정

- Remote Config 값 + 앱 코드로 간다. Firebase In-App Messaging은 Analytics가 필수라 "GA 안 붙임" 결정과 충돌해 보류. 스토어 API로 최신 버전 자동 감지는 Android 공식 API가 없고 iOS 단계적 출시와 어긋나 수동 게시로.
- 반영은 강제와 같이 "다음 실행".

## 테스트

- `lib/__tests__/forceUpdate.test.ts`: `shouldRecommendUpdate` 규칙, 두 키 기본값 한 번 등록, `recommended` 판정(막히면 false·기본값 0.0.0이면 false·앱 버전 이하면 false).
- `lib/__tests__/recommendedUpdateAlert.test.ts`: 두 버튼·cancel 스타일, 같은 버전 재질문 없음, 더 높은 버전 재질문, 나중에/지금 업데이트/onDismiss 기록, 저장소 실패 처리, 기본 의존성 배선.
- `__tests__/root-layout-font-gate.test.tsx`: recommended 시 폰트 준비 후 `maybeShow(latestVersion)`, forced·pass·reject 시 미호출.

## 실기기 검증 절차 (dev 프로젝트)

1. `latest_version`(클라이언트, string)을 `9.9.9`로 게시. `min_supported_version`은 `1.0.0`.
2. 앱 두 번 재실행 → 홈 위에 "새 버전이 나왔어요". 로그 `[force-update] … recommended=true latestVersion=9.9.9`.
3. "나중에" → 재실행하면 다시 뜨지 않는다(로그는 여전히 `recommended=true`).
4. `9.9.10`으로 올려 두 번 재실행 → 다시 뜬다. "지금 업데이트"로 스토어 이동 확인.
5. 끝나면 `0.0.0`으로 되돌린다.

2026-09-04에 BY-586 브랜치에서 1~3까지 iOS로 확인했다(당시 코드 동일).

## 운영 절차

- `docs/releases.md` "최소 지원 버전 정책"의 `latest_version` 문단: 스토어 심사 통과 후 → prod `latest_version` = 새 버전 → 게시. 출시 때마다 올리는 값이라 `min_supported_version`과 분리한다. 이 코드가 든 바이너리부터만 동작한다.

## 범위 밖

- 문구 확정, In-App Messaging, Android Play In-App Updates(flexible), 서버 주도 릴리스 노트.
