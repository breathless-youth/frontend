# 로컬 Dev Build 런북 (iOS 시뮬레이터 · Android 에뮬레이터)

`apps/mobile`을 로컬에서 빌드해 시뮬레이터·에뮬레이터에 띄울 때 사용한다. **2026-07-28부터 Expo Go로는 앱이 돌지 않는다** — 로컬 HTTP 서버(`@dr.pogodin/react-native-static-server`)가 Expo Go에 없는 네이티브 모듈이라 Dev Build가 필요하다([ADR 0005](../adr/0005-bundled-web-assets-over-localhost-server.md), [설계 문서 §1](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)).

EAS 클라우드 빌드는 별개다. **iOS 실기기** 빌드만 Apple Developer 계정이 필요하고, 시뮬레이터 빌드(로컬·EAS 둘 다)와 Android 빌드는 계정 없이 된다.

## ⚠️ 환경 변수부터 맞춘다

**이 머신의 기본 셸 환경은 빌드 도구와 맞지 않는다.** 아래를 지정하지 않으면 빌드가 시작조차 못 하고, 실패 메시지가 원인과 동떨어져 보인다. 셸 프로필에 넣거나 빌드 명령 앞에 붙인다.

| 변수              | 값                                                               | 안 하면                                                                                         |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `LANG` · `LC_ALL` | `en_US.UTF-8`                                                    | `pod install`이 `Unicode Normalization not appropriate for ASCII-8BIT`로 즉사 (기본 로케일 `C`) |
| `JAVA_HOME`       | `/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home` | Gradle이 `Unsupported class file major version 69`로 실패 — 기본 `java`가 **25**라 지원 밖이다  |
| `ANDROID_HOME`    | `$HOME/Library/Android/sdk`                                      | Android 빌드가 SDK를 못 찾는다                                                                  |
| `PATH`            | nvm의 node·`/usr/local/bin`·`platform-tools` 포함                | `pnpm`/`pod`/`cmake`/`adb`를 못 찾는다. CocoaPods를 gem으로 새로 깔려는 시도까지 간다           |

```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:/usr/local/bin:$ANDROID_HOME/platform-tools:$PATH"
```

JDK는 17 또는 21이어야 한다(`/usr/libexec/java_home -V`로 목록 확인). Android Studio 번들 JBR(`/Applications/Android Studio.app/Contents/jbr/Contents/Home`)도 17이라 쓸 수 있다.

## 전제

| 도구      | 확인                                                               |
| --------- | ------------------------------------------------------------------ |
| Xcode     | `xcodebuild -version`                                              |
| CocoaPods | `pod --version`                                                    |
| CMake     | `which cmake` — lighttpd를 소스에서 빌드하므로 **반드시 필요하다** |
| Android   | `adb devices` · `emulator -list-avds`                              |

CMake가 Homebrew 경로에만 있으면 Xcode 빌드 스크립트가 못 찾는다. `patches/@dr.pogodin__react-native-static-server.patch`가 podspec에 `/opt/homebrew/bin`·`/usr/local/bin`을 넣어 그 문제를 덮는다 — 패치가 사라지면 CMake를 못 찾는 빌드 실패로 돌아온다.

## 빌드 순서

**웹 산출물 동기화가 먼저다.** 이 단계를 빼먹으면 iOS 빌드가 `error: apps/web 빌드 산출물이 없습니다`로 실패한다 — 조용히 옛 화면이 담긴 앱이 나오는 것보다 낫도록 일부러 실패시킨다.

```bash
# 1. 웹을 빌드해 모바일 asset으로 복사
pnpm --filter web build && pnpm --filter mobile sync-web

# 2. 시뮬레이터에 빌드·설치·실행
cd apps/mobile
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios
```

특정 시뮬레이터를 지정하려면 `--device`에 이름이나 UDID를 준다.

```bash
xcrun simctl list devices available | grep iPhone
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device "iPhone 15 Pro"
```

첫 빌드는 lighttpd·pcre2를 소스에서 컴파일하므로 오래 걸린다. **네이티브 의존성이 바뀌지 않는 한 재빌드는 필요 없다** — 이후 JS 변경은 `pnpm --filter mobile start`로 붙는다.

### Android 에뮬레이터

```bash
emulator -list-avds
nohup emulator -avd <AVD 이름> > /tmp/android-emulator.log 2>&1 &
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done

pnpm --filter web build && pnpm --filter mobile sync-web
cd apps/mobile && pnpm exec expo run:android
```

첫 Android 빌드는 **NDK를 자동으로 내려받는다**(수백 MB). lighttpd를 네이티브로 컴파일하기 때문이며, 한 번만 발생한다. 라이브러리가 `-PreactNativeArchitectures` 필터를 따르지 않고 **4개 ABI 전부** 컴파일해서 첫 빌드가 약 35분 걸린다.

#### ⚠️ Android prebuild 후에는 `app.json` diff를 확인한다

`expo prebuild --platform android`가 `app.json`을 되쓰면서 **`android.permissions`에 `CAMERA`를 중복으로 넣는다.** ADR 0004의 가드 테스트가 잡아주지만(`pnpm --filter mobile test -- permissionCopy`), 모르고 커밋하면 권한 선언이 오염된 채 남는다.

```bash
git diff apps/mobile/app.json   # prebuild 직후 항상 확인
```

`android.package`를 명시해 두면 prebuild가 그 필드를 다시 추가하지는 않는다.

카메라를 확인하려면 호스트 웹캠을 넘겨준다 — 에뮬레이터 기본 전면 카메라는 합성 장면이다.

```bash
emulator -avd <AVD 이름> -camera-front webcam0
```

## web-dist가 앱 안으로 들어가는 경로

`apps/mobile/plugins/withWebDistAssets.js`(config plugin)가 처리한다. Expo CNG라 `ios/`·`android/`는 매 prebuild마다 다시 생성되므로, 라이브러리 README의 수동 Xcode·gradle 설정은 쓸 수 없다.

- **iOS** — Xcode에 `Bundle web-dist assets` 셸 스크립트 빌드 단계를 붙여, 매 빌드에 `assets/web-dist`를 앱 번들 리소스 루트로 복사한다. 런타임의 `resolveAssetsPath("web-dist")`가 보는 자리가 정확히 거기다.
- **Android** — prebuild 때 `android/app/src/main/assets/web-dist`로 복사한다. 안드로이드는 번들 asset을 파일로 열 수 없어(APK 안에 압축돼 있고 파일 경로가 없다) 앱이 첫 세션에서 `copyFileAssets`로 문서 디렉터리에 풀어낸다 — `lib/staticWebAssetServer.ts`의 `ensureAndroidAssetsExtracted`.

  풀린 파일은 **앱을 업데이트해도 지워지지 않으므로**, 그냥 두면 새 앱이 옛 화면을 계속 서빙한다. `scripts/syncWebDist.js`가 남기는 `.build-stamp`(전체 파일의 경로+내용 SHA-256)를 번들 쪽과 비교해, 다르면 통째로 지우고 다시 푼다. 같으면 아무것도 하지 않는다 — 세션 시작은 즉시여야 한다.

### ⚠️ Android: `sync-web` 다음에 **`expo prebuild`를 반드시 돌린다**

위 복사는 **prebuild 시점**에 일어난다(`withDangerousMod`). 그런데 `android/`가 이미 있으면 **`expo run:android`가 prebuild를 건너뛴다.** 그러면 `assets/web-dist`는 최신인데 `android/app/src/main/assets/web-dist`는 옛날 것이고, **에러 없이** 낡은 웹 자산이 담긴 APK가 나온다.

```bash
pnpm --filter web build
pnpm --filter mobile sync-web
npx expo prebuild -p android --no-install   # ← 이 줄이 없으면 조용히 낡은다
pnpm --filter mobile android
```

2026-07-29에 실제로 겪었다. 모델·wasm이 APK에 안 들어가 감지가 통째로 죽었는데, 화면은 정상으로 보이고 서버도 200을 주며 로그에도 아무 에러가 없었다 — 추출된 디렉터리 용량(`run-as … du -sh files/web-dist`)이 40MB가 아니라 388KB인 것으로만 알 수 있었다.

**`sync-web:check`는 이걸 못 잡는다.** 그 검사는 `apps/web/dist → apps/mobile/assets/web-dist` 한 홉만 보고, 그 다음 홉(`→ android/app/src/main/assets`)은 아무도 보지 않는다. `android/`는 생성물이라 gitignore되어 CI에도 안 올라간다.

빌드 후 확인:

```bash
du -sh apps/mobile/android/app/src/main/assets/web-dist   # apps/mobile/assets/web-dist와 같아야 한다
adb shell "run-as com.breathlessyouth.mobile du -sh files/web-dist"  # 세션 진입 후
```

## 경로 공백 패치 두 개 (2026-07-28 이후로는 예방용)

**상위 폴더가 `01_Breathless Youth` → `01_Breathless-Youth`로 바뀌어 공백이 사라졌으므로, 지금은 두 패치 모두 동작에 영향이 없다.** 아래는 왜 생겼는지와, 경로에 공백이 다시 생기면 무엇이 깨지는지의 기록이다.

경로 변수를 인용하지 않는 pod 빌드 스크립트는 공백에서 그대로 쪼개진다. `patches/`의 두 패치가 이를 덮는다.

| 패치                                      | 무엇을 고치나                                              | 안 고치면                                                                     |
| ----------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `@dr.pogodin__react-native-static-server` | `cmake`·`cmake --build`·`cp`의 경로 인용 (+ Homebrew PATH) | `CMake Error: The source directory "/Users/.../01_Breathless" does not exist` |
| `expo-constants@18.0.13`                  | `bash -l -c "$PODS_TARGET_SRCROOT/..."`의 재인용           | `No such file or directory: /Users/.../01_Breathless`                         |

생성된 `ios/Pods/Pods.xcodeproj`의 shellScript 항목을 전부 훑어 확인한 결과, 경로 변수를 인용하지 않는 pod은 **이 둘뿐**이었다. 나머지(React Native, Hermes, ReactNativeDependencies 등)는 제대로 인용한다.

`@dr.pogodin__react-native-static-server` 패치의 **Homebrew PATH 주입 부분은 공백과 무관하게 계속 필요하다** — Xcode 빌드 스크립트가 `cmake`를 못 찾는 문제를 덮는다. 반면 `expo-constants` 패치는 이제 순수하게 예방용이므로, Expo SDK 업그레이드에서 충돌하면 **그냥 떼도 된다.**

### ⚠️ 패치를 고친 뒤에는 `pod install`을 손으로 돌린다

`expo run:ios`는 Podfile·`package.json` 해시만 보고 pod 재설치 여부를 정한다. **패치로 podspec 내용이 바뀐 것은 그 검사에 안 잡히므로**, 옛 스크립트가 들어 있는 Xcode 프로젝트로 그대로 빌드해 같은 에러가 반복된다.

```bash
cd apps/mobile/ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

## 자주 겪는 실패

| 증상                                                   | 원인                       | 조치                                                                          |
| ------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `Unicode Normalization not appropriate for ASCII-8BIT` | 로케일이 `C`               | 위 `LANG` 절                                                                  |
| `error: apps/web 빌드 산출물이 없습니다`               | `sync-web`을 안 돌림       | 빌드 순서 1단계                                                               |
| CMake를 못 찾는 빌드 실패                              | podspec 패치 유실          | `pnpm install`로 패치 재적용 확인                                             |
| 세션 화면이 "세션을 시작하지 못했어요"                 | 서버가 서빙 루트를 못 찾음 | 오류 메시지에 찍힌 경로를 확인 — `sync-web` 후 **재빌드**해야 번들에 반영된다 |

**빌드 명령을 `| tail`로 파이프하지 말 것.** 종료 코드가 `tail`의 것으로 바뀌어 실패한 빌드가 성공처럼 보인다.
