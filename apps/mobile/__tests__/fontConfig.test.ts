/**
 * 셀프 호스팅 NanumSquareRound 적용.
 *
 * NativeWind의 `font-sans`·`font-sans-bold`가 커스텀 폰트 패밀리로 풀리는지 tailwind
 * 설정으로 고정한다. 값 자체(어떤 파일을 로드하는지)는 `app/_layout.tsx`의 useFonts가
 * 굵기별 키로 담당하고, 여기서는 클래스가 그 이름으로 매핑되는 계약만 본다.
 */
describe("tailwind.config.js 폰트 설정", () => {
  it("fontFamily.sans는 NanumSquareRound, sans-bold는 NanumSquareRoundBold로 매핑된다", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tailwindConfig = require("../tailwind.config.js") as {
      theme: { extend: { fontFamily?: Record<string, string[]> } };
    };
    const fam = tailwindConfig.theme.extend.fontFamily;
    expect(fam?.sans).toContain("NanumSquareRound");
    expect(fam?.["sans-bold"]).toContain("NanumSquareRoundBold");
  });
});
