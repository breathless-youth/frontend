# 0021. 구글 광고 지연 딥링크는 로컬 Expo 모듈로 GA4 SDK 저장값을 읽는다

- Status: Accepted
- Date: 2026-11-04
- Relates to: [구글·메타 광고 유입 경로 설계](../superpowers/specs/2026-11-04-google-meta-install-attribution-design.md), [ADR 0010](./0010-native-firebase-analytics-for-push-targeting.md), [ADR 0017](./0017-android-app-lock-local-module.md)

## 배경

광고 소재별로 들어온 사람이 남는지 비교하려고 사람마다 어느 광고로 들어왔는지를 서버와 Amplitude에 남기기로 했다. 메타 광고는 메타 SDK의 지연 딥링크와 플레이 설치 정보의 암호문으로 광고를 알 수 있다. 구글 앱 설치 광고는 플레이 설치 정보에 `gclid`만 들어오고, 구글 애즈 API는 앱 설치 캠페인의 `gclid`로 광고 그룹을 조회해 주지 않는다.

구글 앱 설치 캠페인은 광고 그룹마다 딥링크를 넣을 수 있고, GA4 for Firebase SDK는 매니페스트 플래그가 켜져 있으면 첫 실행에서 그 딥링크를 받아 SharedPreferences `google.analytics.deferred.deeplink.prefs`의 `deeplink` 키에 저장한다. 이 저장소 이름과 키는 Google Ads 도움말 [측정 SDK에서 지연 딥링크 사용 설정](https://support.google.com/google-ads/answer/12373942)이 예제 코드로 안내하는 값이고, 도움말이 요구하는 최소 버전은 `firebase-analytics` 17.2.0이다. 앱에는 ADR 0010으로 `@react-native-firebase/analytics`가 이미 들어 있지만, RN Firebase에는 이 값을 읽는 API가 없다.

## 결정

- `plugins/withGoogleAdsMeasurement.js`가 AndroidManifest에 `google_analytics_deferred_deep_link_enabled`를 `true`로 넣는다.
- `apps/mobile/modules/google-deferred-link`에 Android 전용 로컬 Expo 모듈 `GoogleDeferredLink`를 두고, 함수 `readDeepLink`가 위 SharedPreferences 값을 읽기만 한다.
- JS는 `requireOptionalNativeModule`로 불러와 iOS, Jest, 모듈이 없는 옛 Dev Client에서는 null로 받는다.
- SDK가 값을 비동기로 받아 오므로 다시 묻는다. 플레이 설치 정보에 `gclid`가 있는 구글 광고 설치는 1초 간격으로 30번까지 기다리고, 나머지 설치는 한 번만 읽어 첫 실행 수집을 늦추지 않는다.
- 기다리는 사이 앱이 꺼져 수집 값을 보관하지 못하면 다음 실행에서 다시 수집한다. SDK가 저장한 값은 남아 있어 그때 읽힌다.
- 읽은 값은 메타와 같은 `focusmakers://?fm_ad=<라벨>` 모양이고, 구글 라벨은 `g_`로 시작한다. 설치 유입 수집이 이 값을 브리지 `install-attribution`의 `googleDeepLinkAd`로 웹에 넘긴다.
- 읽기 결과(found, invalid, empty, error)는 앱 이벤트로 남겨 운영에서 실패 원인을 가린다.
- iOS는 구현하지 않는다. 구글은 iOS에서 광고 식별자를 쓰지 않고 전환을 추정으로 집계해 사람별 광고를 알 수 없다.

## 검토한 대안

- **SharedPreferences 변경 리스너**: Google 도움말은 실행 액티비티에서 리스너를 붙이라고 안내한다. 리스너는 등록 전에 저장된 값을 놓치고, 결국 직접 읽는 경로가 따로 필요해서 다시 묻는 방식 하나로 정했다.
- **GA4 BigQuery 내보내기**: GA4가 사람별 첫 유입 캠페인을 기록하지만, 앱 설치 캠페인의 광고 그룹 이름이 사람별로 남는지 문서로 확인하지 못했고 하루 이틀 늦게 들어온다.
- **MMP(Airbridge·AppsFlyer 등)**: 구글과 메타를 한 번에 처리하지만 비용이 들고, 아이폰은 이 방법으로도 추적을 허용한 사람만 잡힌다.

## 결과

- 실제 구글 광고로 새로 설치해야만 값이 오는지 확인할 수 있다. 개발 빌드는 패키지와 Firebase 프로젝트가 달라 확인할 수 없어서 운영 앱 업데이트로 확인한다.
- 읽기가 실패해도 `null`만 넘어가고 설치 정보와 메타 값 전달은 그대로다.
- 이 업데이트 전에 설치한 사람은 SDK가 딥링크를 받아 두지 않았으므로 광고 그룹 번호를 다시 얻을 수 없다. 그 사람들은 `gclid`로 구글 광고인지까지만 안다.
- 재시도 횟수와 간격은 운영에서 모은 읽기 결과를 보고 고친다.
- 이 결정을 내릴 때 앱은 RN Firebase 26.3.3과 Firebase Android BoM 34.18.0을 썼다.
- Firebase를 올릴 때는 도움말의 저장소 이름과 키가 그대로인지 다시 확인한다.
