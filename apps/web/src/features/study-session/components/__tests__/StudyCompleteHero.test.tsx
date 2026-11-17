import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MASCOT_EXPRESSION_SRC, jumpTiltTransform } from "@/components/mascot/mascotExpressions";
import type { MascotId, MascotLook } from "@/components/mascot/types";

import type { SessionResultView } from "../../sessionResult";
import { StudyCompleteHero, type CompleteHeroPhase } from "../StudyCompleteHero";

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const view: SessionResultView = {
  focusSec: 3000,
  studySec: 3600,
  focusRatePercent: 83,
  startedAt: "2026-11-13T09:00:00.000Z",
  endedAt: "2026-11-13T10:00:00.000Z",
  clockRange: "18:00 – 19:00",
  distractions: [],
  distractionSec: 0,
  pause: null,
  segments: [],
  longestFocus: null,
};

const MASCOTS: readonly MascotId[] = [
  "book",
  "planner",
  "pencil",
  "stopwatch",
  "lamp",
  "padlock",
  "camcorder",
];

const SUPERHERO: MascotLook = {
  id: "stopwatch",
  accessories: [
    {
      slot: "set",
      imageUrl: "/superhero.png",
      backImageUrl: "/superhero-back.png",
      effectImageUrl: "/superhero-effect.png",
    },
  ],
};

function renderHero(look: MascotLook | null | undefined, phase: CompleteHeroPhase = "static") {
  return render(<StudyCompleteHero view={view} phase={phase} look={look} />);
}

function faceSources(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("[data-result-mascot] [data-slot='mascot-body'] img"),
    (img) => img.getAttribute("src"),
  );
}

function visibleFaces(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("[data-result-mascot] [data-slot='mascot-body'] img"),
  ).filter((img) => !img.classList.contains("opacity-0"));
}

describe("StudyCompleteHero", () => {
  it.each(MASCOTS)("%s는 기본, 정색, 눈 감음, 점프 표정을 겹쳐 그린다", (id) => {
    const { container } = renderHero({ id, accessories: [] });
    const faces = MASCOT_EXPRESSION_SRC[id];

    expect(faceSources(container)).toEqual([faces.idle, faces.squint, faces.closed, faces.jump]);
  });

  it("고른 모습을 아직 모르면 타이미의 표정을 그린다", () => {
    const { container } = renderHero(undefined);
    const faces = MASCOT_EXPRESSION_SRC.stopwatch;

    expect(faceSources(container)).toEqual([faces.idle, faces.squint, faces.closed, faces.jump]);
  });

  it("소품을 끼고 있어도 몸 그림만 표정마다 바꾸고 소품은 그대로 그린다", () => {
    const { container } = renderHero({
      id: "book",
      accessories: [{ slot: "head", imageUrl: "/beret.png" }],
    });
    const faces = MASCOT_EXPRESSION_SRC.book;

    expect(faceSources(container)).toEqual([faces.idle, faces.squint, faces.closed, faces.jump]);
    expect(container.querySelector("[data-slot='accessory-head']")).toHaveAttribute(
      "src",
      "/beret.png",
    );
  });

  it("정점에서는 소품 층을 점프 그림의 몸만큼 기울이고 몸은 기울이지 않는다", () => {
    const { container } = renderHero({
      id: "planner",
      accessories: [
        { slot: "head", imageUrl: "/beret.png" },
        { slot: "wings", imageUrl: "/wings.png" },
      ],
    });

    const frames = container.querySelectorAll<HTMLElement>("[data-layer-frame]");
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.style.transform).toBe(jumpTiltTransform("planner"));
    }
    expect(container.querySelector("[data-result-mascot-tilt]")).toBeNull();
  });

  it("세트를 입으면 정점의 몸은 다리를 접지 않은 웃는 그림이고 몸과 세트를 함께 기울인다", () => {
    const { container } = renderHero(SUPERHERO);
    const faces = MASCOT_EXPRESSION_SRC.stopwatch;

    expect(faceSources(container)).toEqual([faces.idle, faces.squint, faces.closed, faces.joy]);
    const tilt = container.querySelector<HTMLElement>("[data-result-mascot-tilt]");
    expect(tilt?.style.transform).toBe(jumpTiltTransform("stopwatch"));
    expect(tilt?.querySelector("[data-slot='mascot-body']")).not.toBeNull();
    expect(tilt?.querySelector("[data-slot='accessory-set']")).not.toBeNull();
    expect(tilt?.querySelector("[data-slot='accessory-set-back']")).not.toBeNull();
    expect(container.querySelector("[data-layer-frame]")).toBeNull();
  });

  it("뛰어오르는 동안 소품은 처음부터 그려 두고 표정과 같은 순간에 한 번에 기운다", () => {
    const { container } = renderHero(
      { id: "book", accessories: [{ slot: "head", imageUrl: "/beret.png" }] },
      "intro",
    );

    const jumper = container.querySelector("[data-result-mascot]");
    expect(jumper?.className).toContain("result-mascot-jump");
    const head = container.querySelector("[data-slot='accessory-head']");
    expect(head?.className).not.toContain("opacity-0");
    for (const frame of container.querySelectorAll("[data-layer-frame]")) {
      expect(frame.className).toContain("animate-[result-mascot-tilt_0.92s_step-end_both]");
      expect(frame.className).toContain("motion-reduce:animate-none");
    }
    const faces = container.querySelectorAll("[data-slot='mascot-body'] img");
    expect(faces[3].className).toContain("result-mascot-face-peak");
  });

  it("세트를 입고 뛰어오르면 몸과 세트를 감싼 상자가 표정과 같은 순간에 기운다", () => {
    const { container } = renderHero(SUPERHERO, "intro");

    expect(container.querySelector("[data-result-mascot-tilt]")?.className).toContain(
      "animate-[result-mascot-tilt_0.92s_step-end_both]",
    );
  });

  it.each([
    ["소품", { id: "book", accessories: [{ slot: "head", imageUrl: "/beret.png" }] }],
    ["세트", SUPERHERO],
  ] as const)("움직임 없이 보면 %s를 낀 정점 자세를 바로 보인다", (_, look) => {
    const { container } = renderHero(look, "static");

    expect(container.querySelector("[data-result-mascot]")?.className).not.toContain("animate-");
    const tilted = container.querySelectorAll<HTMLElement>(
      "[data-layer-frame], [data-result-mascot-tilt]",
    );
    expect(tilted.length).toBeGreaterThan(0);
    for (const element of tilted) {
      expect(element.className).not.toContain("animate-");
      expect(element.style.transform).toBe(jumpTiltTransform(look.id));
    }
    const peak =
      look === SUPERHERO ? MASCOT_EXPRESSION_SRC.stopwatch.joy : MASCOT_EXPRESSION_SRC.book.jump;
    expect(visibleFaces(container).map((img) => img.getAttribute("src"))).toEqual([peak]);
  });

  it("발끝 높이가 다른 마스코트는 판을 그만큼 내려 바닥 그림자에 닿게 한다", () => {
    const top = (id: MascotId) =>
      renderHero({ id, accessories: [] }).container.querySelector<HTMLElement>(
        "[data-result-mascot-board]",
      )?.style.top;

    expect(top("stopwatch")).toBe("-5.5px");
    expect(top("book")).toBe("5.29px");
    expect(top("camcorder")).toBe("7.38px");
  });

  describe("발밑 소품", () => {
    const SKATEBOARD: MascotLook = {
      id: "pencil",
      accessories: [
        { slot: "head", imageUrl: "/beret.png" },
        { slot: "underfoot", imageUrl: "/board-front.png", backImageUrl: "/board-back.png" },
      ],
    };

    function ground(container: HTMLElement) {
      return container.querySelector<HTMLElement>("[data-result-mascot-ground]");
    }

    it("뛰는 상자 밖 바닥 자리에 앞뒤 조각을 모두 그리고 뛰는 상자에는 그리지 않는다", () => {
      const { container } = renderHero(SKATEBOARD, "intro");

      const floor = ground(container);
      expect(floor?.closest("[data-result-mascot]")).toBeNull();
      expect(floor?.querySelector("[data-slot='accessory-underfoot-back']")).toHaveAttribute(
        "src",
        "/board-back.png",
      );
      expect(floor?.querySelector("[data-slot='accessory-underfoot']")).toHaveAttribute(
        "src",
        "/board-front.png",
      );
      const jumper = container.querySelector("[data-result-mascot]");
      expect(jumper?.querySelector("[data-slot^='accessory-underfoot']")).toBeNull();
      expect(jumper?.querySelector("[data-slot='accessory-head']")).not.toBeNull();
    });

    it("바닥 자리의 발밑 소품은 몸을 그리지 않고 기울이지도 않는다", () => {
      const { container } = renderHero(SKATEBOARD, "intro");

      const floor = ground(container);
      expect(floor?.querySelector("[data-slot='mascot-body'] img")).toBeNull();
      expect(floor?.querySelector("[data-layer-frame], [data-result-mascot-tilt]")).toBeNull();
      expect(floor?.className).not.toContain("result-mascot-jump");
      expect(floor?.querySelector<HTMLElement>("[data-result-mascot-board]")?.style.top).toBe(
        container.querySelector<HTMLElement>("[data-result-mascot] [data-result-mascot-board]")
          ?.style.top,
      );
    });

    it("모션 축소에서도 바닥에 남고 애니메이션을 걸지 않는다", () => {
      const { container } = renderHero(SKATEBOARD, "static");

      const floor = ground(container);
      expect(floor?.querySelector("[data-slot='accessory-underfoot']")).not.toBeNull();
      expect(floor?.className).not.toContain("animate-");
    });

    it("세트는 바닥 자리를 따로 두지 않고 몸과 함께 움직인다", () => {
      const { container } = renderHero(SUPERHERO, "intro");

      expect(ground(container)).toBeNull();
    });

    it.each(["intro", "static", "revealed"] as const)(
      "%s 단계에서 바닥 자리를 그리면 제목이 소품에 붙지 않게 슬롯 아래를 16px 더 띄운다",
      (phase) => {
        const slot = (look: MascotLook) =>
          renderHero(look, phase).container.querySelector("[data-result-mascot-slot]")?.className;

        expect(slot(SKATEBOARD)).toContain("mb-8.5");
        expect(slot(SUPERHERO)).toContain("mb-4.5");
        expect(slot({ id: "book", accessories: [] })).toContain("mb-4.5");
      },
    );

    it("발밑 소품이 없으면 바닥 자리를 그리지 않는다", () => {
      const { container } = renderHero({ id: "book", accessories: [] }, "intro");

      expect(ground(container)).toBeNull();
    });
  });
});
