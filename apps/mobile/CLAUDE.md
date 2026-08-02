@AGENTS.md

# apps/mobile

Expo RN 앱(앱 셸). **2026-07-25 기능 리셋으로 스터디룸 관련 코드(WebView 룸 라우트, dormant 네이티브 자산)는 전부 삭제됐다** — 남은 것은 홈 탭 셸과 익명 기기 유저 등록(SCRUM-259, `lib/*`)뿐이다(git 히스토리에서 복구 가능 — ADR 0003 갱신 노트 참고). 스터디룸 재구축 시 "WebView로 `apps/web`을 로드"하는 방침(ADR 0001)을 따른다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md), [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md) 순서로 참고.

앱 셸(온보딩/로그인/홈 등) 화면을 Figma 기반으로 구현할 때는 [Codex의 AI-native 모바일 개발 설계 문서](../../docs/superpowers/specs/2026-07-22-ai-native-mobile-development-design.md)의 화면 단위 흐름·보호 파일 목록·컴포넌트 승격 규칙을 따른다(단, 이 문서가 전제하는 `AGENTS.md`/`docs/ai-development/`/`docs/screens/`는 아직 이 저장소에 없다 — 루트 [CLAUDE.md](../../CLAUDE.md)의 관련 섹션 참고).

## 구조

`src/` 없이 라우터(`app/`)와 유틸 디렉터리를 루트 바로 아래에 둔다.

- `app/` — `expo-router` 파일 기반 라우팅. `app/(tabs)/`는 탭 네비게이션(현재 홈 탭만).
- `lib/` — 순수 유틸·API 연동 함수(테스트 대상). `deviceId.ts`(기기 UUID), `userApi.ts`(익명 유저 등록), `cameraPermission.ts`(OS 카메라 권한 어댑터), `deviceMotion.ts`(기기 조작 판정 — 순수)·`deviceMotionSource.ts`(`expo-sensors` 가속도 구독 어댑터, BY-340).

(구 스터디룸 라우트 `app/room/[id].tsx`, `features/study-session/`, `platform/{camera,vision,rtc}/`, `components/ui/`는 2026-07-25 기능 리셋으로 삭제 — 재구축 시 git 히스토리의 패턴을 참고한다.)

**경계 규칙**: UI 컴포넌트는 카메라/LiveKit SDK를 직접 import하지 않는다 — 네이티브 전환 시 플랫폼 어댑터 계층을 통한다. 공부 상태 계산은 `@focusmakers/study-core`(순수 TS)에 있고, 카메라/Vision/RTC 구현과 분리된다.

## WebView 스터디룸 (재구축 예정)

- 스터디룸 재구축 시 `react-native-webview`로 `apps/web`의 `/room/:id`를 로드하는 구조(ADR 0001)를 따른다 — 과거 구현은 git 히스토리의 `app/room/[id].tsx` 참고.
- 카메라 권한 문구는 `app.json`의 `ios.infoPlist.NSCameraUsageDescription` / `android.permissions`(`CAMERA`)에 유지되어 있다 — WebView 안의 브라우저 `getUserMedia`도 동일한 네이티브 권한이 필요하다. 마이크 권한은 추가하지 않는다(멀티룸 음성 송출 없음, 방침 변경 없음).
- **2026-07-31(BY-333)부터 로컬 번들 동봉·서빙 인프라가 없다.** 스터디룸을 포함한 모든 화면이 원격 URL을 여는 `RemoteScreen`/`RemoteWebViewHost`로 바뀌면서, `apps/web` 산출물을 앱 번들에 넣고 `@dr.pogodin/react-native-static-server`로 서빙하던 구조([ADR 0005](../../docs/adr/0005-bundled-web-assets-over-localhost-server.md), Superseded)와 `lib/staticWebAssetServer.ts`·`plugins/withWebDistAssets.js`·`scripts/syncWebDist.js`가 전부 삭제됐다. 그 결정이 Expo Go 경로를 닫은 이유로 꼽았던 "로컬 HTTP 서버가 Expo Go에 없는 네이티브 모듈"이라는 전제는 이제 없다.
- **다만 Expo Go로 다시 열렸다고 확정해서 쓰지 말 것 — 미확인.** `app.json`의 `plugins`에는 그 로컬 서버와 같은 커밋(BY-282, `f1070f9`)에 Android cleartext 예외용으로 추가된 `expo-build-properties`가 여전히 남아 있다(`android.usesCleartextTraffic`, 외부 API `apiBaseUrl`이 아직 `http://`라 필요할 수 있음 — iOS `NSAppTransportSecurity.NSAllowsLocalNetworking`도 마찬가지로 남아 있다). config plugin은 prebuild/Dev Client 빌드에서만 적용되므로, 이 앱이 실제로 Expo Go에서 뜨는지는 이 문서를 쓴 시점에 실기기·시뮬레이터로 검증하지 않았다. `expo-camera`·`react-native-webview`·`expo-secure-store`·`react-native-svg`·`react-native-reanimated` 등 나머지 네이티브 의존성 자체는 Expo Go SDK 54에 포함된 표준 모듈이지만, 위 config plugin이 걸림돌로 남아 있을 수 있다는 뜻이다. `expo-dev-client` 의존성도 아직 제거되지 않았다.

## 카메라 권한 (`expo-camera`, 권한 API만)

`expo-camera ~17.0.10`이 **권한 조회·요청 목적으로만** 들어 있다([ADR 0004](../../docs/adr/0004-expo-camera-for-permission-api-only.md)).

- **`CameraView`를 쓰지 말 것.** 카메라 스트림·Vision 추론은 `apps/web`의 WebView `getUserMedia` 소유다(ADR 0001). 네이티브에 프리뷰를 그리는 것은 ADR 0003의 전환 트리거 확인이 선행되어야 하는 별개 결정이다.
- 호출은 `lib/cameraPermission.ts` 어댑터 뒤에만 둔다 — 화면·컴포넌트가 `expo-camera`를 직접 import하지 않는다.
- **`app.json`의 `plugins`에 `expo-camera`를 추가하지 말 것.** 네이티브 링킹은 autolinking으로 되고, plugin을 넣으면 영어 기본 `NSMicrophoneUsageDescription`과 Android `RECORD_AUDIO`가 주입된다. `lib/__tests__/permissionCopy.test.ts`가 이 오염을 잡는다.
- 테스트는 `setCameraPermissionAdapter()`로 어댑터를 교체해 권한 분기를 재현한다. `jest.mock("expo-camera")`는 어댑터 단위 테스트에만 쓴다.

## 네트워크 / ATS — **심사 제출 전 반드시 되돌릴 것**

`extra.apiBaseUrl`이 `http://52.78.219.53:8080`(평문 HTTP + IP 리터럴)이라 iOS ATS에 막힌다. 실기기·시뮬레이터 모두에서 유저 등록·통계 API가 통째로 실패한다.

- 2026-07-29에 `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads: true`를 넣어 열었다. **개발용 임시 조치다.**
- 도메인 한정 예외(`NSExceptionDomains`)로는 못 막는다 — 그 키는 도메인 이름으로 매칭돼서 IP 리터럴에는 적용되지 않는다. 그래서 전면 개방 말고 선택지가 없었다.
- **제대로 된 해법은 백엔드에 도메인 + HTTPS를 붙이고 `apiBaseUrl`을 `https://`로 바꾼 뒤 `NSAllowsArbitraryLoads`를 지우는 것이다.** 이 키를 남긴 채 App Store에 제출하면 심사에서 사유 소명을 요구받는다.
- Android는 별개 경로로 이미 열려 있다(`expo-build-properties`의 `usesCleartextTraffic: true`). 같은 시점에 같이 걷어낼 것.

## 웹 dev 서버로 화면 띄우기 (2026-08-01 갱신 — 키가 `webBaseUrl` 하나로 통합됨)

**모든 화면(탭 3개 + 세션)이 `app.json`의 `extra.webBaseUrl`이 가리키는 원격 주소를 연다**(BY-333). 동봉 자산·로컬 정적 서버·`extra.webDevUrl`·`lib/devWebOrigin.ts`는 전부 삭제됐다 — 예전에 "평소엔 번들, dev일 때만 URL"로 나뉘어 있던 두 경로가 하나가 됐다. 개발 중에는 이 값에 Vite dev 서버 주소를 넣으면 **HMR로 즉시 반영**된다(네이티브 재빌드 불필요).

⚠️ **개발용 값을 커밋하지 말 것.** 커밋된 기본값은 빈 문자열이고, 그 상태에서는 웹뷰 대신 "화면을 불러오지 못했어요" 폴백이 뜬다(`components/RemoteWebViewHost.tsx`). 배포용 값은 BY-332의 배포 파이프라인이 채운다.

Dev Client에서는 이 값이 Metro 매니페스트로 오므로 **Metro만 재시작하면** 반영된다.

### Android

`getUserMedia`는 secure context를 요구하고 `http://`는 **`localhost`일 때만** 인정된다. `adb reverse`로 기기의 localhost를 Mac으로 넘긴다.

```bash
pnpm --filter web dev                     # Vite 5173
adb reverse tcp:5173 tcp:5173
# app.json: "webBaseUrl": "http://localhost:5173"
```

### iOS 실기기

`adb reverse`에 해당하는 것이 없다. **LAN IP를 http로 쓰면 secure context가 아니라 카메라가 막힌다** — 그래서 HTTPS가 필수다.

```bash
brew install mkcert nss
sudo mkcert -install                       # Mac 키체인에 루트 CA 등록
cd apps/web && mkdir -p .certs && cd .certs
mkcert 192.168.0.19 localhost 127.0.0.1 ::1   # 본인 Mac의 LAN IP

VITE_DEV_HTTPS=1 pnpm --filter web dev     # 옵트인이다 — 아래 주의 참고
# app.json: "webBaseUrl": "https://192.168.0.19:5173"
```

기기에는 `mkcert -CAROOT`의 `rootCA.pem`을 AirDrop 등으로 옮겨 프로파일을 설치하고, **설정 → 일반 → 정보 → 인증서 신뢰 설정**에서 신뢰시켜야 한다. LAN IP는 네트워크가 바뀌면 달라지므로 그때마다 인증서를 다시 만든다.

⚠️ **HTTPS는 `VITE_DEV_HTTPS=1`일 때만 켜진다. 인증서 존재만으로 켜지지 않는다** — Android는 반대로 http여야 하기 때문이다(위 절 참고). 인증서 파일이 남아 있다는 이유로 프로토콜이 바뀌면 그날따라 Android가 안 되는 원인을 찾기 어렵다. `.certs/`는 개인 키라 `.gitignore` 대상이다.

### 클라이언트 격리 네트워크(AP isolation)에서는 LAN IP가 안 통한다

회사망 등에서 폰·Mac이 같은 Wi-Fi인데도 서로 통신이 안 되면 위 LAN IP 경로는 어떤 설정으로도 뚫리지 않는다(2026-07-30 확인). 이때는 `VITE_DEV_TUNNEL=1`로 `apps/web/vite.config.ts`의 터널 모드를 켜고 `cloudflared`로 Vite·Metro 양쪽을 터널링한다 — 자세한 이유·설정은 `vite.config.ts`의 `tunnelServerOptions` 주석 참고. 공개 URL이라 검증 후 반드시 내린다.

## 화면 방향 — 세션만 회전 (2026-07-30, 2026-08-01 집행 주체 정정)

**세션(`room/[id]`)만 회전하고 나머지는 전부 세로다.** 가로 레이아웃이 실제로 구현된 화면이 세션뿐이라서다(S3-5·S3-6).

정책은 **세 곳이 함께** 만든다. 한쪽만 보고 고치면 조용히 깨진다.

| 위치                                             | 값                                           | 역할                                                                        |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `app.json`의 `orientation`                       | `"default"`                                  | 네이티브가 허용하는 방향의 **상한**(iOS `UISupportedInterfaceOrientations`) |
| `lib/orientation.ts` (`expo-screen-orientation`) | 루트 세로 잠금 / 세션 마운트에서 해제        | **실제 집행자(iOS)** — 아래 정정 참고                                       |
| `app/_layout.tsx`의 `screenOptions`              | `orientation: "portrait"` / 세션 `"default"` | Android 집행(`setRequestedOrientation`) — iOS에서는 무력                    |

- **`app.json`을 `"portrait"`로 되돌리지 말 것.** 그건 앱을 세로로 만드는 설정이 아니라 상한을 세로로 닫는 설정이라, 세션이 landscape를 요청해도 회전하지 않게 된다.
- **P0-3("rn-screens가 처리하므로 `expo-screen-orientation` 불필요") 정정 (2026-08-01)** — iOS에서 전제가 틀렸음이 소스 추적으로 확인됐다. iOS는 회전 판단 시 앱 델리게이트에 마스크를 묻는데, Expo의 구현은 **구독자가 없으면 Info.plist(= `"default"` = 전 방향)를 그대로 반환**하고, rn-screens의 `orientation` screenOption은 그 경로에서 아예 조회되지 않는다(연결 함수 `shouldAskScreensForScreenOrientationInViewController`를 부르는 코드가 Expo 앱에 없음). 세션 회전이 "동작"했던 것은 설정 덕이 아니라 `fullScreenModal`(presented VC는 UIKit이 직접 조회)이라서였고, **홈·기록·설정의 세로 잠금은 한 번도 동작한 적이 없다**(2026-08-01 실기기 — 홈이 회전됨). 그래서 `expo-screen-orientation`이 그 구독자 역할로 들어왔다. 근거 전문은 `lib/orientation.ts` 주석.
- 세션 해제를 `ALL`이 아니라 `DEFAULT`로 둔 이유는 iOS에서 `ALL`이 거꾸로 세로까지 포함하기 때문이다(rn-screens 시절 `"default"`와 같은 이유).
- `expo-screen-orientation`은 네이티브 모듈이라 **Dev Client 리빌드가 필요하다.** 구형 빌드에서는 잠금 호출이 조용히 실패해 이전 동작(회전 허용)으로 물러난다(`lib/orientation.ts`의 catch).

⚠️ 세션 외 화면에 가로 레이아웃을 만들기 전에는 이 정책을 풀지 말 것 — 현황은 [SCR-S3-5-S3-6](../../docs/screens/SCR-S3-5-S3-6-session-landscape.md)의 "화면별 가로 대응 현황" 참고.

## 개인정보 원칙 (변경 불가, WebView·네이티브 어느 쪽이든 동일)

- 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말 내부에서만 처리. 서버 전송·저장·로그 금지. 서버에는 비공부 상태 이벤트(`StudyEventStatus`: `PHONE`/`DEVICE`/`AWAY`/`PAUSE`)와 세션 집계만 전송 — 용어는 [docs/domain-glossary.md](../../docs/domain-glossary.md) 참고.
- 싱글룸: 영상 자체가 어디에도 전송되지 않는다.
- 멀티룸: 카메라 영상은 LiveKit으로 전송된다(녹화·저장 안 함). "영상이 서버로 전송되지 않는다"고 쓰지 말 것 — "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다"로 표현. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것.

## 네이티브 전환 시 (지금은 해당 없음)

`eas.json`(development/preview/production 프로필)은 전환 대비로 남겨뒀다. 실제로 네이티브로 되돌릴 때 할 일은 [ADR 0003의 전환 체크리스트](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때)를 따른다 — `expo-camera`/`expo-dev-client` 재설치, `platform/*` mock을 실제 구현으로 교체, `eas init`으로 EAS project id 발급 등.

## 명령

```bash
pnpm --filter mobile start      # expo start — Expo Go로 바로 스캔 가능
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

## 컨벤션

- 스타일은 NativeWind(Tailwind 클래스, `className`)를 우선 사용. `StyleSheet.create`는 NativeWind로 표현하기 어려운 경우에만.
- 새 화면 추가 시 `app/` 디렉터리 구조로 라우팅이 결정되므로, 화면 단위 로직은 해당 라우트 파일 옆에 co-locate 한다. 재사용 로직은 `features/`·`platform/`·`packages/*`로 올린다.
- `platform/*`의 mock 구현을 실제 라이브러리로 바꾸기 전에 반드시 [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md)의 전환 트리거/체크리스트를 확인할 것 — 조기 전환하지 않는다.
