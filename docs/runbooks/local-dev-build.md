# 로컬 Dev Build 런북 (iOS 시뮬레이터)

`apps/mobile`을 로컬에서 빌드해 시뮬레이터에 띄울 때 사용한다. **2026-07-28부터 Expo Go로는 앱이 돌지 않는다** — 로컬 HTTP 서버(`@dr.pogodin/react-native-static-server`)가 Expo Go에 없는 네이티브 모듈이라 Dev Build가 필요하다([설계 문서 §1](../superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md)).

EAS 클라우드 빌드는 별개다. **iOS 실기기** 빌드만 Apple Developer 계정이 필요하고, 시뮬레이터 빌드(로컬·EAS 둘 다)와 Android 빌드는 계정 없이 된다.

## 전제

| 도구      | 확인                                                               |
| --------- | ------------------------------------------------------------------ |
| Xcode     | `xcodebuild -version`                                              |
| CocoaPods | `pod --version`                                                    |
| CMake     | `which cmake` — lighttpd를 소스에서 빌드하므로 **반드시 필요하다** |

CMake가 Homebrew 경로에만 있으면 Xcode 빌드 스크립트가 못 찾는다. `patches/@dr.pogodin__react-native-static-server.patch`가 podspec에 `/opt/homebrew/bin`·`/usr/local/bin`을 넣어 그 문제를 덮는다 — 패치가 사라지면 CMake를 못 찾는 빌드 실패로 돌아온다.

## ⚠️ `LANG`을 반드시 UTF-8로 지정한다

이 저장소 경로에는 공백이 들어 있고(`01_Breathless Youth`) 작업 브랜치 이름은 한글이다. 로케일이 `C`인 셸에서 `pod install`을 돌리면 아래처럼 **아무 일도 하기 전에** 죽는다.

```
WARNING: CocoaPods requires your terminal to be using UTF-8 encoding.
Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)
```

`echo $LANG`이 비어 있으면 그 상태다. 빌드 명령마다 앞에 붙이거나 셸 프로필에 넣는다.

```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

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

## web-dist가 앱 안으로 들어가는 경로

`apps/mobile/plugins/withWebDistAssets.js`(config plugin)가 처리한다. Expo CNG라 `ios/`·`android/`는 매 prebuild마다 다시 생성되므로, 라이브러리 README의 수동 Xcode·gradle 설정은 쓸 수 없다.

- **iOS** — Xcode에 `Bundle web-dist assets` 셸 스크립트 빌드 단계를 붙여, 매 빌드에 `assets/web-dist`를 앱 번들 리소스 루트로 복사한다. 런타임의 `resolveAssetsPath("web-dist")`가 보는 자리가 정확히 거기다.
- **Android** — prebuild 때 `android/app/src/main/assets/web-dist`로 복사한다. 안드로이드는 번들 asset을 파일로 열 수 없어 **앱이 문서 디렉터리로 풀어내는 단계가 따로 필요하다**(미구현).

## 자주 겪는 실패

| 증상                                                   | 원인                       | 조치                                                                          |
| ------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------- |
| `Unicode Normalization not appropriate for ASCII-8BIT` | 로케일이 `C`               | 위 `LANG` 절                                                                  |
| `error: apps/web 빌드 산출물이 없습니다`               | `sync-web`을 안 돌림       | 빌드 순서 1단계                                                               |
| CMake를 못 찾는 빌드 실패                              | podspec 패치 유실          | `pnpm install`로 패치 재적용 확인                                             |
| 세션 화면이 "세션을 시작하지 못했어요"                 | 서버가 서빙 루트를 못 찾음 | 오류 메시지에 찍힌 경로를 확인 — `sync-web` 후 **재빌드**해야 번들에 반영된다 |

**빌드 명령을 `| tail`로 파이프하지 말 것.** 종료 코드가 `tail`의 것으로 바뀌어 실패한 빌드가 성공처럼 보인다.
