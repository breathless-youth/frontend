import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MascotFigure } from "../MascotFigure";
import { SpriteEffectPiece } from "../SpriteEffectPiece";
import type { EffectPiece } from "../types";

const BOX = { left: "12%", top: "9%", width: "75%", height: "78%" };
const PICTURE = { backgroundImage: "url(/aura.png)" };

/** 띠 그림을 받는 결과를 정한다. */
function stubDecode(result: "ok" | "fail") {
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => (result === "ok" ? Promise.resolve() : Promise.reject(new Error("broken"))),
  });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

describe("SpriteEffectPiece", () => {
  it("띠 그림을 받기 전에는 지금 효과 그림 조각을 그대로 보인다", () => {
    const { container } = render(
      <SpriteEffectPiece
        sprite={{ url: "/sprite/before.webp", frames: 12, durationMs: 1200 }}
        box={BOX}
        picture={PICTURE}
      />,
    );

    const piece = container.querySelector<HTMLElement>("[data-effect-piece='sprite']");
    expect(piece?.style.width).toBe("75%");
    expect(piece?.querySelector<HTMLElement>("[style*='aura.png']")).not.toBeNull();
    expect(piece?.querySelector(".mascot-fx-sprite")).toBeNull();
  });

  it("띠 그림을 받으면 장 수만큼 한 장 폭씩 정해진 길이에 넘긴다", async () => {
    stubDecode("ok");
    const { container } = render(
      <SpriteEffectPiece
        sprite={{ url: "/sprite/flame.webp", frames: 12, durationMs: 1200 }}
        box={BOX}
        picture={PICTURE}
      />,
    );

    const track = await waitFor(() => {
      const found = container.querySelector<HTMLElement>(".mascot-fx-sprite");
      expect(found).not.toBeNull();
      return found!;
    });
    // 띠를 11장 폭 상자에 얹어 그 상자를 자기 폭만큼 밀면 마지막 장에서 멈춘다.
    expect(track.style.width).toBe("1100%");
    expect(track.style.animationDuration).toBe("1200ms");
    expect(track.style.animationTimingFunction).toBe("steps(12, jump-none)");
    const strip = track.firstElementChild as HTMLElement;
    expect(strip.style.backgroundImage).toContain("/sprite/flame.webp");
    expect(Number.parseFloat(strip.style.width)).toBeCloseTo((12 / 11) * 100);
    expect(container.querySelector("[style*='aura.png']")).toBeNull();
  });

  it("띠 그림을 받지 못하면 지금 효과 그림 조각을 계속 보인다", async () => {
    stubDecode("fail");
    const { container } = render(
      <SpriteEffectPiece
        sprite={{ url: "/sprite/broken.webp", frames: 10, durationMs: 800 }}
        box={BOX}
        picture={PICTURE}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector(".mascot-fx-sprite")).toBeNull();
    expect(container.querySelector("[style*='aura.png']")).not.toBeNull();
  });

  it("장 수나 길이가 맞지 않으면 띠 그림을 받지 않고 지금 그림을 보인다", () => {
    const decode = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: decode,
    });

    const { container } = render(
      <>
        <SpriteEffectPiece
          sprite={{ url: "/s/one.webp", frames: 1, durationMs: 800 }}
          box={BOX}
          picture={PICTURE}
        />
        <SpriteEffectPiece
          sprite={{ url: "/s/zero.webp", frames: 10, durationMs: 0 }}
          box={BOX}
          picture={PICTURE}
        />
      </>,
    );

    expect(container.querySelectorAll("[style*='aura.png']")).toHaveLength(2);
    expect(decode).not.toHaveBeenCalled();
  });

  it("마스코트 효과 조각에 띠 그림이 있으면 움직임 이름보다 띠 그림을 쓴다", async () => {
    stubDecode("ok");
    const piece: EffectPiece = {
      x: 0.12,
      y: 0.09,
      width: 0.75,
      height: 0.78,
      motion: "pulse",
      sprite: { url: "/sprite/figure.webp", frames: 10, durationMs: 800 },
    };
    const { container } = render(
      <MascotFigure
        id="stopwatch"
        accessories={[{ slot: "effect", backImageUrl: "/aura.png", effectPieces: [piece] }]}
      />,
    );

    expect(container.querySelector("[data-effect-piece]")?.getAttribute("data-effect-piece")).toBe(
      "sprite",
    );
    await waitFor(() => expect(container.querySelector(".mascot-fx-sprite")).not.toBeNull());
  });
});
