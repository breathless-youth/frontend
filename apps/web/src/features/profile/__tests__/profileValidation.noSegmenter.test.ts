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

  it("그래핌 개수에 의존하는 검증을 건너뛴다 — 코드포인트로 세면 정상 닉네임을 막아버린다", async () => {
    const { validateNickname, validateNicknameLength } = await import("../profileValidation");

    const nickname = "🧑‍💻".repeat(5);
    expect(validateNickname(nickname)).toBeNull();
    expect(validateNicknameLength(nickname)).toBeNull();
  });

  it("형식 위반도 건너뛴다 — 이 환경에서는 서버 판정에 맡긴다", async () => {
    const { validateNickname } = await import("../profileValidation");

    expect(validateNickname("느낌표금지!")).toBeNull();
  });
});
