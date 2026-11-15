import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import timiClosed from "@/assets/mascot/timi-closed.png";
import timiIdle from "@/assets/mascot/timi-idle.png";
import timiSmile from "@/assets/mascot/timi-smile.png";
import timiSquint from "@/assets/mascot/timi-squint.png";

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
});
