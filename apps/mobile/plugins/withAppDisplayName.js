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
 * 값은 `expo.extra.appDisplayName`(한국어)·`appDisplayNameEn`(영어)에서만 읽는다 — 플랫폼별로 갈라져 한쪽만 바뀌는
 * 사고를 막는다. 변형 접미는 `app.config.ts`가 두 값에 붙여 둔다.
 *
 * iOS 기본 이름은 한국어지만 지원 언어마다 InfoPlist.strings가 덮고, 그 밖의 언어는 개발 지역(en) 이름을 본다.
 * Android 기본 이름은 모듈 문구와 같이 영어다.
 * 언어별 이름은 `app.config.ts`의 `locales`가 넣는다(iOS ko·en·ja·zh-Hant, Android values-b+ko).
 */
module.exports = function withAppDisplayName(config) {
  const displayName = config.extra?.appDisplayName;
  if (!displayName) {
    throw new Error("app.json의 expo.extra.appDisplayName이 비어 있다 — 앱 이름을 정할 수 없다");
  }
  const displayNameEn = config.extra?.appDisplayNameEn;
  if (!displayNameEn) {
    throw new Error(
      "app.json의 expo.extra.appDisplayNameEn이 비어 있다 — 영어 앱 이름을 정할 수 없다",
    );
  }

  // iOS: 홈 화면·알림·설정 등 사용자에게 보이는 자리는 CFBundleDisplayName을 쓴다.
  // (CFBundleName은 `$(PRODUCT_NAME)` 그대로 두어 프로젝트 이름과 일치시킨다)
  const withIos = withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleDisplayName = displayName;
    return cfg;
  });

  // Android: 런처 라벨은 strings.xml의 `app_name`이다.
  // 기본 values를 영어로 둬야 한국어·영어가 아닌 기기에서 한국어 이름 대신 영어 이름이 보인다.
  return withStringsXml(withIos, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [
        // translatable="false"인 문자열에 번역이 있으면 Android lint(ExtraTranslation)가 릴리스 빌드를 막을 수 있어 표시를 두지 않는다.
        AndroidConfig.Resources.buildResourceItem({ name: "app_name", value: displayNameEn }),
      ],
      cfg.modResults,
    );
    return cfg;
  });
};
