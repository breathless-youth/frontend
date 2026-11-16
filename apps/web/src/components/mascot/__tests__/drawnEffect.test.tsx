import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MascotFigure } from "../MascotFigure";
import type { EffectPiece, WornAccessory } from "../types";

const WHOLE = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

function renderEffect(effect: Omit<WornAccessory, "slot">, others: WornAccessory[] = []) {
  return render(
    <MascotFigure id="padlock" accessories={[{ slot: "effect", ...effect }, ...others]} />,
  );
}

function piecesOf(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-effect-piece]"));
}

function layerOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-slot]"), (node) =>
    node.getAttribute("data-slot"),
  );
}

describe("코드로 그리는 효과", () => {
  it.each([
    ["glow", [".mascot-fx-glow-halo", ".mascot-fx-glow-bright", ".mascot-fx-glow-sheen"]],
    ["ripple", [".mascot-fx-ripple-ring", ".mascot-fx-ripple-halo", ".mascot-fx-ripple-bright"]],
    ["wipe", [".mascot-fx-wipe"]],
    ["starry", [".mascot-fx-starry-disc", ".mascot-fx-star", ".mascot-fx-meteor"]],
    ["flow", [".mascot-fx-flow-color", ".mascot-fx-flow-shine"]],
    ["flash", [".mascot-fx-flash-burst", ".mascot-fx-flash-light"]],
    ["countdown", [".mascot-fx-countdown-sweep", ".mascot-fx-countdown-digit"]],
  ])("%s 움직임은 효과 그림 위에 코드로 그린 빛과 입자를 더한다", (motion, parts) => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [{ ...WHOLE, motion }],
    });

    const [piece] = piecesOf(container);
    expect(piece.getAttribute("data-effect-piece")).toBe(motion);
    for (const part of parts) {
      expect(piece.querySelector(part), part).not.toBeNull();
    }
    // 바탕은 서버가 준 효과 그림을 조각 자리만큼 잘라 쓴다.
    expect(piece.querySelector<HTMLElement>("[style*='fx.png']")?.style.backgroundSize).toBe(
      "166.6667% 166.6667%",
    );
  });

  it("필름 카운트다운 숫자는 3, 2, 1 순서로 바뀐다", () => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [{ ...WHOLE, motion: "countdown" }],
    });

    const digits = container.querySelectorAll<HTMLElement>(".mascot-fx-countdown-digit");
    expect(Array.from(digits, (digit) => digit.textContent)).toEqual(["3", "2", "1"]);
    expect(Array.from(digits, (digit) => digit.style.animationDelay)).toEqual(["0s", "-2s", "-1s"]);
  });

  it("연보라 오라는 가운데에서 바깥으로 퍼지는 고리 세 겹이 차례로 시작하고 흔들리는 겹이 없다", () => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [{ ...WHOLE, motion: "ripple" }],
    });

    const rings = container.querySelectorAll<HTMLElement>(".mascot-fx-ripple-ring");
    expect(Array.from(rings, (ring) => ring.style.animationDelay)).toEqual(["0s", "-1s", "-2s"]);
    expect(container.querySelector("[class*='mascot-fx-ripple-wave']")).toBeNull();
    expect(container.querySelector("[class*='mascot-fx-ripple-echo']")).toBeNull();
  });

  it("오라 속 반짝이는 판 가운데에서 먼 쪽으로 살짝 떠오른다", () => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [
        { x: 0.2, y: 0.3, width: 0.05, height: 0.05, motion: "drift" },
        { x: 0.75, y: 0.3, width: 0.04, height: 0.04, motion: "drift" },
      ],
    });

    const [left, right] = piecesOf(container);
    expect(left.getAttribute("data-drift-side")).toBe("left");
    expect(right.getAttribute("data-drift-side")).toBe("right");
  });

  it("떠다니는 반짝이와 흩어지는 가루는 조각 자체가 움직이고 조각마다 시작 시점이 다르다", () => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [
        { x: 0.2, y: 0.7, width: 0.06, height: 0.06, motion: "spread" },
        { x: 0.3, y: 0.68, width: 0.08, height: 0.08, motion: "spread" },
        { x: 0.7, y: 0.66, width: 0.07, height: 0.07, motion: "spread" },
        { x: 0.75, y: 0.3, width: 0.04, height: 0.04, motion: "drift" },
      ],
    });

    const pieces = piecesOf(container);
    expect(pieces.map((piece) => piece.getAttribute("data-effect-piece"))).toEqual([
      "spread",
      "spread",
      "spread",
      "drift",
    ]);
    // 조각 그림 하나가 그대로 움직이고 새 입자를 만들지 않는다.
    for (const piece of pieces) {
      expect(piece.children).toHaveLength(0);
      expect(piece.style.backgroundImage).toContain("/fx.png");
    }
    const delays = pieces.map((piece) => piece.style.animationDelay);
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("지우개 가루는 판 왼쪽 조각은 왼쪽으로, 오른쪽 조각은 오른쪽으로 흩어진다", () => {
    const { container } = renderEffect({
      backImageUrl: "/fx.png",
      effectPieces: [
        { x: 0.2, y: 0.7, width: 0.06, height: 0.06, motion: "spread" },
        { x: 0.7, y: 0.66, width: 0.07, height: 0.07, motion: "spread" },
      ],
    });

    const [left, right] = piecesOf(container);
    expect(left.getAttribute("data-spread-side")).toBe("left");
    expect(right.getAttribute("data-spread-side")).toBe("right");
  });

  it("열쇠 고리는 같은 열쇠를 몸 뒤와 몸 앞에 그려 궤도 앞쪽 반은 소품보다 앞을 지난다", () => {
    const keys: EffectPiece[] = [
      { x: 0.29, y: 0.65, width: 0.08, height: 0.08, motion: "spiral" },
      { x: 0.46, y: 0.63, width: 0.08, height: 0.09, motion: "spiral" },
      { x: 0.64, y: 0.57, width: 0.08, height: 0.08, motion: "spiral" },
    ];
    const { container } = renderEffect({ imageUrl: "/keys.png", effectPieces: keys }, [
      { slot: "head", imageUrl: "/cap.png" },
    ]);

    expect(layerOrder(container)).toEqual([
      "accessory-effect",
      "mascot-body",
      "accessory-head",
      "accessory-effect-front",
    ]);
    const back = container.querySelector<HTMLElement>("[data-slot='accessory-effect']")!;
    const front = container.querySelector<HTMLElement>("[data-slot='accessory-effect-front']")!;
    const sides = (layer: HTMLElement) =>
      Array.from(layer.querySelectorAll("[data-effect-piece='spiral']"), (piece) =>
        piece.getAttribute("data-orbit-side"),
      );
    expect(sides(back)).toEqual(["back", "back", "back"]);
    expect(sides(front)).toEqual(["front", "front", "front"]);
    // 같은 열쇠는 앞뒤 층에서 같은 박자로 돌아야 층을 넘어갈 때 이어져 보인다.
    const delays = (layer: HTMLElement) =>
      Array.from(
        layer.querySelectorAll<HTMLElement>(".mascot-fx-spiral-key"),
        (path) => path.style.animationDelay,
      );
    expect(delays(front)).toEqual(delays(back));
    // 한 바퀴 4.2초를 열쇠 세 개가 고르게 나눠 1.4초씩 어긋나 돈다.
    expect(delays(back)).toEqual(["0s", "-1.4s", "-2.8s"]);
    // 고리도 뒤쪽 반은 몸 뒤에, 앞쪽 반은 몸 앞에 한 번씩만 그린다.
    expect(back.querySelectorAll("[data-orbit-ring='back']")).toHaveLength(1);
    expect(front.querySelectorAll("[data-orbit-ring='front']")).toHaveLength(1);
    expect(back.querySelector("[data-orbit-ring='front']")).toBeNull();
  });

  describe("작은 크기", () => {
    it("효과 조각을 담은 판이 크기를 알아보는 기준 상자다", () => {
      const { container } = renderEffect({
        backImageUrl: "/fx.png",
        effectPieces: [{ ...WHOLE, motion: "starry" }],
      });

      expect(container.querySelector("[data-slot='accessory-effect-back']")?.classList).toContain(
        "mascot-fx-board",
      );
    });

    it.each([
      ["starry", ".mascot-fx-star", 9, 4],
      ["glow", ".mascot-fx-glow-halo", 1, 0],
      ["ripple", ".mascot-fx-ripple-ring", 3, 1],
    ])("%s는 작은 크기에서 덜어 낼 부분을 표시한다", (motion, part, total, kept) => {
      const { container } = renderEffect({
        backImageUrl: "/fx.png",
        effectPieces: [{ ...WHOLE, motion }],
      });

      const all = container.querySelectorAll(part);
      expect(all).toHaveLength(total);
      expect(Array.from(all).filter((node) => !node.hasAttribute("data-fx-detail"))).toHaveLength(
        kept,
      );
    });

    it("밤하늘의 별똥별은 작은 크기에서 뺀다", () => {
      const { container } = renderEffect({
        backImageUrl: "/fx.png",
        effectPieces: [{ ...WHOLE, motion: "starry" }],
      });

      expect(
        container.querySelector(".mascot-fx-meteor")?.closest("[data-fx-detail]"),
      ).not.toBeNull();
    });
  });

  describe("서버 값이 이 웹과 다를 때", () => {
    it("모르는 움직임과 아직 그리지 않는 불꽃·전기 이름은 멈춘 그림이다", () => {
      const { container } = renderEffect({
        backImageUrl: "/fx.png",
        effectPieces: [
          { ...WHOLE, motion: "flame" },
          { ...WHOLE, motion: "electric" },
          { ...WHOLE, motion: "sparkle-storm" },
        ],
      });

      const pieces = piecesOf(container);
      expect(pieces.map((piece) => piece.getAttribute("data-effect-piece"))).toEqual([
        "still",
        "still",
        "still",
      ]);
      for (const piece of pieces) {
        expect(piece.className).not.toContain("animate-[");
        expect(piece.children).toHaveLength(0);
      }
    });

    it("예전 움직임 이름이 오면 지금처럼 예전 움직임으로 그린다", () => {
      const { container } = renderEffect({
        backImageUrl: "/fx.png",
        effectPieces: [
          { ...WHOLE, motion: "pulse" },
          { ...WHOLE, motion: "sway" },
        ],
      });

      const [pulse, sway] = piecesOf(container);
      expect(pulse.getAttribute("data-effect-piece")).toBe("pulse");
      expect(pulse.className).toContain("mascot-fx-pulse");
      expect(sway.className).toContain("mascot-fx-sway");
      expect(pulse.className).toContain("motion-reduce:animate-none");
      expect(container.querySelector("[class*='mascot-fx-glow']")).toBeNull();
    });
  });
});
