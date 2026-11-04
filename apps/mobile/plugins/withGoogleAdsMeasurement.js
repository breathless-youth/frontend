const { AndroidConfig, withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

/** Google 광고의 SKAdNetwork 식별자. Google 개발자 문서의 SKAdNetwork 표 첫 줄 값이다. */
const GOOGLE_SKADNETWORK_ID = "cstr6suwn9.skadnetwork";

/**
 * 구글 앱 설치 광고 측정 설정
 *
 * Android는 GA4 SDK가 첫 실행에서 광고 그룹의 지연 딥링크를 받아 오도록 매니페스트 플래그를 켠다.
 * 받아 온 값은 SDK가 SharedPreferences에 저장하고 `modules/google-deferred-link`가 읽는다.
 * iOS는 구글 광고 설치를 SKAdNetwork로 집계하도록 식별자를 더하고, 메타 plugin이 넣은 식별자는 그대로 둔다.
 */
module.exports = function withGoogleAdsMeasurement(config) {
  config = withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      "google_analytics_deferred_deep_link_enabled",
      "true",
    );
    return cfg;
  });

  return withInfoPlist(config, (cfg) => {
    const items = cfg.modResults.SKAdNetworkItems ?? [];
    if (!items.some((item) => item.SKAdNetworkIdentifier === GOOGLE_SKADNETWORK_ID)) {
      items.push({ SKAdNetworkIdentifier: GOOGLE_SKADNETWORK_ID });
    }
    cfg.modResults.SKAdNetworkItems = items;
    return cfg;
  });
};
