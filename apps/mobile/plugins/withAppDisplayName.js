const { AndroidConfig, withInfoPlist, withStringsXml } = require("expo/config-plugins");

/**
 * 설치 후 홈 화면에 보이는 앱 이름을 iOS·Android 양쪽에 적용한다.
 *
 * **`expo.name`을 쓰지 않는 이유**: Expo는 그 값으로 네이티브 프로젝트 이름까지 만든다.
 * `sanitizedName()`이 `[\W_]+`로 거르는데 JS 정규식의 `\w`는 `[A-Za-z0-9_]`라 한글이
 * 통째로 날아간다 — `"포커스 메이커스"`는 `"app"`이 되어 `ios/app`·`app.xcodeproj`·
 * `PRODUCT_NAME=app`으로 프로젝트가 리네임된다. 그래서 `expo.name`은 ASCII(`FocusMakers`)로
 * 두어 프로젝트 구조를 지키고, 사용자에게 보이는 이름만 여기서 덮는다.
 *
 * 값은 `expo.extra.appDisplayName` 한 곳에서만 읽는다 — 플랫폼별로 갈라져 한쪽만 바뀌는
 * 사고를 막는다.
 */
module.exports = function withAppDisplayName(config) {
  const displayName = config.extra?.appDisplayName;
  if (!displayName) {
    throw new Error("app.json의 expo.extra.appDisplayName이 비어 있다 — 앱 이름을 정할 수 없다");
  }

  // iOS: 홈 화면·알림·설정 등 사용자에게 보이는 자리는 CFBundleDisplayName을 쓴다.
  // (CFBundleName은 `$(PRODUCT_NAME)` 그대로 두어 프로젝트 이름과 일치시킨다)
  const withIos = withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleDisplayName = displayName;
    return cfg;
  });

  // Android: 런처 라벨은 strings.xml의 `app_name`이다.
  return withStringsXml(withIos, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: "app_name",
          value: displayName,
          translatable: false,
        }),
      ],
      cfg.modResults,
    );
    return cfg;
  });
};
