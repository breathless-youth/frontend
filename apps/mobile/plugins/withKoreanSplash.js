const fs = require("fs");
const path = require("path");

const { IOSConfig, withFinalizedMod } = require("expo/config-plugins");

// expo-splash-screen과 같은 방식으로 크기를 맞추려고 그 패키지가 쓰는 이미지 도구를 빌린다.
const { compositeImagesAsync, generateImageAsync, generateImageBackgroundAsync } = require(
  require.resolve("@expo/image-utils", {
    paths: [path.dirname(require.resolve("expo-splash-screen/package.json"))],
  }),
);

const CACHE_TYPE = "splash-ko";
const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const IOS_SCALES = [
  { scale: "1x", ratio: 1, suffix: "" },
  { scale: "2x", ratio: 2, suffix: "@2x" },
  { scale: "3x", ratio: 3, suffix: "@3x" },
];
const DARK_APPEARANCES = [{ appearance: "luminosity", value: "dark" }];

/**
 * 한국어 기기에서만 스플래시 워드마크를 한글로 바꾼다.
 *
 * expo-splash-screen은 이미지를 하나만 받아서, 기본(영어) 이미지는 그 플러그인이 만들고
 * 여기서는 같은 크기의 한국어 리소스를 옆에 더한다. 언어 선택은 OS가 한다.
 * - iOS: `SplashScreenLogo.imageset`에 `locale: ko` 항목
 * - Android: `drawable-b+ko-*`, `drawable-b+ko-night-*`(앱 이름의 `values-b+ko`, expo-localization의
 *   `resourceConfigurations`와 같은 한정자)
 *
 * expo-splash-screen이 Contents.json과 drawable을 다시 쓰므로, plugins 순서와 상관없이
 * 그 뒤에 돌도록 finalized 단계에서 실행한다.
 */
module.exports = function withKoreanSplash(config, { image, darkImage }) {
  const splashEntry = (config.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  );
  const imageWidth = splashEntry?.[1]?.imageWidth;
  if (!image || !darkImage || !imageWidth) {
    throw new Error(
      "withKoreanSplash: image·darkImage와 expo-splash-screen의 imageWidth가 필요하다",
    );
  }

  config = withFinalizedMod(config, [
    "ios",
    async (cfg) => {
      const { projectRoot } = cfg.modRequest;
      const imagesetDir = path.join(
        IOSConfig.Paths.getSourceRoot(projectRoot),
        "Images.xcassets/SplashScreenLogo.imageset",
      );
      const contentsPath = path.join(imagesetDir, "Contents.json");
      const contents = JSON.parse(await fs.promises.readFile(contentsPath, "utf8"));
      contents.images = contents.images.filter((entry) => entry.locale !== "ko");

      for (const [src, fileName, appearances] of [
        [image, "ko_image", undefined],
        [darkImage, "ko_dark_image", DARK_APPEARANCES],
      ]) {
        for (const { scale, ratio, suffix } of IOS_SCALES) {
          const size = imageWidth * ratio;
          const { source } = await generateImageAsync(
            { projectRoot, cacheType: CACHE_TYPE },
            { src, width: size, height: size },
          );
          const filename = `${fileName}${suffix}.png`;
          await fs.promises.writeFile(path.join(imagesetDir, filename), source);
          contents.images.push({
            idiom: "universal",
            ...(appearances && { appearances }),
            locale: "ko",
            scale,
            filename,
          });
        }
      }
      await fs.promises.writeFile(contentsPath, JSON.stringify(contents, null, 2));
      return cfg;
    },
  ]);

  return withFinalizedMod(config, [
    "android",
    async (cfg) => {
      const { projectRoot } = cfg.modRequest;
      const resDir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res");

      // 아래 합성은 expo-splash-screen의 withAndroidSplashImages와 같은 값이다(288 캔버스 가운데 배치).
      for (const [src, night] of [
        [image, ""],
        [darkImage, "-night"],
      ]) {
        for (const [density, multiplier] of Object.entries(ANDROID_DENSITIES)) {
          const size = imageWidth * multiplier;
          const canvasSize = 288 * multiplier;
          const background = await generateImageBackgroundAsync({
            width: canvasSize,
            height: canvasSize,
            backgroundColor: "transparent",
            resizeMode: "cover",
          });
          const { source: foreground } = await generateImageAsync(
            { projectRoot, cacheType: CACHE_TYPE },
            { src, resizeMode: "contain", width: size, height: size },
          );
          const composed = await compositeImagesAsync({
            background,
            foreground,
            x: (canvasSize - size) / 2,
            y: (canvasSize - size) / 2,
          });
          const dir = path.join(resDir, `drawable-b+ko${night}-${density}`);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, "splashscreen_logo.png"), composed);
        }
      }
      return cfg;
    },
  ]);
};
