# BY-891 설치 링크 페이지 설계

- 티켓: BY-891 (상위 BY-822, 후속 BY-889)
- 명세: AI 위키 `product/specs/BY-822-타임랩스.md` §8
- 브랜치: `feature/BY-891-timelapse-install-link` (base `dev`)

## 목표

공유 본문에 붙일 웹 주소 하나로, 받는 사람이 자기 기기에 맞는 스토어(또는 PC면 랜딩)에 도착하게 한다. 어디서 들어왔는지는 팀이 쓰는 UTM으로 남긴다.

## 사용자 결정 (2026-10-08)

| 항목                  | 결정                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 링크 형식             | `https://web.focusmakers.app/download?utm_source=…&utm_medium=…&utm_campaign=…`. 경로 하나에 UTM만 바꿔 다른 공유·광고에도 쓴다 |
| 타임랩스 UTM          | `utm_source=timelapse`, `utm_medium=share`, `utm_campaign=timelapse_share`                                                      |
| PC 등 그 밖의 기기    | `https://focusmakers.app/`에 받은 UTM을 그대로 붙여 보낸다                                                                      |
| App Store 캠페인      | `pt=129235193`(팀 기존 캠페인 링크와 같은 provider 토큰), `ct`는 `utm_campaign`과 같게, `mt=8`                                  |
| 앱이 이미 설치된 경우 | 스토어로 보낸다(스토어 화면에 `열기`가 있다). 앱을 바로 여는 처리는 하지 않는다                                                 |
| 라우트                | `VITE_TIMELAPSE`와 관계없이 항상 둔다. 링크를 받는 사람은 플래그를 모른다                                                       |

팀의 기존 링크 규칙(예시):

- 랜딩 `https://focusmakers.app/?utm_source=youtube&utm_medium=social&utm_campaign=profile_link`
- Play `https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile&referrer=utm_source%3Dyoutube%26utm_medium%3Dprofile%26utm_campaign%3Dyoutube_profile`
- App Store `https://apps.apple.com/app/apple-store/id6797220287?pt=129235193&ct=youtube_profile&mt=8`

## 목적지 만들기 (`features/social-room/storeLink.ts`)

- `installLink(platform: "android" | "ios" | null, utm: InstallUtm): string`을 더한다. 기존 `storeLink(platform, inviteCode)`와 `detectStorePlatform`은 그대로 둔다.
- `InstallUtm`은 `utm_source`·`utm_medium`·`utm_campaign` 세 키만 가진다. 페이지는 주소에서 이 세 개만 읽고 나머지 쿼리는 버린다.
- Android: `https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile`에 UTM이 있으면 `referrer=<URLSearchParams(utm) 인코딩>`을 붙인다. 앱의 설치 리퍼러 처리(`installReferrerInvite.ts`)는 `code`만 읽어 UTM과 충돌하지 않는다.
- iOS: `https://apps.apple.com/app/apple-store/id6797220287?pt=129235193&mt=8`에 `utm_campaign`이 있으면 `ct=<utm_campaign>`을 붙인다.
- 그 밖: `https://focusmakers.app/`에 받은 UTM을 그대로 붙인다.

## 화면 (`routes/DownloadPage.tsx`, 경로 `/download`)

- 열리면 `detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints)`로 판별하고 `window.location.replace(목적지)`로 이동한다. 뒤로 가기로 이 중간 페이지에 다시 들어오지 않게 하려는 것이다.
- 스토어로 가는 Android·iOS만 이동 직전에 기존 `trackStoreLinkRedirected(platform)`을 보낸다. PC는 스토어가 아니라 랜딩으로 가므로 보내지 않는다. 초대 화면에서 온 이동과는 같은 방문의 UTM(`utm_source=timelapse`)으로 나눠 본다.
- 이동 전 잠깐 보이는 화면: 로고와 `스토어로 이동하는 중…`, 자동 이동이 막힌 브라우저를 위해 같은 목적지로 가는 `직접 이동하기` 링크.
- 링크를 연 순간의 UTM은 Amplitude attribution이 자동으로 기록한다(별도 코드 없음).
- 지연 로딩하지 않는다. 링크를 받은 사람이 새 문서로 바로 여는 화면이라 청크를 기다리면 이동이 늦어진다.
- `lib/nativeTabBar.ts`의 `FULL_SCREEN_PATHS`에는 넣지 않는다. 앱 안에서 열 일이 없다.

## 테스트

- `installLink`:
  - Android: UTM이 `referrer`에 한 번 인코딩돼 들어간다(`utm_source%3Dtimelapse%26…`)
  - iOS: `pt=129235193`, `ct=timelapse_share`, `mt=8`
  - 그 밖: `https://focusmakers.app/?utm_source=…`
  - UTM이 없으면 Android는 `referrer`가 없고 iOS는 `ct`가 없다
- `DownloadPage`:
  - Android·iOS·PC 사용자 에이전트별로 `location.replace`가 각 목적지로 불린다
  - 허용하지 않은 쿼리(`code`, `foo`)는 목적지에 실리지 않는다
  - `직접 이동하기` 링크가 같은 목적지를 가리킨다
  - Android·iOS면 `trackStoreLinkRedirected`가 플랫폼 값으로 불리고, PC면 불리지 않는다

## 범위 밖

- 공유 본문에 이 링크를 붙이는 일(BY-889).
- 짧은 주소(`focusmakers.app/t` 같은)는 랜딩 사이트 쪽 일이라 하지 않는다.
