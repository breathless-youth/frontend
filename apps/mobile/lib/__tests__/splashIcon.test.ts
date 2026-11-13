import { readFileSync } from "node:fs";
import path from "node:path";

// pngjs는 @expo/image-utils가 끌어와 루트에 올라와 있고 타입 패키지가 없어 쓰는 모양만 적는다.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 타입 선언이 없는 모듈이라 import로는 typecheck가 깨진다.
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
};

const mobileRoot = path.join(__dirname, "../..");
const ICONS = ["splash-icon", "splash-icon-dark", "splash-icon-ko", "splash-icon-ko-dark"];
const OPAQUE_ALPHA = 16;

function splashImageWidth(): number {
  const appJson = JSON.parse(readFileSync(path.join(mobileRoot, "app.json"), "utf-8")) as {
    expo: { plugins: unknown[] };
  };
  const entry = appJson.expo.plugins.find(
    (plugin): plugin is [string, { imageWidth: number }] =>
      Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  );
  if (!entry) {
    throw new Error("app.json에 expo-splash-screen 설정이 없다");
  }
  return entry[1].imageWidth;
}

/**
 * Android 12 이상 스플래시 아이콘이 잘리지 않는 반지름(px)
 *
 * expo-splash-screen은 이미지를 imageWidth dp로 줄여 288dp 캔버스 가운데에 두고, 시스템은 그 가운데 지름 192dp 원만 보여 준다.
 * 그래서 원본 1px은 imageWidth / 원본 폭 dp이고, 원 반지름 96dp를 원본 px로 바꾼 값이 허용 범위다.
 */
function maskRadiusPx(sourceWidth: number): number {
  return 96 * (sourceWidth / splashImageWidth());
}

describe.each(ICONS)("스플래시 아이콘 %s", (name) => {
  const png = PNG.sync.read(readFileSync(path.join(mobileRoot, "assets", `${name}.png`)));
  const alphaAt = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3];

  it("1024×1024이고 네 귀퉁이가 투명하다", () => {
    expect([png.width, png.height]).toEqual([1024, 1024]);
    const last = png.width - 1;
    expect([alphaAt(0, 0), alphaAt(last, 0), alphaAt(0, last), alphaAt(last, last)]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("보이는 픽셀이 모두 Android 원형 마스크 안에 있다", () => {
    const radius = maskRadiusPx(png.width);
    const outside: [number, number][] = [];
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const distance = Math.hypot(x + 0.5 - png.width / 2, y + 0.5 - png.height / 2);
        if (alphaAt(x, y) >= OPAQUE_ALPHA && distance > radius) {
          outside.push([x, y]);
        }
      }
    }
    expect(outside.slice(0, 5)).toEqual([]);
  });

  // 위는 마스코트, 아래는 워드마크라 보이는 줄이 빈 줄을 사이에 두고 두 묶음으로 나뉜다.
  it("위쪽 마스코트와 아래쪽 워드마크가 떨어져 있다", () => {
    const bands: { top: number; bottom: number }[] = [];
    for (let y = 0; y < png.height; y++) {
      let visible = false;
      for (let x = 0; x < png.width && !visible; x++) {
        visible = alphaAt(x, y) >= OPAQUE_ALPHA;
      }
      const current = bands.at(-1);
      if (visible && current?.bottom === y - 1) {
        current.bottom = y;
      } else if (visible) {
        bands.push({ top: y, bottom: y });
      }
    }

    expect(bands).toHaveLength(2);
    const [mascot, wordmark] = bands;
    expect(mascot.bottom - mascot.top).toBeGreaterThan(wordmark.bottom - wordmark.top);
  });
});
