import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("마스코트 그림을 넘기면 기본 그림 대신 그 그림을 그린다", () => {
    const { container } = render(
      <StudyCompleteHero view={view} phase="static" mascotSrc="/custom-mascot.png" />,
    );

    expect(container.querySelector("img[data-result-mascot]")).toHaveAttribute(
      "src",
      "/custom-mascot.png",
    );
  });
});
