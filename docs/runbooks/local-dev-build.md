# 로컬 Dev Build 런북 (iOS 시뮬레이터 · Android 에뮬레이터)

`apps/mobile`을 로컬에서 빌드해 시뮬레이터·에뮬레이터에 띄울 때 사용한다. **2026-07-28부터 Expo Go로는 앱이 돌지 않는다** — 로컬 HTTP 서버(`@dr.pogodin/react-native-static-server`)가 Expo Go에 없는 네이티브 모듈이라 Dev Build가 필요하다([설계 문서 §1](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)).

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

첫 Android 빌드는 **NDK를 자동으로 내려받는다**(수백 MB). lighttpd를 네이티브로 컴파일하기 때문이며, 한 번만 발생한다.

카메라를 확인하려면 호스트 웹캠을 넘겨준다 — 에뮬레이터 기본 전면 카메라는 합성 장면이다.

```bash
emulator -avd <AVD 이름> -camera-front webcam0
```

## web-dist가 앱 안으로 들어가는 경로

`apps/mobile/plugins/withWebDistAssets.js`(config plugin)가 처리한다. Expo CNG라 `ios/`·`android/`는 매 prebuild마다 다시 생성되므로, 라이브러리 README의 수동 Xcode·gradle 설정은 쓸 수 없다.

- **iOS** — Xcode에 `Bundle web-dist assets` 셸 스크립트 빌드 단계를 붙여, 매 빌드에 `assets/web-dist`를 앱 번들 리소스 루트로 복사한다. 런타임의 `resolveAssetsPath("web-dist")`가 보는 자리가 정확히 거기다.
- **Android** — prebuild 때 `android/app/src/main/assets/web-dist`로 복사한다. 안드로이드는 번들 asset을 파일로 열 수 없어 **앱이 문서 디렉터리로 풀어내는 단계가 따로 필요하다**(미구현).

## 경로에 공백이 있어서 필요한 패치 두 개

저장소 경로에 `01_Breathless Youth`의 공백이 있어, 경로 변수를 인용하지 않는 pod 빌드 스크립트가 그 자리에서 쪼개진다. `patches/`의 두 패치가 이를 덮는다.

| 패치                                      | 무엇을 고치나                                              | 안 고치면                                                                     |
| ----------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `@dr.pogodin__react-native-static-server` | `cmake`·`cmake --build`·`cp`의 경로 인용 (+ Homebrew PATH) | `CMake Error: The source directory "/Users/.../01_Breathless" does not exist` |
| `expo-constants@18.0.13`                  | `bash -l -c "$PODS_TARGET_SRCROOT/..."`의 재인용           | `No such file or directory: /Users/.../01_Breathless`                         |

생성된 `ios/Pods/Pods.xcodeproj`의 shellScript 항목을 전부 훑어 확인한 결과, 경로 변수를 인용하지 않는 pod은 **이 둘뿐**이다. 나머지(React Native, Hermes, ReactNativeDependencies 등)는 제대로 인용한다. 새 네이티브 라이브러리를 추가했는데 `01_Breathless`에서 잘린 경로가 보이면 같은 패턴을 의심할 것.

영구적인 해법은 상위 폴더명에서 공백을 빼는 것이다. Expo SDK를 올릴 때 이 패치들이 깨지면 그때 다시 판단한다.

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
