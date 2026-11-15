import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import timiClosed from "@/assets/mascot/timi-closed.png";
import timiIdle from "@/assets/mascot/timi-idle.png";
import timiSmile from "@/assets/mascot/timi-smile.png";
import timiSquint from "@/assets/mascot/timi-squint.png";
import book from "@/assets/points/mascot-book.png";
import stopwatch from "@/assets/points/mascot-stopwatch.png";

import type { SessionResultView } from "../../sessionResult";
import { StudyCompleteHero } from "../StudyCompleteHero";

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

describe("StudyCompleteHero", () => {
  function mascotSources(container: HTMLElement) {
    return Array.from(container.querySelectorAll("[data-result-mascot] img"), (img) =>
      img.getAttribute("src"),
    );
  }

  it("표정 묶음을 넘기면 기본 표정 대신 그 그림들을 그린다", () => {
    const { container } = render(
      <StudyCompleteHero
        view={view}
        phase="static"
        mascot={{
          idle: "/idle.png",
          squint: "/squint.png",
          closed: "/closed.png",
          smile: "/smile.png",
        }}
      />,
    );

    expect(mascotSources(container)).toEqual([
      "/idle.png",
      "/squint.png",
      "/closed.png",
      "/smile.png",
    ]);
  });

  it("표정 묶음을 넘기지 않으면 타이미 네 표정을 그린다", () => {
    const { container } = render(<StudyCompleteHero view={view} phase="static" />);

    expect(mascotSources(container)).toEqual([timiIdle, timiSquint, timiClosed, timiSmile]);
  });

  it("고른 마스코트에 표정 그림이 없으면 정지 그림과 소품을 함께 그린다", () => {
    const { container } = render(
      <StudyCompleteHero
        view={view}
        phase="static"
        look={{ id: "book", accessories: [{ slot: "head", imageUrl: "/beret.png" }] }}
      />,
    );

    expect(mascotSources(container)).toEqual([book, "/beret.png"]);
  });

  it("고른 마스코트가 타이미이고 소품이 없으면 네 표정을 그린다", () => {
    const { container } = render(
      <StudyCompleteHero view={view} phase="static" look={{ id: "stopwatch", accessories: [] }} />,
    );

    expect(mascotSources(container)).toEqual([timiIdle, timiSquint, timiClosed, timiSmile]);
  });

  it("타이미가 소품을 끼고 있으면 소품이 어긋나지 않게 정지 그림으로 그린다", () => {
    const { container } = render(
      <StudyCompleteHero
        view={view}
        phase="static"
        look={{ id: "stopwatch", accessories: [{ slot: "face", imageUrl: "/glasses.png" }] }}
      />,
    );

    expect(mascotSources(container)).toEqual([stopwatch, "/glasses.png"]);
  });

  it("뛰어오르는 동안 소품도 마스코트와 같은 상자에서 함께 움직인다", () => {
    const { container } = render(
      <StudyCompleteHero
        view={view}
        phase="intro"
        look={{ id: "book", accessories: [{ slot: "head", imageUrl: "/beret.png" }] }}
      />,
    );

    const jumper = container.querySelector("[data-result-mascot]");
    expect(jumper?.className).toContain("result-mascot-jump");
    expect(jumper?.querySelector('[data-slot="accessory-head"]')).not.toBeNull();
  });
});
