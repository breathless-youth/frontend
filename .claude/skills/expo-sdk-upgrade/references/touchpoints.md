# Expo SDK 54 → 57 변경 지점 목록

2026-10-01 dev(`dc78b1c9`) 기준으로 확인한 목록이다. 행 번호는 그 시점 값이라 어긋날 수 있으니, 고치기 전에 같은 줄의 문자열로 다시 찾는다.

## 목차

1. 버전 표 (BY-803)
2. 패치 3개 (BY-804)
3. 코드·테스트 (BY-805)
4. 설정·문서 (BY-806)
5. 바꾸지 않는 것
6. 로컬 Dev Client 빌드 절차 (런북 보강 원천)

---

## 1. 버전 표 (BY-803)

목표 번호는 expo의 sdk-57 `bundledNativeModules.json`과 exp.host 버전 API에서 확인했다. SDK 55부터 Expo 패키지는 전부 57.x 번호를 쓴다.

### apps/mobile/package.json

| 패키지 | 현재 | 목표 | 비고 |
|---|---|---|---|
| `expo` | `~54.0.36` | `~57.0.26` | `57.0.9` 미만은 Hermes V1 메모리 회귀가 있어 쓰지 않는다 |
| `react-native` | `0.81.5` | `0.86.3` | |
| `react`, `react-dom` | `19.1.0` | `19.2.3` | |
| `react-test-renderer` | `19.1.0` | `19.2.3` | Expo 목록에는 없지만 `react`와 번호가 같아야 렌더러가 뜬다 |
| `expo-router` | `~6.0.24` | `~57.0.24` | 57부터 react-navigation에 의존하지 않는다 |
| `react-native-reanimated` | `~4.1.7` | `4.5.1` | worklets와 짝으로 올린다 |
| `react-native-worklets` | `0.5.1` | `0.10.1` | |
| `react-native-screens` | `4.16.0` | `~4.26.0` | |
| `react-native-safe-area-context` | `~5.6.2` | `~5.7.0` | |
| `react-native-webview` | `13.15.0` | `13.16.1` | 패치 재타깃 필요, 2절 |
| `react-native-svg` | `15.12.1` | `15.15.4` | |
| `@sentry/react-native` | `~7.2.0` | `~7.11.0` | `@sentry/react-native/expo`·`/metro` 진입점이 살아 있는지 확인 |
| `@expo/metro-runtime` | `~6.1.2` | `~57.0.16` | |
| `expo-blur` `expo-camera` `expo-font` `expo-constants` `expo-dev-client` `expo-splash-screen` `expo-build-properties` `expo-secure-store` `expo-sensors` `expo-linking` `expo-application` `expo-crypto` `expo-status-bar` `expo-tracking-transparency` `expo-screen-orientation` | 각 54 계열 | `~57.x` | 정확한 번호는 `expo install --fix`가 정한다 |
| `expo-haptics` | 없음 | `~57.x` | PR #179(BY-697)가 dev에 들어온 뒤에만 생긴다 |
| `jest-expo` | `~54.0.17` | `~57.0.5` | BY-805 범위지만 `--fix`가 함께 올린다 |
| `babel-preset-expo`, `eslint-config-expo` | `~54.0.12`, `~10.0.0` | `--fix` 결과 | 목표 번호는 확인하지 못했다 |
| `typescript` | `~5.9.3` | `~6.0.3` | Expo 권장값 |
| `react-native-css-interop` | `0.2.6` | `0.2.7` | NativeWind v4 유지 |
| `nativewind` | `^4.2.1` | `^4.2.x` 유지 | v5로 가지 않는다 |
| `tailwindcss` | `^3.4.17` | 유지 | NativeWind v4는 Tailwind 3을 쓴다 |
| `react-native-web` | `^0.21.2` | 유지 | `~0.21.0` 범위를 이미 만족한다 |
| `@types/react` | `~19.2.17` | 유지 | 권장 `~19.2.4` 범위를 이미 만족한다 |
| `@react-native-firebase/*` 4개 | `^26.3.3` | 해석 버전 `26.3.3` 유지 | lockfile이 26.4.x로 바뀌면 messaging 패치 키가 어긋난다 |
| `react-native-fbsdk-next` | `13.4.3` | 유지 | `metaSdkConfig.test.ts`가 정확한 값을 고정한다 |

### 저장소의 다른 package.json

| 위치 | 현재 | 목표 | 비고 |
|---|---|---|---|
| `apps/web/package.json`의 `react`, `react-dom` | `19.1.0` | `19.2.3` | hoisted 설치에서 React 사본을 하나로 유지하기 위해서다 |
| `apps/web/package.json`의 `typescript` | `~6.0.2` | 유지 | |
| 루트·`packages/*`의 `typescript` | `^5.9.3` | 유지 | 패키지마다 자기 `tsc`를 쓴다 |

### 설치 환경

- Node 24(`.nvmrc`), pnpm 10.28.2(`packageManager`), `.npmrc`의 `node-linker=hoisted`다.
- 루트 `package.json`에는 `pnpm` 필드가 없고 없어야 한다(`webviewPatch.test.ts`가 확인한다). pnpm 설정은 `pnpm-workspace.yaml`에만 있다.
- `pnpm-workspace.yaml`의 `onlyBuiltDependencies`(`@sentry/cli`, `esbuild`, `unrs-resolver`)는 바꾸지 않는다. 새 패키지가 빌드 스크립트 허용을 요구하면 보고서에 적고 사용자에게 묻는다.

---

## 2. 패치 3개 (BY-804)

담당은 `native-patch-maintainer`다. 절차는 `pnpm-patch-retarget` 스킬에 있다.

| 패치 파일 | 키 | 결정 | 근거 |
|---|---|---|---|
| `react-native-webview@13.15.0.patch` | `react-native-webview@13.15.0` | 13.16.1로 재타깃 | 13.15.0 → 13.16.1 변경은 Android `setIgnoreErrFailedForThisURL` 되돌림, iOS 인라인 CPP 연산자(중복 심볼), iOS nil `NSString` → `std::string` SIGABRT 수정뿐이다. Fabric 배경색 전달과 앞으로가기 제스처 차단은 업스트림에 없다 |
| `@react-native-firebase__messaging@26.3.3.patch` | `@react-native-firebase/messaging@26.3.3` | 변경 없음 | 26.4.0(2026-09-05) 변경 기록에 main-queue `methodQueue` 복원이나 `getToken`의 APNs 토큰 판정 변경이 없다. RN 0.86에서 빌드가 깨질 때만 다시 본다 |
| `expo-constants@18.0.13.patch` | `expo-constants@18.0.13` | 57.x로 재타깃, 충돌하면 제거 | 경로 공백 대비용 예방 패치다. 런북이 충돌 시 떼도 된다고 적어 두었다 |

### 패치 이름을 참조하는 곳 (패치 담당이 함께 고친다)

- `pnpm-workspace.yaml`의 `patchedDependencies` 키와 값
- `apps/mobile/lib/__tests__/webviewPatch.test.ts`의 `PATCHES` 맵과 `PATCHES["react-native-webview@13.15.0"]` 조회 3곳(81·90·103행 부근)
- `apps/mobile/CLAUDE.md` 57행 부근 "웹뷰 배경" 절의 패치 파일명
- `apps/mobile/components/RemoteWebViewHost.tsx` 171행 부근 주석의 패치 파일명
- `apps/mobile/components/RemoteWebViewHost.tsx` 435행 부근과 `components/__tests__/RemoteWebViewHost.test.tsx` 385행 부근 주석의 "13.15.0 iOS History API shim" 서술 (13.16.1에서 shim 동작이 같은지 업스트림 diff로 확인한 뒤 번호만 바꾼다)
- `docs/runbooks/local-dev-build.md`의 "경로 공백 패치 두 개" 절(126행 부근부터) 표와 본문

---

## 3. 코드·테스트 (BY-805)

`@react-navigation/native`는 선언된 의존성이 아니고 `useIsFocused` 하나만 쓴다. expo-router 57.0.24는 루트에서 `useIsFocused`를 내보낸다(`build/exports.d.ts`, 2026-10-01 확인). 그래서 import와 mock 대상을 둘 다 `expo-router`로 바꾼다.

### 소스 5개

`import { useIsFocused } from "@react-navigation/native";` → `expo-router`에서 가져온다. 파일에 이미 `expo-router` import가 있으면 한 줄로 합친다.

- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/records.tsx`
- `apps/mobile/app/(tabs)/settings.tsx`
- `apps/mobile/app/(tabs)/social.tsx`

### 테스트 6개

현재 형태가 둘로 갈린다. 형태마다 바꾸는 방법이 다르다.

| 파일 | 지금 | 바꾸는 방법 |
|---|---|---|
| `__tests__/home.test.tsx` | `@react-navigation/native`를 `requireActual` + `useIsFocused: () => true`로 mock | `expo-router` mock으로 바꾼다. 이 파일에 `expo-router` mock이 없으면 `requireActual("expo-router")` 위에 `useIsFocused`만 덮는다 |
| `__tests__/records.test.tsx` | 같음 | 같음 |
| `__tests__/settings.test.tsx` | 같음 | 같음 |
| `__tests__/social-unfocused.test.tsx` | 같음, 값은 `false` | 같음, `false` 유지 |
| `__tests__/social.test.tsx` | `expo-router`를 통째로 mock(`useLocalSearchParams`만) + `@react-navigation/native` 별도 mock | 기존 `expo-router` factory에 `useIsFocused: () => true`를 더하고 `@react-navigation/native` mock은 지운다 |
| `__tests__/tabs-layout.test.tsx` | `expo-router`를 통째로 mock(`Tabs`만 반환) + `@react-navigation/native`를 `requireActual` 없이 통째로 mock | 기존 factory의 반환값에 `useIsFocused: () => true`를 더하고 `@react-navigation/native` mock은 지운다 |

통째 mock factory에 `useIsFocused`를 빠뜨리면 `useIsFocused is not a function`으로 렌더가 실패한다. `requireActual("expo-router")`가 무겁거나 실패하면 그 파일만 통째 mock으로 바꾸고 보고서에 적는다.

### 확인

- `git grep -n "@react-navigation" -- apps/mobile ':!**/node_modules/**'` 결과가 비어야 한다.
- `jest-expo`가 `~57.x`인지 확인하고 `pnpm --filter mobile test`를 돌린다.

---

## 4. 설정·문서 (BY-806)

### eas.json과 고정 테스트

- `apps/mobile/eas.json`의 네 프로필(development, development-simulator, staging, production)에서 `ios.image: "macos-sequoia-15.6-xcode-26.2"`를 지운다. `ios` 객체에 다른 키가 없으면 객체째 지우고, `development-simulator`는 `simulator: true`가 남는다.
- 지우기 전에 https://docs.expo.dev/build-reference/infrastructure/ 에서 SDK 57 기본 iOS 이미지의 Xcode 번호를 확인한다. 26.2 이상이 아니면 고정을 되살리고 보고서에 근거를 적는다. Firebase 12.12 이상이 Xcode 26.2를 요구한다.
- `apps/mobile/lib/__tests__/firebaseConfig.test.ts` 368~376행 부근의 "모든 프로필이 Xcode 26.2 빌드 이미지를 쓴다" 테스트를 새 의도에 맞춘다. 고정을 지웠으면 "어떤 프로필도 `ios.image`를 고정하지 않는다"로 바꾸고 주석에 기본 이미지 근거를 적는다. 17행 부근 파일 머리 주석의 "Xcode 26.2 빌드 이미지" 서술도 맞춘다.
- `eas.json`에는 `node` 필드가 없다. 추가하지 않는다.

### app.config.ts와 app.json

- 바꿀 것이 없을 것으로 본다. `app.json`에는 `sdkVersion`·`newArchEnabled`·`experiments`가 원래 없다.
- `APP_VARIANT=staging pnpm --filter mobile exec expo config --type public`이 plugin 옵션 오류 없이 끝나는지 확인한다. `app.config.ts`가 붙이는 `["expo-dev-client", { addGeneratedScheme }]`와 Meta plugin 옵션이 57에서도 받아들여지는지 보는 확인이다. staging을 쓰는 이유는 주소가 상수라 로컬 env 없이도 평가되기 때문이다.
- 고쳐야 하면 `resolveAppVariant`, `guardDevBaseUrl`, `guardFirebaseFile`, `resolveMetaSdk` 가드는 손대지 않고 plugin 옵션만 고친다.

### 버전 고정 테스트

- `apps/mobile/lib/__tests__/metaSdkConfig.test.ts` 170행 부근 "expo-tracking-transparency는 SDK 54 번들 버전 범위다"를 SDK 57 번호와 테스트 이름으로 바꾼다.

### 문서

| 파일 | 위치 | 바꾸는 내용 |
|---|---|---|
| `apps/mobile/CLAUDE.md` | 93행 부근 | "Expo SDK 54 고정이다(의도적)…" 문장을 SDK 57 기준으로 다시 쓰고 참조 링크를 `https://docs.expo.dev/versions/v57.0.0/`으로 바꾼다. "업그레이드 제안 금지" 취지는 SDK 58 베타 기준으로 남길지 사용자에게 확인한다 |
| `README.md`, `README.en.md` | 42~43행 | `Expo SDK 54, React Native 0.81` → `Expo SDK 57, React Native 0.86`, `Expo Router 6` → `Expo Router 57` |
| `docs/runbooks/expo-go-connection.md` | 35행 | "Expo Go 54 계열과 맞추기 위해 SDK 54" 서술을 고친다. 이 런북은 이미 "Expo Go로 뜨지 않는다" 머리말이 있으니 기록 성격만 남긴다 |
| `docs/runbooks/expo-go-connection.md` | 51행 | `exposdk:54.0.0`, `54.0.0` → 57 |
| `docs/runbooks/expo-go-connection.md` | 68행 | 잘못된 예시 `exposdk:57.0.0`을 프로젝트와 다른 SDK 번호(예: 54)로 바꾼다 |
| `docs/runbooks/local-dev-build.md` | 43행 | 이미 삭제된 `@dr.pogodin__react-native-static-server.patch`를 근거로 든 문장을 고친다 |
| `docs/runbooks/local-dev-build.md` | 새 절 | 6절의 로컬 Dev Client 실기기 빌드 절차를 배포 타깃 16.4로 적는다 |

`local-dev-build.md`의 "경로 공백 패치" 절은 패치 담당 몫이다. 같은 파일을 두 에이전트가 고치므로 둘 다 Edit로 자기 절만 바꾼다.

---

## 5. 바꾸지 않는 것

고치면 빌드가 깨지거나 이벤트가 사라지는 항목이다. 대부분 테스트가 지키지만, 테스트가 없는 항목은 QA가 diff로 확인한다.

| 항목 | 위치 | 지키는 장치 |
|---|---|---|
| `forceStaticLinking: ["react-native-fbsdk-next"]`, `useFrameworks: "dynamic"` | `app.json`의 `expo-build-properties` | `metaSdkConfig.test.ts` |
| `getSentryExpoConfig`를 `withNativeWind`로 감싼 구성 | `metro.config.js` | 테스트 없음, diff 확인 |
| `babel-preset-expo`(`jsxImportSource: "nativewind"`) + `nativewind/babel` | `babel.config.js` | 테스트 없음, diff 확인 |
| `expo.autolinking.exclude`를 두지 않음 | `apps/mobile/package.json` | `firebaseConfig.test.ts` |
| Firebase Analytics 링크, `screen_view` 자동 보고 끔 | `package.json`, `firebase.json` | `firebaseConfig.test.ts` |
| `main: "index.ts"` | `apps/mobile/package.json` | 테스트 없음, diff 확인 |
| `resolveAppVariant`, `guardDevBaseUrl`, `guardFirebaseFile`, `resolveMetaSdk` throw 가드 | `app.config.ts` | `appConfigVariant.test.ts` 등 |
| `expo-dev-client`의 `addGeneratedScheme`은 development만 | `app.config.ts` | `deepLinkDomains.test.ts` |
| `orientation: "default"` | `app.json` | 화면 방향 정책, `apps/mobile/CLAUDE.md` |
| `predictiveBackGestureEnabled: false` | `app.json` | 테스트 없음, diff 확인 |
| `jest.config.js`의 pretendard `.otf` 스텁 매핑 | `jest.config.js` | 테스트 없음, diff 확인 |
| CI 단계 | `.github/workflows/ci.yml` | 이 티켓에서 `expo-doctor` 단계를 추가하지 않는다 |

OSS `expo-upgrade` 스킬의 Housekeeping 제안(React Compiler 켜기, `babel.config.js`·`metro.config.js` 삭제, `expo-constants` 제거 등)은 빌드에 꼭 필요할 때만 따른다. 이 저장소의 babel·metro 설정은 기본값이 아니라 지울 대상도 아니다. `app.json`에는 `sdkVersion`, `newArchEnabled`, `experiments`가 원래 없다.

---

## 6. 로컬 Dev Client 빌드 절차 (런북 보강 원천)

2026-09-29 실기기 검증에서 통한 순서다. 런북에 적을 때 SDK 57 최소 iOS인 16.4로 배포 타깃을 바꾼다. Xcode 27은 배포 타깃 15.0 미만 Pod을 거부해서 명령줄로 덮어썼다. EAS 이미지는 이 덮어쓰기가 필요 없다.

### iOS

```bash
cd apps/mobile
APP_VARIANT=development CI=1 npx expo prebuild --platform ios --no-install
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
xcodebuild -workspace FocusMakers.xcworkspace -scheme FocusMakers -configuration Debug \
  -destination id=<UDID> -derivedDataPath <스크래치 경로> \
  DEVELOPMENT_TEAM=<팀 ID> CODE_SIGN_STYLE=Automatic IPHONEOS_DEPLOYMENT_TARGET=16.4 \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> <빌드된 .app 경로>
```

- USB 연결과 잠금 해제가 필요하다.
- 처음 실행할 때 로컬 네트워크 허용 팝업을 눌러야 Metro에 붙는다.
- development 빌드에도 `GOOGLE_SERVICES_JSON`·`GOOGLE_SERVICES_PLIST`가 필요하다. 파일 패키지 이름이 `.dev`와 맞는지 확인한다.

### Android

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd apps/mobile
APP_VARIANT=development CI=1 npx expo prebuild --platform android --no-install
cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- 예전 EAS DEV 앱과 서명 키가 다르면 덮어쓰기가 안 된다. 그때는 `adb uninstall com.breathlessyouth.mobile.dev`가 필요하고 앱 데이터가 지워지므로 사용자 확인을 받는다.
- 새 네이티브 모듈이 들어간 JS를 옛 바이너리로 열면 `Cannot find native module`이 난다. SDK를 올렸으니 두 플랫폼 모두 새로 빌드한다.
