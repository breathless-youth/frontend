# BY-625 릴리즈 빌드에서 `exp+mobile` 스킴 제외 설계

날짜: 2026-09-06. 관련: BY-598, BY-601, ADR 0007.

## 배경

`expo-dev-client` 6.0.21의 config plugin은 `addGeneratedScheme` 기본값 `true`로 `exp+<slug>` 스킴을 iOS Info.plist와 Android 매니페스트에 넣는다. 빌드 종류를 보지 않는다. 우리 앱은 `app.json` `plugins`에 `expo-dev-client`를 적지 않았는데도 자동 적용돼 `ios/FocusMakers/Info.plist`에 `exp+mobile`이 있고, staging·production 릴리즈 빌드도 같은 스킴을 가진다.

BY-601 실기기 검증에서 같은 기기에 STG 릴리즈 빌드가 있으면 `npx expo start --dev-client`의 기본 QR(`exp+mobile://` URL)이 Dev Client 대신 STG를 열었다. 지금은 `--scheme focusmakers-dev`로 우회한다. 사용자 영향은 없고 개발자 QR 불편만 있다.

## 결정

`app.config.ts`에서 `expo-dev-client` 플러그인 옵션을 variant별로 넘긴다. 공식 옵션이고 원인 자리에서 고친다.

검토한 대안:

- `package.json` `start`에 `--scheme focusmakers-dev`를 박는다. 재빌드 없이 QR 불편만 없애고 릴리즈 빌드의 스킴은 남는다. 탈락.
- 커스텀 mod 플러그인으로 Info.plist·매니페스트에서 `exp+mobile`을 지운다. 코드만 늘고 결과가 같다. 탈락.

## 변경

- `apps/mobile/app.config.ts` `buildConfig` 반환 객체에 `plugins: [...(config.plugins ?? []), ["expo-dev-client", { addGeneratedScheme: variant === "development" }]]`를 추가한다. 다른 플러그인 항목은 `app.json`에 그대로 둔다.
- `apps/mobile/lib/__tests__/deepLinkDomains.test.ts`에 variant별 케이스 3개를 더한다. development는 `plugins`의 `expo-dev-client` 항목이 `addGeneratedScheme: true`, staging·production은 `false`인지 단언한다. 설정 함수 단위 테스트라 prebuild 결과가 아닌 `plugins` 배열을 본다.
- `apps/mobile/CLAUDE.md` 딥링크 절에 "`exp+mobile` 스킴은 development variant에만 남긴다"를 한 줄 추가한다. dev 브랜치의 CLAUDE.md에는 `--scheme focusmakers-dev` 우회 서술이 없어 지울 것은 없다.

## 동작 확인

- `npx expo config --type introspect`를 세 variant로 돌려 iOS `CFBundleURLSchemes`와 Android intent-filter에서 `exp+mobile` 유무를 확인한다. 명시 플러그인 옵션이 자동 적용분보다 먼저 먹는지도 이 단계에서 드러난다.
- staging을 EAS로 새로 빌드해 실기기에 설치하고, `npx expo start --dev-client` 기본 QR이 Dev Client를 여는지 확인한다.

## 실패 경로

- introspect에 여전히 `exp+mobile`이 있으면 그 자리에서 보고하고 멈춘다. 대안은 `expo-dev-client` 자동 적용 경로를 확인한 뒤 정한다.

## 하지 않는 것

- `expo-dev-client` 의존성 제거
- `exp+mobile` 외 다른 스킴·App Link 변경
- `package.json` 스크립트 변경
- 운영 빌드 배포
