# 0005. 웹 자산을 앱 번들에 동봉하고 localhost HTTP 서버로 서빙

- Status: **Superseded** (2026-07-31, BY-333) — 전 화면을 원격 URL 웹뷰로 여는 셸 구조로 전환되면서 이 결정 전체(번들 동봉·`@dr.pogodin/react-native-static-server`·`syncWebDist`/config plugin)가 폐기됐다. `apps/mobile`은 더 이상 `apps/web` 산출물을 번들에 넣거나 로컬 서버로 서빙하지 않는다 — `components/RemoteScreen.tsx`/`RemoteWebViewHost`가 원격 URL을 직접 로드한다. 관련 인프라 코드는 BY-333에서 삭제됐다. 이 문서는 그 시점의 결정 기록으로 남긴다.
- Date: 2026-07-28
- Relates to: [ADR 0001](./0001-webview-based-study-room-architecture.md)(활성 아키텍처), [ADR 0003](./0003-phased-rollout-webview-mvp-then-native.md)(단계적 롤아웃), [ADR 0004](./0004-expo-camera-for-permission-api-only.md)(카메라 권한), [Vision 파이프라인 설계 §1](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)

## 배경

ADR 0001이 "모바일 스터디룸은 `apps/web`을 WebView로 로드한다"를 정했지만, **그 웹 자산을 어디서 가져오는가**는 열려 있었다. 선택지는 원격 URL, `file://`, 그리고 앱 번들 동봉 + 로컬 서버 셋이었다.

이 결정을 강제한 것은 mvp-scope의 **"세션은 네트워크 없이 완전히 동작한다"** 와, 브라우저가 `getUserMedia`를 secure context(`https` 또는 `localhost`)에서만 허용한다는 제약이다.

## 결정

**`apps/web` 빌드 산출물을 앱 번들에 동봉하고, 네이티브가 띄운 로컬 HTTP 서버(`127.0.0.1:{동적포트}`)로 서빙한다.** WebView는 `http://127.0.0.1:{포트}/room/:id`를 연다.

서버는 `@dr.pogodin/react-native-static-server` 0.27.0(lighttpd 임베드)이다. 선정 기준 네 가지 — RN 0.81/Expo SDK 54 호환, iOS·Android 양쪽 지원, 커스텀 응답 헤더 가능(COOP/COEP 여지), 동적 포트 — 를 모두 통과한 유일한 후보였다. 러너업은 `react-native-tcp-socket` 위 직접 구현.

### 자산을 바이너리 안으로 넣는 방법 — config plugin

`apps/mobile/plugins/withWebDistAssets.js`가 처리한다. Expo CNG라 `ios/`·`android/`가 매 prebuild마다 재생성되는 생성물이어서, 라이브러리 README가 안내하는 **수동 Xcode 폴더 참조·gradle `assets.srcDirs` 설정은 다음 prebuild에서 사라진다.**

- **iOS** — `Bundle web-dist assets` 셸 스크립트 빌드 단계를 붙여, 매 빌드에 `assets/web-dist`를 앱 번들 리소스 루트로 복사한다. 런타임의 `resolveAssetsPath("web-dist")`가 보는 자리가 정확히 거기다.
- **Android** — prebuild 때 `android/app/src/main/assets/web-dist`로 복사하고, 앱이 첫 세션에서 `copyFileAssets`로 문서 디렉터리에 풀어낸다. 안드로이드의 번들 asset은 APK 안에 압축돼 있어 파일 경로가 없고, lighttpd는 파일 경로로만 서빙하기 때문이다.

**iOS에서 폴더 참조 대신 스크립트 단계를 쓴 이유**는 폴더 참조가 파일 참조를 pbxproj에 하나씩 기록하는 방식이라 prebuild가 프로젝트를 재생성할 때마다 정합성을 맞춰야 하고 중복 등록·유령 참조 같은 조용한 고장이 붙기 때문이다. 스크립트 단계는 그런 상태가 없고, 소스가 없으면 빌드를 그 자리에서 실패시킨다.

**Android 추출본에는 빌드 지문이 따라붙는다.** 한 번 풀어둔 파일은 앱을 업데이트해도 지워지지 않으므로, 그냥 두면 새 앱이 옛 화면을 계속 서빙한다. `scripts/syncWebDist.js`가 남기는 `.build-stamp`(전체 파일의 경로+내용 SHA-256)를 번들 쪽과 비교해 다르면 통째로 지우고 다시 푼다.

## 고려한 대안

**원격 URL** — 첫 실행에 네트워크가 필요해 오프라인 정책이 화면 로드 단계에서 무너진다. 모델·wasm을 Service Worker 캐시에 의존하게 되는데, OS가 캐시를 정리하면 그 사용자는 세션을 **아예 시작할 수 없다.**

**`file://`** — 세 가지가 걸린다. (1) `getUserMedia` 승인이 엔진 구현에 따라 갈리고 WKWebView에서 거부된 사례가 보고돼 있다. (2) COOP/COEP 헤더를 붙일 수단이 없어 멀티스레드 wasm 경로가 아예 막힌다 — 이건 ADR 0003의 네이티브 전환 트리거 1번("WebView 성능이 목표치 미달임이 실측으로 확인")과 직결된다. `file://`은 성능 상한이 인위적으로 낮아 **그 실측이 WebView의 한계인지 서빙 방식의 한계인지 구분되지 않고**, 잘못된 근거로 아키텍처를 뒤집을 위험이 있다. (3) `apps/web`은 `react-router`의 history 라우팅을 쓰는데 `file://`에는 "모르는 경로는 index.html"을 해줄 주체가 없어 HashRouter로 갈아엎어야 하고, 독립 브라우저 배포본(ADR 0001)에까지 그 URL 오염이 남는다.

## 결과

**Expo Go 경로가 닫힌다.** 로컬 HTTP 서버가 Expo Go에 없는 네이티브 모듈이라 `expo-dev-client` + Dev Build가 필요해졌다. `react-native-webview`·`expo-sensors`·`expo-file-system`은 Expo Go에도 있으므로 **Dev Client를 강제하는 것은 서버 라이브러리 하나뿐이다.**

이 비용은 새로 생기는 것이 아니라 **앞당겨지는 것**이다. Expo Go는 개발 도구이지 배포 수단이 아니므로 V1.0을 스토어에 올리는 시점에 EAS Build는 어차피 필요하다. 실질적으로 새로 드는 것은 iOS 실기기 Dev Build 설치에 필요한 Apple Developer 계정뿐이다.

**[ADR 0003](./0003-phased-rollout-webview-mvp-then-native.md)의 "지금은 Dev Client가 불필요하다"는 서술은 이 결정으로 낡았다.** ADR은 시점 기록이므로 그 문서 자체는 수정하지 않는다 — 이 문단이 그 갱신이다.

**빌드 파이프라인에 순서가 생긴다.** `apps/web` 빌드 → `sync-web` → 앱 빌드. 복사를 누락하면 옛 화면이 담긴 앱이 **에러 없이** 나오므로, CI 가드(`sync-web:check`)와 iOS 빌드 단계의 명시적 실패로 막는다.

**앱 용량이 늘어난다.** 현재는 web-dist가 322 KB로 무시할 수준이지만, 계획 2에서 MediaPipe wasm 런타임과 `efficientdet_lite0.tflite`(int8·float32 두 변형)가 들어오면 수 MB가 된다. config plugin 방식은 파일 수·크기에 무관하게 동작하므로 그때 코드 변경이 필요 없다.

**V1.3(P2P 영상 공유)의 전제 조건을 미리 만족한다.** `RTCPeerConnection`도 secure context를 요구한다. `file://`을 택했다면 V1.3에서 어차피 이 구조로 옮겨야 했고, 그때는 이미 올라간 세션 코드 위에서 서빙 방식을 바꾸는 작업이 됐을 것이다.

### 검증된 것 (2026-07-28)

실측 결과는 [Vision 파이프라인 설계 §10](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)에 기록했다.

- **iOS 시뮬레이터** — 서버가 동적 포트로 기동, `/`·`/room/1` 200 + HTML, 참조 자산 전부 200
- **Android 에뮬레이터** — 위에 더해 런타임 추출이 실제로 동작(`files/web-dist/`에 지문 포함 전부), WebView 안에서 카메라가 열리고 프리뷰가 렌더링됨, **권한 프롬프트 1회**

### 남는 위험

- **비행기 모드 미검증** — `localhost`가 기기 내부 주소이므로 구조적으로는 보장되지만, 실제로 확인하지 못했다. 시뮬레이터·에뮬레이터 어느 쪽도 기내 모드를 제공하지 않는다. **오프라인 정책의 핵심 근거이므로 실기기에서 반드시 확인해야 한다.**
- **iOS 실기기 전반 미검증** — Apple Developer 계정 승인 대기. 시뮬레이터에는 카메라가 없어 S2를 확인할 수 없었다.
- **Android release 빌드 미검증** — debug 빌드에서는 라이브러리 이슈 #152(pcre2/CMake 실패)가 재현되지 않았으나, 그 이슈는 release 빌드에서 보고된 것이다.
- **빌드 시간** — 라이브러리가 `-PreactNativeArchitectures` 필터를 따르지 않고 lighttpd를 4개 ABI로 컴파일해 Android 첫 빌드가 약 35분 걸린다. `abiFilters`로 줄일 수 있다.
