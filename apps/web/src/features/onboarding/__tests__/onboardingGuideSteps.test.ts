import { describe, expect, it } from "vitest";

import {
  formatSessionClock,
  formatTotalStudyClock,
  GUIDE_BOTTOM_HINT,
  GUIDE_FINAL_HINT,
  guideProgressLabel,
  ONBOARDING_GUIDE_STEPS,
  parseOnboardingGuideEntry,
} from "../onboardingGuideSteps";

/**
 * 이 파일은 문구를 "고정"하는 테스트다. 아래 문자열은 `ai-wiki/product/voice-tone.md` §4
 * 표에서 그대로 인용한 확정 카피이고 Figma 텍스트 노드와 글자 단위로 일치한다 —
 * 의역·문장부호 변경·개행 삽입이 생기면 여기서 깨진다.
 */
describe("온보딩 가이드 확정 문구", () => {
  it("5개 스텝을 G1~G5 순서로 갖는다 (5개 라우트가 아니라 하나의 플로우)", () => {
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.id)).toEqual(["G1", "G2", "G3", "G4", "G5"]);
  });

  it("툴팁 타이틀·본문이 확정 카피와 일치한다", () => {
    const tooltips = ONBOARDING_GUIDE_STEPS.map((step) => step.tooltip);

    // 2026-07-29 팀 확정 개정 카피 기준 (BY-151) — voice-tone 위키·Figma 동기화는 후속.
    expect(tooltips[0]).toMatchObject({
      title: "순공시간이 여기에 쌓여요",
      body: "집중하는 동안 타이머가 흘러가요.",
    });
    expect(tooltips[1]).toMatchObject({
      title: "집중이 아니면, 잠시 멈춰요",
      body: "자리를 비우거나 다른 일을 하면 타이머가 멈추고, 위 상태 표시가 주황으로 바뀌어요. 다시 집중하면 저절로 흘러가요.",
    });
    expect(tooltips[2]).toMatchObject({
      title: "탭 한 번이면, 타이머만 떠요",
      body: "공부 중 화면을 탭하면 타이머만 남는 심플 모드가 돼요. 한 번 더 탭하면 원래 화면으로 돌아와요.",
    });
    expect(tooltips[3]).toMatchObject({
      title: "잠깐 쉴 땐 일시정지",
      body: "일시정지하면 순공시간과 총 공부 시간이 모두 멈춰요.",
    });
    // G5는 말풍선이 아니라 일러스트 카드다.
    expect(tooltips[4]).toBeNull();
    expect(ONBOARDING_GUIDE_STEPS[4].privacyCard).toEqual({
      title: "영상은 기기 밖으로 나가지 않아요",
      body: "측정은 기기 안에서만 이루어지고, 영상은 저장하지 않아요. 공부 시간만 기록돼요.",
    });
  });

  it("하단 힌트와 CTA 라벨이 확정 카피와 일치한다", () => {
    expect(GUIDE_BOTTOM_HINT).toBe("좌우로 밀거나 화면을 탭해도 넘어가요 · 건너뛰기");
    expect(GUIDE_FINAL_HINT).toBe("이 안내는 설정 > 측정 기준 안내에서 언제든 다시 볼 수 있어요");
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.ctaLabel)).toEqual([
      "다음",
      "다음",
      "다음",
      "다음",
      "집중 시작하기",
    ]);
  });

  it("멀티룸 프라이버시 표현을 끌어오지 않는다 (V1.0에 멀티룸 화면이 없다)", () => {
    const allCopy = JSON.stringify(ONBOARDING_GUIDE_STEPS);

    expect(allCopy).not.toContain("LiveKit");
    expect(allCopy).not.toContain("AI 분석용 원본 프레임");
    expect(allCopy).not.toContain("참여자");
  });
});

describe("목업 배경 상태", () => {
  it("G2는 순공만 멈추고 총 공부는 흐르게 두며, 순공 < 총 관계를 유지한다", () => {
    const g2 = ONBOARDING_GUIDE_STEPS[1].backdrop;

    expect(g2.freezeFocusTimer).toBe(true);
    expect(g2.freezeTotalTimer).toBe(false);
    expect(g2.seedFocusSec).toBeLessThan(g2.seedTotalSec);
  });

  it("G4는 두 타이머를 모두 멈춘다 — 색↔값 모순 해소됨(2026-08-25 BY-427 확정)", () => {
    const g4 = ONBOARDING_GUIDE_STEPS[3].backdrop;

    // 카피("순공시간과 총 공부 시간이 모두 멈춰요")와 시연이 일치한다.
    expect(g4.freezeFocusTimer).toBe(true);
    expect(g4.freezeTotalTimer).toBe(true);
    // 순공을 얼리는 스텝은 G2(비집중)·G4(일시정지)뿐이고, 총 공부까지 얼리는 것은 G4뿐이다.
    expect(
      ONBOARDING_GUIDE_STEPS.filter((step) => step.backdrop.freezeFocusTimer).map(
        (step) => step.id,
      ),
    ).toEqual(["G2", "G4"]);
    expect(
      ONBOARDING_GUIDE_STEPS.filter((step) => step.backdrop.freezeTotalTimer).map(
        (step) => step.id,
      ),
    ).toEqual(["G4"]);
  });

  it("G5만 목업 타이머를 렌더하지 않는다 (2026-08-25 BY-427 확정)", () => {
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.backdrop.showTimer)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("상태 필 — G1·G4는 링 강조, G2는 스텝 강조가 링을 켬, G3·G5는 필 없음 (2026-08-25 BY-427 피드백)", () => {
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.backdrop.statusPill?.ring ?? null)).toEqual([
      true, // G1 — 집중 필 링
      null, // G2 — emphasis: "status-pill"이 링을 켠다(플래그 불필요)
      null, // G3 — 필 없음
      true, // G4 — 일시정지 필 링
      null, // G5 — 필 없음
    ]);
    expect(ONBOARDING_GUIDE_STEPS[1].emphasis).toBe("status-pill");
    expect(ONBOARDING_GUIDE_STEPS[2].backdrop.statusPill).toBeNull();
    expect(ONBOARDING_GUIDE_STEPS[4].backdrop.statusPill).toBeNull();
  });

  it("모든 스텝에서 순공은 총 공부를 넘지 않는다", () => {
    for (const step of ONBOARDING_GUIDE_STEPS) {
      expect(step.backdrop.seedFocusSec).toBeLessThanOrEqual(step.backdrop.seedTotalSec);
    }
  });

  it("순공 타이머 색조가 Figma 텍스트 노드의 fill과 일치한다", () => {
    // G1 `68:906` #ffffff · G2 `68:982` #8b95a1 · G3 `68:1061` #4593fc ·
    // G4 `68:1124` #8b95a1 · G5 `68:1291` #ffffff (2026-07-26 get_design_context 실측).
    // 총 공부 줄은 5스텝 모두 white 42%로 같다 — 순공만 색이 바뀌는 게 Figma의 규칙이다.
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.backdrop.focusTimerTone)).toEqual([
      "active",
      "stopped",
      "simple",
      "stopped",
      "active",
    ]);
  });

  it("G2는 값도 색도 Figma 실측을 따른다 (색 의미는 미확정 — 아래 주석)", () => {
    // 값(순공 정지)은 `design.md` 비집중 정의와 일치하고 확정 사항이다.
    // 색(`#8b95a1`)은 Figma 실측일 뿐이다 — wiki는 타이머 비집중색을 `#FF9E1B`로 규정해
    // 어긋난다. 확정되면 이 기대값이 `"distract"` 같은 새 색조로 바뀔 수 있다.
    const g2 = ONBOARDING_GUIDE_STEPS[1].backdrop;

    expect(g2.freezeFocusTimer).toBe(true);
    expect(g2.focusTimerTone).toBe("stopped");
  });

  it("G4만 컨트롤 바를 dim 위로 끌어올려 강조한다", () => {
    expect(
      ONBOARDING_GUIDE_STEPS.filter((step) => step.backdrop.controlBar === "raised").map(
        (step) => step.id,
      ),
    ).toEqual(["G4"]);
  });

  it("건너뛰기는 G1~G4에만 있다 (Figma G5 하단 힌트에는 없다)", () => {
    expect(ONBOARDING_GUIDE_STEPS.map((step) => step.skippable)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});

describe("parseOnboardingGuideEntry", () => {
  it("알려진 진입 출처를 그대로 통과시킨다", () => {
    expect(parseOnboardingGuideEntry("focus-start")).toBe("focus-start");
    expect(parseOnboardingGuideEntry("home-card")).toBe("home-card");
    expect(parseOnboardingGuideEntry("settings")).toBe("settings");
  });

  it("모르는 값·누락은 '다시 보기'로 떨어뜨린다 (요청하지 않은 권한 요청을 띄우지 않는다)", () => {
    expect(parseOnboardingGuideEntry(undefined)).toBe("home-card");
    expect(parseOnboardingGuideEntry("이상한값")).toBe("home-card");
  });
});

describe("타이머 표기", () => {
  it("HH:MM:SS 고정 표기다", () => {
    expect(formatSessionClock(19)).toBe("00:00:19");
    expect(formatSessionClock(1508)).toBe("00:25:08");
    expect(formatSessionClock(3661)).toBe("01:01:01");
  });

  it("총 공부는 '총 ' 접두로 병기한다", () => {
    expect(formatTotalStudyClock(1668)).toBe("총 00:27:48");
  });

  it("음수·소수를 안전하게 다룬다", () => {
    expect(formatSessionClock(-5)).toBe("00:00:00");
    expect(formatSessionClock(19.9)).toBe("00:00:19");
  });
});

describe("진행 상태 접근성 라벨", () => {
  it("색·크기 말고 텍스트로도 단계를 알린다", () => {
    expect(guideProgressLabel(0)).toBe("5단계 중 1단계");
    expect(guideProgressLabel(4)).toBe("5단계 중 5단계");
  });
});
