# BY-743 iOS 스크린타임 스파이크

- Jira: [BY-743](https://breathless-youth.atlassian.net/browse/BY-743) (스토리 BY-740)
- 기획 원본: `.ai/product/screen-time/` (`platform.md` iOS 구성·스파이크, `decisions.md`)
- 상태: 완료(2026-10-14). 결론은 RNDA 조건부 채택

## 목적

지금 앱 구성에서 iOS 스크린타임 API(FamilyControls, ManagedSettings, DeviceActivity)가 실기기에서 동작하는지 확인하고, `react-native-device-activity`(이하 RNDA)를 BY-745 구현에 쓸지 정한다.

- 앱 구성: Expo SDK 57, RN 0.86.3, New Architecture, CNG, `useFrameworks: "dynamic"`, 최소 iOS 16.4, 번들 3환경
- 기기: 개인 iPhone. 설계 때는 iOS 27로 알았지만 실제로는 iOS 26.6.1이었다(결과 절 참고)
- 권한: 배포 권한은 2026-10-13 팀 계정에 배정됐다(BY-742). 스파이크는 로컬 Xcode 개발 빌드로 한다

## 사전 조사 (2026-10-13)

| 항목          | 내용                                                                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNDA          | 0.6.1(2026-02 배포) 이후 갱신 없음. peer는 `expo >=52`, 예제는 Expo 52. SDK 55 이상 검증 보고 없음                                                                                                                                                 |
| 최소 iOS 충돌 | SDK 57 `ExpoModulesCore`는 16.4를 요구하는데 RNDA podspec은 15.0, 함께 쓰는 `@kingstinct/expo-apple-targets`의 `ExtensionStorage`는 15.1이다. 패치가 필요할 것으로 본다(미검증)                                                                    |
| 확장          | config plugin이 `ActivityMonitorExtension`·`ShieldAction`·`ShieldConfiguration` 타깃을 만들고 App Group과 family-controls 권한을 붙인다. 확장 번들 접미사는 `.ActivityMonitorExtension`(README의 `.ActivityMonitor`와 다름). 확장 배포 타깃은 18.0 |
| 열린 이슈     | #95 iOS 26에서 앱 고르기가 개별 앱을 카테고리로 뭉침, #96 잘못된 선택 문자열로 강제 종료 반복, #81 잠금 화면에서 앱 열기 동작 없음(Apple 비지원), #69 권한 요청 시 helper 통신 오류                                                                |
| Apple         | 예약 최소 간격 15분. iOS 26에서 사용량 임계치 알림이 즉시 발동하는 버그(D05로 쓰지 않음), 예약 끝 신호(`intervalDidEnd`)가 오지 않았다는 보고 1건                                                                                                  |
| 대안          | `expo-app-blocker`(반년 된 신생), 로컬 모듈 + `@bacons/apple-targets` 5.0.0(활발하지만 SDK 57 지원은 초안 PR #210)                                                                                                                                 |

## 방식

A안: RNDA를 먼저 넣고 반나절 안에 판단한다.

1. RNDA 0.6.1을 `apps/mobile`에 설치하고 config plugin을 연결한다. App Group은 `group.com.breathlessyouth.mobile.dev`처럼 환경별 접미사를 붙인다.
2. RNDA와 `ExtensionStorage` podspec의 최소 iOS를 16.4로 맞추는 패치를 붙인다. 저장소의 기존 방식(`patches/` + `pnpm.patchedDependencies`)을 따른다.
3. 개발 환경에서만 보이는 RN 시험 화면 `app/dev/screen-time.tsx`를 만든다. 버튼은 권한 요청, 앱 고르기, 잠그기, 풀기, 15분 안전 해제 예약, 상태 보기다.
4. 로컬 Xcode 개발 빌드(`IPHONEOS_DEPLOYMENT_TARGET=16.4`)로 실기기에 설치해 시나리오를 돈다.

### B안으로 넘어가는 기준

- 반나절 안에 빌드가 되지 않는다
- S3(잠그기·풀기)나 S4(강제 종료 뒤 예약 해제)가 라이브러리 문제로 실패한다

넘어가면 `modules/direct-share`와 같은 로컬 Expo 모듈에 `@bacons/apple-targets`로 Monitor 확장 하나만 붙여 S3·S4를 다시 확인한다. S2의 카테고리 뭉침은 화면 표시 문제라 기각 사유로 보지 않고 기록만 한다.

## 시나리오

| #   | 확인할 것              | 통과 기준                                                                                 | 관련 결정 |
| --- | ---------------------- | ----------------------------------------------------------------------------------------- | --------- |
| S1  | 스크린타임 권한 요청   | `.individual` 인가 창이 뜨고, 허용 뒤 상태가 approved로 읽힌다                            | ST-D19    |
| S2  | 앱 고르기              | 고른 앱 수와 카테고리 수가 맞게 읽힌다. 개별 앱이 카테고리로 뭉치면 기록한다              | ST-D18    |
| S3  | 잠그기·풀기            | 고른 앱을 열면 잠금 화면이 뜨고, 풀기 뒤 바로 열린다. 잠금 화면 버튼은 `닫기`만           | ST-D04    |
| S4  | 강제 종료 뒤 예약 해제 | 잠근 상태에서 앱을 강제 종료하면 15분 예약이 끝날 때 잠금이 풀린다. 오차를 잰다           | ST-D13    |
| S5  | 재실행 정리            | S4에서 풀리지 않았거나 예약 전이면, 앱을 다시 열 때 진행 중인 공부가 없으므로 잠금을 푼다 | ST-D12    |
| S6  | 권한 끄기 감지         | 설정에서 스크린타임 권한을 끈 뒤 앱을 열면 상태가 바뀐 것을 알아챈다                      | ST-D20    |
| S7  | 빌드 비용              | 빌드 시간, 붙인 패치 수, 경고를 적는다                                                    | 채택 판단 |

ST-Q17(보호자가 관리하는 청소년 기기)은 해당 기기가 없어 실기기로 확인하지 못한다. 결과에 "실기기 미확인"으로 남기고 Apple 문서로 판단 재료를 정리한다.

## 정한 것

| 항목           | 결정                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| 시험 화면      | RN 네이티브 화면, 개발 환경에서만 노출. 본 구현(BY-745)은 웹 화면 + 브리지로 다시 만든다                           |
| App Group      | 환경별 접미사 `group.com.breathlessyouth.mobile{,.staging,.dev}`                                                   |
| 시험 코드      | 로컬 브랜치 `spike/BY-743-device-activity`에 커밋만 하고 push하지 않는다. 핵심 코드 조각은 이 문서 "결과"에 옮긴다 |
| 문서           | 이 파일 하나에 설계와 결과를 함께 적고 PR로 올린다. 결론은 위키 `platform.md`에 한 줄 반영한다                     |
| 안전 해제 간격 | 시험은 15분(Apple 최소). 12시간은 같은 코드에서 값만 바꾼다                                                        |

## 결과 (2026-10-14)

- 기기: iPhone 13 mini, **iOS 26.6.1**. 설계 때 예상한 iOS 27이 아니었다. iOS 27 동작은 아직 확인하지 못했다
- 빌드: 로컬 Xcode 개발 빌드, 서명 빌드 성공. 처음부터 하면 약 3분, 증분 빌드는 40초 안팎
- 시험 코드: 로컬 브랜치 `spike/BY-743-device-activity`(push 안 함)

### 시나리오

| #                         | 결과 | 관찰                                                                                                                           |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| S1 권한 요청              | 통과 | 인가 창에서 허용하자 상태가 `2`(approved)로 읽혔다                                                                             |
| S2 앱 고르기              | 통과 | 앱 2개와 카테고리 1개를 고르자 `applicationCount 2, categoryCount 1`. 이슈 #95(개별 앱이 카테고리로 뭉침)는 나타나지 않았다    |
| S3 잠그기·풀기            | 통과 | 잠긴 앱을 열면 지정한 제목·부제와 `닫기` 버튼만 있는 잠금 화면이 뜬다. `닫기`를 누르면 홈 화면으로 나간다. 풀기 뒤 바로 열린다 |
| S4 강제 종료 뒤 예약 해제 | 통과 | 예정 10:59:50, 실제로 열린 시각 11:00 무렵(1분 안쪽). 그동안 USB를 빼 두어 Mac·Metro·포메 앱 모두 관여하지 않았다              |
| S5 재실행 정리            | 통과 | 예약 없이 강제 종료하면 잠금이 그대로 남는다. 앱을 다시 열어 `resetBlocks`·`stopMonitoring`을 부르자 바로 풀렸다               |
| S6 권한 끄기 감지         | 통과 | 설정에서 권한을 끄면 iOS가 잠금을 **즉시** 풀었다. 다음 실행 때 상태가 `0`(notDetermined)으로 읽혔다. `1`(denied)이 아니다     |
| S7 빌드 비용              | 기록 | 패치 0개. 확장 3개가 앱 안에 들어가고 본체·확장 모두 Family Controls와 App Group으로 서명됐다                                  |

### 판단: RNDA를 BY-745에 쓴다 (조건부 채택)

- 기각 기준(빌드 실패, S3·S4 실패)에 하나도 걸리지 않았다. 확인한 범위에서는 라이브러리를 직접 다시 만들 이유가 없다.
- 남는 위험은 관리 상태다. 0.6.1 이후 8개월 동안 갱신이 없다. 문제가 생기면 고치는 일을 우리가 떠안을 수 있으니, BY-745에서는 라이브러리 호출을 어댑터 한 파일 뒤에 둬서 나중에 로컬 모듈로 바꿀 수 있게 한다.
- iOS 27 실기기는 확인하지 못했다. 출시 전 QA(BY-748)에서 iOS 27 기기로 S1~S6를 다시 돈다.

### 사전 조사와 달랐던 점

- **최소 iOS 패치가 필요 없었다.** SDK 57 Podfile이 Expo 모듈의 배포 타깃을 직접 올린다(`[Expo] Raised deployment target ... ExtensionStorage, ReactNativeDeviceActivity (iOS=16.4)`).
- **예약 끝 신호(`intervalDidEnd`)는 이 기기에서 제대로 왔다.** 포럼의 미발동 보고는 재현되지 않았다. 그래도 S5의 재실행 정리는 대비책으로 둔다.

### BY-745에 넘길 주의점

1. **App Group은 Apple 사이트에 직접 등록해야 한다.** 명령줄 자동 서명은 App ID와 개발용 Family Controls는 만들지만 App Group은 등록·배정하지 않아, 처음 서명 빌드가 `doesn't match the entitlements file's value for the com.apple.security.application-groups entitlement`로 실패했다. 이번에는 `group.com.breathlessyouth.mobile.dev`를 등록하고 App ID 4개에 배정했다. 스테이징·운영도 같은 절차가 필요하다.
2. **권한 상태는 `approved`인지로만 판단한다.** 설정에서 끈 뒤에는 `denied`가 아니라 `notDetermined`로 돌아온다. "denied면 꺼짐"으로 짜면 D20 감지가 빠진다.
3. **재실행 정리를 앱 시작에 자동으로 붙인다.** 진행 중인 공부가 없으면 `resetBlocks`와 예약 정리를 부른다(D12). 이번에는 버튼으로만 확인했다.
4. **`apps/mobile/targets/`를 어떻게 다룰지 정한다.** config plugin의 `copyToTargetFolder` 기본값 때문에 prebuild마다 확장 소스 사본이 생기고 gitignore 대상이 아니다. 커밋하거나 옵션을 꺼서 생성되지 않게 한다.
5. **plugin이 확장 타깃에 팀 ID를 넘기지 않는다.** `[bacons/apple-targets] ... missing required ios.appleTeamId` 경고가 난다. 명령줄 `DEVELOPMENT_TEAM`이나 EAS 서명이 덮어써서 빌드에는 문제가 없었다.
6. **명령줄 `IPHONEOS_DEPLOYMENT_TARGET=16.4`가 확장의 18.0까지 덮어쓴다.** 컴파일은 됐지만, EAS 빌드에서는 확장이 18.0으로 남는다. 이 경우 iOS 16·17 기기에서 확장이 동작하는지 따로 확인한다.
7. 기존 DEV 앱이 든 derivedData에 서명 없이 빌드한 결과가 남아 있으면, 서명 빌드를 해도 프레임워크가 서명되지 않은 채 설치가 `ApplicationVerificationFailed`로 막혔다. 서명 빌드 전에 `Build/Products`를 지운다.

### ST-Q17 보호자가 관리하는 청소년 기기

실기기로 확인하지 못했다. Apple 문서(`requestAuthorization(for:)`)는 "보호자가 자녀 계정을, 개인은 자기 계정을 인증한다"고만 적고, 가족 공유로 관리되는 자녀 기기에서 `.individual`을 요청할 때의 동작은 밝히지 않는다. 지원 여부는 해당 기기를 구해 확인하기 전까지 "안내 문구만"으로 두는 쪽을 권한다.

### 시험 화면 핵심 코드

```ts
// 잠그기: 잠금 화면 문구를 정하고 고른 앱을 잠근다
RNDA.updateShield(
  { title: "공부 중이에요", subtitle: "공부가 끝나면 다시 열려요", primaryButtonLabel: "닫기" },
  { primary: { behavior: "close" } },
);
RNDA.blockSelection({ activitySelectionId: SELECTION_ID }, "spike");

// 안전 해제: 예약이 끝나면 확장이 고른 앱을 푼다(앱이 꺼져 있어도)
RNDA.configureActions({
  activityName: ACTIVITY,
  callbackName: "intervalDidEnd",
  actions: [{ type: "unblockSelection", familyActivitySelectionId: SELECTION_ID }],
});
await RNDA.startMonitoring(ACTIVITY, releaseSchedule(new Date(), 15), []);

// 재실행 정리
RNDA.resetBlocks("spike-cleanup");
RNDA.stopMonitoring([ACTIVITY]);
```
