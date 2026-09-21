import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EyeOutline } from "../../faceLandmarker";
import { createEyeOverlay, projectPoint } from "../eyeOverlay";

const OUTLINE: EyeOutline = {
  left: [
    { x: 0.4, y: 0.4 },
    { x: 0.45, y: 0.38 },
    { x: 0.5, y: 0.4 },
  ],
  right: [
    { x: 0.6, y: 0.4 },
    { x: 0.65, y: 0.38 },
    { x: 0.7, y: 0.4 },
  ],
  accepted: true,
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("projectPoint", () => {
  const portrait = {
    rectWidth: 402,
    rectHeight: 874,
    videoWidth: 1280,
    videoHeight: 720,
    mirrored: false,
    fit: "cover" as const,
  };

  it("cover는 짧은 축을 채우고 긴 축을 가운데서 자른다 — 가운데 점은 화면 가운데다", () => {
    const point = projectPoint({ x: 0.5, y: 0.5 }, portrait);

    expect(point.x).toBeCloseTo(201, 0);
    expect(point.y).toBeCloseTo(437, 0);
  });

  it("cover에서 카메라 가장자리의 점은 화면 밖으로 나간다 — 잘린 영역이다", () => {
    const point = projectPoint({ x: 0, y: 0.5 }, portrait);

    expect(point.x).toBeLessThan(0);
  });

  it("거울 표시면 좌우를 뒤집는다", () => {
    const plain = projectPoint({ x: 0.3, y: 0.5 }, portrait);
    const mirrored = projectPoint({ x: 0.3, y: 0.5 }, { ...portrait, mirrored: true });

    expect(mirrored.x).toBeCloseTo(402 - plain.x, 3);
  });

  it("contain은 위에 붙이고 남는 아래를 비운다", () => {
    const point = projectPoint({ x: 0.5, y: 0 }, { ...portrait, fit: "contain" });

    expect(point.y).toBe(0);
    expect(point.x).toBeCloseTo(201, 0);
  });

  it("스트림 크기를 아직 모르면 0으로 둔다 — 0으로 나누지 않는다", () => {
    expect(projectPoint({ x: 0.5, y: 0.5 }, { ...portrait, videoWidth: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("createEyeOverlay", () => {
  function mountVideo(mirrored: boolean): HTMLVideoElement {
    const surface = document.createElement("div");
    surface.setAttribute("data-session-surface", "camera");
    const video = document.createElement("video");
    if (mirrored) {
      video.className = "scale-x-[-1]";
    }
    surface.append(video);
    document.body.append(surface);
    return video;
  }

  it("꺼져 있으면 아무것도 만들지 않는다 — 측정 밖에서는 좌표가 화면에 닿지 않는다", () => {
    mountVideo(false);
    const overlay = createEyeOverlay({ enabled: false, fit: "cover" });

    overlay.draw(OUTLINE);

    expect(document.querySelector("[data-measure-eye-overlay]")).toBeNull();
  });

  it("프리뷰가 없으면 그리지 않고 던지지도 않는다", () => {
    const overlay = createEyeOverlay({ enabled: true, fit: "cover" });

    expect(() => overlay.draw(OUTLINE)).not.toThrow();
    expect(document.querySelector("[data-measure-eye-overlay]")).toBeNull();
  });

  it("프리뷰 위에 캔버스를 붙이고 세션 리플레이 차단 표식을 단다", () => {
    mountVideo(true);
    const overlay = createEyeOverlay({ enabled: true, fit: "cover" });

    overlay.draw(OUTLINE);

    const canvas = document.querySelector("[data-measure-eye-overlay]");
    expect(canvas).not.toBeNull();
    expect(canvas?.classList.contains("amp-block")).toBe(true);
    expect(canvas?.classList.contains("sentry-block")).toBe(true);
    expect((canvas as HTMLElement).style.pointerEvents).toBe("none");
  });

  it("얼굴이 없으면 그림을 지우고 캔버스는 남긴다", () => {
    mountVideo(false);
    const overlay = createEyeOverlay({ enabled: true, fit: "cover" });

    overlay.draw(OUTLINE);
    expect(() => overlay.draw(null)).not.toThrow();

    expect(document.querySelector("[data-measure-eye-overlay]")).not.toBeNull();
  });

  it("destroy가 캔버스를 걷어낸다", () => {
    mountVideo(false);
    const overlay = createEyeOverlay({ enabled: true, fit: "cover" });

    overlay.draw(OUTLINE);
    overlay.destroy();

    expect(document.querySelector("[data-measure-eye-overlay]")).toBeNull();
  });
});
