import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// segmenter는 apps/web/src/lib/graphemes.ts 모듈 스코프에서 한 번만 평가되므로,
// Intl.Segmenter를 없앤 뒤 모듈 캐시를 비우고 동적 import로 다시 불러야
// 이번 테스트의 Intl 스텁이 반영된 상태로 그래핌 계산이 초기화된다.
describe("Intl.Segmenter가 없는 환경", () => {
  beforeEach(() => {
    const { Segmenter: _removed, ...rest } = Intl as typeof Intl & {
      Segmenter?: unknown;
    };
    vi.stubGlobal("Intl", rest);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("글자 단위를 셀 수 없다고 알리고 코드포인트로 나눠 화면이 죽지 않게 한다", async () => {
    const { canSegmentGraphemes, countGraphemes } = await import("../graphemes");

    expect(canSegmentGraphemes).toBe(false);
    expect(countGraphemes("가나다")).toBe(3);
  });
});
