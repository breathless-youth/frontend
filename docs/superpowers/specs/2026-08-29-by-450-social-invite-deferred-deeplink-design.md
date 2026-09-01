# BY-450 소셜룸 초대 링크 입장 로직 보완 설계

2026-08-29 · 티켓 BY-450 · QA는 BY-451에서 별도 진행

## 배경

소셜룸 초대는 `${origin}/social/join?code=XXXX` 링크를 공유하는 방식이다. 웹 `/social/join`
화면이 `?code`를 읽어 4자리 입력칸을 미리 채우고, iOS는 유니버설 링크
(`applinks:web.sunqstudio.kr`)로 앱이 설치돼 있으면 `app/social/join.tsx` 라우트가 열려
웹뷰까지 `code`가 전달된다. 여기까지는 동작하고, 다음 세 가지가 비어 있다.

- Android App Links가 동작하지 않는다 (`apps/web/public/.well-known/assetlinks.json`의
  서명 지문이 `EAS_SIGNING_CERT_SHA256_FINGERPRINT` 플레이스홀더 그대로다).
- 앱 미설치 사용자의 경로가 없다 (iOS는 Safari 스마트 앱 배너뿐, Android는 스토어 유도 없음).
- 디퍼드 딥링크가 없어 설치를 마친 사용자는 링크를 다시 누르거나 코드를 손으로 입력해야 한다.

배포 상태: iOS는 구 도메인 기준으로 앱스토어 배포 완료, Android는 출시 심사를 통과했지만
플레이스토어 미출시. BY-464가 운영 도메인을 `focusmakers.app`으로 바꾸는 중이다.

## 확정 결정

- **외부 딥링크 툴 없이 자체 구현한다.** 처음에는 Branch 도입으로 결정했으나, 2026-08 기준
  Branch는 무료 티어가 사라져 30일 트라이얼 후 유료(월 $199~ 추정)이고 가입에 회사 도메인
  이메일을 요구하며, AppsFlyer도 2026-08-13부터 무료 플랜에서 디퍼드 딥링크를 뺐다.
  초대코드가 4자리라 iOS 수동 입력의 마찰이 작고, Android는 구글 공식 무료 API로 자동
  복원이 가능해 유료 툴의 값어치가 없다고 판단했다.
- 초대 링크는 지금의 자사 도메인 형식(`${origin}/social/join?code=XXXX`)을 유지한다.
  벤더 도메인 종속이 없어 이미 뿌려진 링크가 계속 산다.
- Android 디퍼드 딥링크는 Play Install Referrer로 구현한다. 스토어 이동 링크의 `referrer`
  파라미터에 코드를 실으면 설치 후 첫 실행에서 `expo-application`의
  `getInstallReferrerAsync()`로 읽을 수 있다.
- iOS 미설치자는 스토어 이동까지만 하고, 설치 후에는 공유 문구에 보이는 4자리 코드를 직접
  입력한다 (iOS에는 공식 통로가 없고, 유료 툴 없이 가능한 대안이 없다).
- 초대코드는 프리필까지만 하고 `참여하기` 1탭은 사용자가 직접 누른다.
- iOS `associatedDomains`에 `focusmakers.app`을 이번에 같이 등록한다 (도메인 준비 전엔
  비활성이라 무해하고, AASA 서빙은 BY-464가 맡는다).

## 설계

### 1. 초대 링크와 웹 스토어 유도

- `inviteLink()`는 기존 그대로 둔다 (`${origin}/social/join?code=XXXX`).
- 웹 `/social/join` 화면에 앱 미설치자를 위한 스토어 이동 버튼을 추가한다. 네이티브 브리지가
  없는 브라우저에서만 보여준다 (웹뷰 안에서는 이미 앱이므로 숨긴다).
- Android 스토어 링크는 `referrer`에 코드를 싣는다:
  `https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile&referrer=code%3DXXXX`.
- iOS 스토어 링크는 `https://apps.apple.com/app/id6797220287` (코드 전달 수단 없음).
- 스토어 링크 조립은 순수 함수로 분리해 테스트한다.

### 2. 앱 수신 (Android Install Referrer)

- `apps/mobile`에 `expo-application`을 추가한다 (Expo 공식 모듈, SDK 54 호환).
- 앱 첫 실행에서 `getInstallReferrerAsync()`로 referrer 문자열(`code=XXXX` 형태)을 읽고,
  코드가 유효하면 기존 딥링크 라우트 `/social/join?code=`로 보낸다.
- referrer는 재조회가 가능하므로 한 번 처리한 뒤 `expo-secure-store`에 소비 플래그를 남겨
  실행마다 다시 이동하지 않게 한다 (`deviceId.ts`와 같은 저장 패턴).
- referrer 문자열에서 코드를 뽑아 라우트를 결정하는 로직은 순수 함수로 분리한다. 코드 규칙은
  웹 `sanitizeInviteCode`와 같다 (숫자 4자리, 앞자리 0 보존).
- Android 전용이다. iOS에서는 이 경로 전체가 동작하지 않는다.
- 앱이 설치된 상태의 링크 클릭은 기존 유니버설 링크·App Links 경로가 그대로 처리한다.

### 3. 네이티브 설정

- `app.json` iOS `associatedDomains`에 `applinks:focusmakers.app`을 추가한다. 기존
  `applinks:web.sunqstudio.kr`은 유지한다.
- Android `intentFilters`는 바꾸지 않는다 (`focusmakers.app` 호스트 추가는 그 도메인에
  `assetlinks.json`이 서빙되는 BY-464 시점에 한다).
- `assetlinks.json`의 지문 플레이스홀더를 실제 값으로 채운다 (업로드 키와 Play 앱 서명 키
  둘 다 넣어 내부 테스트 빌드와 스토어 빌드가 모두 검증되게 한다).

### 4. 실패·경계 처리

- Install Referrer 조회가 실패하거나 모듈이 없으면 아무 일도 하지 않고 기존 진입 흐름으로
  간다 (초대 경험만 저하되고 앱은 정상 동작한다).
- 오가닉 설치의 referrer(`utm_source=google-play` 등)에는 `code`가 없으므로 무시된다.
- 형식이 어긋난 코드는 무시한다.
- 참여 실패(없는 코드, 정원 초과)는 지금 join 화면의 인라인 에러가 그대로 처리한다.

## 테스트 전략

- 웹: 스토어 링크 조립 순수 함수를 단위 테스트한다 (referrer 인코딩, 플랫폼별 URL).
- 모바일: referrer 문자열 → 라우트 결정 순수 함수를 단위 테스트한다 (정상, 앞자리 0,
  코드 없음, 형식 불일치, 빈 문자열).
- 네이티브 API 호출과 스토어 설치 경로는 단위 테스트 대상이 아니고 BY-451의 실기기 QA가
  맡는다 (Play 내부 테스트 트랙으로 referrer 전달까지 검증 가능).

## 사전 준비 (구현 착수 전 외부 작업)

- Android 서명 지문 2개 확인 (`eas credentials` 또는 Play Console → 설정 → 앱 무결성).
  Branch 관련 준비물(계정·키·서브도메인)은 더 이상 필요 없다.

## BY-464 조율

- 이번 작업은 `app.json`의 iOS `associatedDomains`와 `assetlinks.json`을 만진다. BY-464도
  같은 파일을 바꿀 예정이라 머지 순서를 조율한다.
- `focusmakers.app`의 AASA·assetlinks 서빙과 Android intent filter 추가는 BY-464 범위다.

## 완료 조건

- 웹 join 화면에서 미설치 브라우저 사용자에게 스토어 버튼이 보이고, Android 버튼에는
  referrer로 코드가 실린다.
- Android에서 스토어 설치 후 첫 실행에 코드가 join 화면에 채워진다 (실기기 검증은 BY-451).
- 같은 referrer로 두 번째 실행 시 다시 이동하지 않는다.
- 기존 `?code` 링크와 iOS 유니버설 링크 경로가 그대로 동작한다.
- `assetlinks.json`에 실제 지문이 들어간다.
- lint·typecheck·test가 통과한다.
