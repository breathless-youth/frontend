# 0004. 카메라 권한 조회·요청에 expo-camera 도입 (권한 API만)

- Status: Accepted
- Date: 2026-07-27
- Relates to: [ADR 0001](./0001-webview-based-study-room-architecture.md)(활성 아키텍처), [ADR 0003](./0003-phased-rollout-webview-mvp-then-native.md)(네이티브 전환 트리거), [SCR-S2](../screens/SCR-S2-camera-permission.md), [SCR-S6](../screens/SCR-S6-settings.md)

## 배경

`apps/mobile`의 카메라 권한은 2026-07-27까지 **전부 mock으로 동작했다.** `lib/cameraPermission.ts`가 어댑터 인터페이스와 주입점(`setCameraPermissionAdapter()`)만 갖고 기본값을 mock으로 두었고, 프로덕션 코드에서 그 주입점을 호출하는 곳이 하나도 없었다. mock 기본값이 `denied`라 "집중 시작"을 누르면 항상 S2-3(권한 거부 안내)으로 떨어졌다.

의도된 상태였다. 루트 `CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"에 따라 네 문서(`SCR-S2` Implementation Notes 7 / Review Checklist, `SCR-S6` Implementation Notes 6 / Data Contract 2)가 `expo-camera` 설치를 **리더 승인 대기** 항목으로 명시해 뒀다.

그대로 두면 두 가지가 막힌다.

1. **출시 블로커** — `SCR-S6` Current Limitations가 명시한 대로, 설정 화면의 카메라 권한 토글이 Figma 예시값(`On`)을 정적으로 렌더한다. 실제로 권한을 거부한 사용자에게 "허용됨"으로 보인다.
2. **검증 불가** — OS 권한 다이얼로그(S2-2)를 띄울 수단이 없어 S2-2 → S2-3 전이를 시뮬레이터·실기기에서 확인할 수 없다.

## 결정

**`expo-camera`(SDK 54 기준 `~17.0.10`)를 `apps/mobile`에 추가하고, 권한 조회·요청 API만 사용한다.**

- `Camera.getCameraPermissionsAsync()` / `Camera.requestCameraPermissionsAsync()`만 호출한다.
- **`CameraView`(프리뷰 컴포넌트)는 쓰지 않는다.** 카메라 스트림과 Vision 추론은 `apps/web`의 WebView `getUserMedia`가 소유한다(ADR 0001). 이 결정은 그 소유권을 옮기지 않는다.
- 호출은 `lib/cameraPermission.ts`의 어댑터 뒤에 격리한다 — UI 컴포넌트가 카메라 SDK를 직접 import하지 않는다는 경계 규칙(`apps/mobile/CLAUDE.md`)을 그대로 지킨다.

### 왜 이 라이브러리인가

ADR 0001은 카메라 *스트림*을 웹이 소유한다고 정했지만, **OS 권한 선언과 승인은 여전히 네이티브 소유**다 — ADR 0001 스스로 "WebView 안에서 카메라 권한을 iOS(Info.plist)·Android(Manifest)·WebView 설정 세 군데에서 맞춰야 함"이라고 적고 있다. WebView 안의 `getUserMedia`도 같은 네이티브 권한을 필요로 한다. 즉 권한 게이트는 웹으로 위임할 수 있는 관심사가 아니다.

대안이던 "WebView 계층 위임"은 `react-native-webview`가 아직 설치돼 있지 않아 지금 선택 가능한 안이 아니었고, 설치한다 해도 권한 승인 자체를 대신해 주지는 않는다.

### 왜 ADR 0003의 네이티브 전환이 아닌가

ADR 0003의 전환 체크리스트 2번이 "`platform/camera`를 mock에서 실제 구현(`expo-camera` 재설치 등)으로 교체"를 포함하지만, 그것은 **네이티브 스터디룸 전환 패키지의 일부**다(1·3·4·5번과 묶여 있고 6번에서 ADR Status를 뒤집는다). 이번 도입은 그 패키지가 아니다.

- 전환 트리거(성능 실측 미달 / Vision·LiveKit 호환성 검증 완료 / 사용자 지표) 중 어느 것도 충족되지 않았고, 트리거 자체가 아직 "프로덕트 오너 확정 대기"다.
- ADR 0001은 계속 활성이고, S3 계열 화면은 여전히 `apps/web` 소유다.
- **`expo-camera`는 Expo Go에 기본 포함된 모듈이다.** 따라서 체크리스트 3번(`expo-dev-client` 재설치, `eas init`, Dev Build)이 발동하지 않는다 — `apps/mobile/CLAUDE.md`의 "Expo Go와 호환되지 않는 네이티브 모듈이 없다"는 전제가 유지된다.

### config plugin을 추가하지 않는다

`app.json`의 `plugins` 배열에 `expo-camera`를 넣지 않는다. 네이티브 링킹은 `expo-module.config.json` 기반 autolinking으로 이루어지므로 plugin은 불필요하고, 넣으면 두 가지가 오염된다.

- `NSMicrophoneUsageDescription`이 영어 기본 문구로 주입된다 — 마이크는 쓰지 않는다(멀티룸 음성 송출 없음).
- `recordAudioAndroid` 기본값이 `true`라 Android `RECORD_AUDIO` 권한이 추가된다 — 스토어 등재 권한 목록이 늘어난다.

`lib/__tests__/permissionCopy.test.ts`가 `NSCameraUsageDescription` 문구를 문자 단위로, `android.permissions`를 `["CAMERA"]` 정확 일치로 잠그고 있어 이 오염을 자동으로 잡는다. 즉 **이 테스트가 plugin 미추가의 가드로 기능한다.**

iOS 권한 요청에 필요한 것은 `NSCameraUsageDescription` 하나뿐이다(`expo-camera`의 카메라 권한 요청자는 마이크 키를 요구하지 않는다). 그 값은 `app.json`에 이미 있다 — 그래서 `app.json`은 이번 변경에서 **한 글자도 바뀌지 않는다.**

## 결과

- `apps/mobile/package.json`에 `expo-camera: ~17.0.10` 추가. `app.json`은 변경 없음.
- `lib/cameraPermission.ts`의 mock 상태머신과 `setMockCameraPermissionState`/`resetMockCameraPermissionState`가 제거되고, 기본 어댑터가 `expoCameraPermissionAdapter`가 된다. `setCameraPermissionAdapter()`는 테스트용 주입점으로 남는다.
- `expo-camera`의 `PermissionStatus` enum 값(`"granted"`/`"undetermined"`/`"denied"`)이 기존 `CameraPermissionStatus` 유니온과 그대로 일치해 변환 코드가 없다.
- 설정 화면(S6)의 카메라 권한 토글이 실제 OS 상태를 표시한다. 조회 전·조회 실패 상태는 `null`로 두고 토글을 그리지 않는다 — 모르는 값을 `false`로 접으면 허용한 사용자에게 "허용 안 됨"으로 보이기 때문이다.
- 테스트는 `setCameraPermissionAdapter()` 인라인 스텁으로 권한 분기를 재현한다. `jest.mock("expo-camera")`는 어댑터 단위 테스트 한 곳에만 있다.
- 게이트의 fail-closed 성질이 처음으로 실제 의미를 갖는다 — 네이티브 조회가 throw하면 세션을 시작하지 않고 S2-3으로 보낸다.

### 남는 위험

- ~~**WebView 이중 권한 프롬프트 미검증**~~ — **Android는 2026-07-28 해소, iOS는 여전히 미검증.**

  Android 에뮬레이터(Pixel 3 / API 35)에서 확인한 결과 **프롬프트는 한 번만 뜬다.** `expo-camera` 게이트에서 승인하면 그 뒤 WebView 안의 `getUserMedia`는 추가 다이얼로그 없이 카메라를 연다(`CameraService: connect call (… camera ID 1)`) — `react-native-webview`가 앱의 OS 권한을 이어받아 WebView의 요청을 자동 승인하기 때문이다. 실측 근거는 [Vision 파이프라인 설계 §10 "S1·S2 결과 — Android"](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md).

  **iOS는 실기기 확보 후 다시 확인해야 한다.** iOS는 권한 처리 경로가 다르고(라우트가 `mediaCapturePermissionGrantType="grant"`를 명시적으로 준다), 시뮬레이터에는 카메라 하드웨어가 없어 이 검증 자체가 불가능했다. Apple Developer 계정 승인 대기 중이다.

- **카메라 전환이 후면 카메라를 못 볼 수 있다** — Android 에뮬레이터에서 Chromium이 `device 0`(후면)의 특성을 읽지 못한다(`cr_VideoCapture: Unable to retrieve camera characteristics for unknown device 0`). 전면 연결은 정상이므로 프리뷰에는 영향이 없으나, `enumerateDevices`가 후면을 못 보면 전환 버튼이 "전환할 카메라가 없어요"로 떨어진다. AVD 설정 문제일 가능성이 높아 실기기 확인이 필요하다.
- **Android 권한 다이얼로그 3옵션** — "이번만 허용" 만료 시 처리 정책이 미확정이다(Figma `14:5` 페이지가 비어 있음). `canAskAgain`을 쓰게 될 가능성이 있으나 지금 어댑터는 `status`만 본다.
- **S2-3이 막다른 안내로 남아 있다** — `ai-wiki/product/policies.md` §3은 2026-07-26에 "권한 거부 시 수동 타이머 모드 제공"으로 바뀌었고(2026-07-23 "카메라 필수" 결정을 대체), `app-review-checklist.md` 1-1이 이를 스토어 심사 최우선 액션 아이템으로 표시한다. 이번 범위 밖이며 별도 티켓으로 진행한다.
