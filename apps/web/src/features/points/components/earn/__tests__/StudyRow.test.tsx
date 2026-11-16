import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EarnToday, StudyPointTier } from "../../../types";
import { StudyRow } from "../StudyRow";

const HOUR = 3600;
// 공부 포인트는 시간 구간 없이 고정이라 서버가 구간 하나만 보낸다.
const FIXED: StudyPointTier[] = [
  { fromSec: 0, toSec: 10 * HOUR, soloPoints: 7, togetherPoints: 10 },
];

function study(focusSec: number, extra: Partial<EarnToday["study"]> = {}): EarnToday["study"] {
  return {
    focusSec,
    capSec: 10 * HOUR,
    unitSec: 30 * 60,
    pointsPerUnit: 7,
    tiers: FIXED,
    ...extra,
  };
}

const guide = () => screen.queryByRole("button", { name: "같이 공부 포인트 안내" });

/** 안내 버튼을 눌러 뜬 같이 공부 설명 */
async function openGuide() {
  const trigger = guide();
  if (trigger === null) throw new Error("같이 공부 포인트 안내 버튼이 없다");
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  return screen.findByText(/그룹 공부방에서 2명 이상 함께 공부하면/, { selector: "[data-state]" });
}

/** 화면 낭독기용 사본까지 같이 공부 설명이 하나도 남지 않았는지 */
const guideClosed = () =>
  waitFor(() => expect(screen.queryAllByText(/그룹 공부방에서 2명 이상/)).toHaveLength(0));

describe("StudyRow", () => {
  it("같이 하면 받는 값은 늘 보이지 않고 제목 옆 안내 버튼을 눌러야 보인다", async () => {
    render(<StudyRow study={study(HOUR)} />);

    expect(screen.queryByText(/그룹 공부방에서/)).toBeNull();
    expect(await openGuide()).toHaveTextContent(
      "그룹 공부방에서 2명 이상 함께 공부하면 30분마다 +10P를 받아요.",
    );
  });

  it("구간이 하나뿐인 고정 값이면 하루 상한 가까이 공부해도 같은 값으로 안내한다", async () => {
    render(<StudyRow study={study(9 * HOUR + 30 * 60)} />);

    expect(screen.getByText("+7P")).toBeInTheDocument();
    expect(await openGuide()).toHaveTextContent("30분마다 +10P를 받아요.");
  });

  it.each([
    [3 * HOUR, "+5P"],
    [5 * HOUR, "+2P"],
  ])(
    "구간이 여러 개인 서버에서 오늘 순공 %i초면 지금 구간의 같이 값을 쓴다",
    async (focusSec, points) => {
      const tiers: StudyPointTier[] = [
        { fromSec: 0, toSec: 2 * HOUR, soloPoints: 7, togetherPoints: 10 },
        { fromSec: 2 * HOUR, toSec: 4 * HOUR, soloPoints: 4, togetherPoints: 5 },
        { fromSec: 4 * HOUR, toSec: 10 * HOUR, soloPoints: 1, togetherPoints: 2 },
      ];
      render(<StudyRow study={study(focusSec, { tiers })} />);

      expect(await openGuide()).toHaveTextContent(`30분마다 ${points}를 받아요.`);
    },
  );

  it("안내는 Esc로 닫힌다", async () => {
    render(<StudyRow study={study(HOUR)} />);
    const content = await openGuide();

    fireEvent.keyDown(content, { key: "Escape" });

    await guideClosed();
  });

  it("안내는 바깥을 누르면 닫힌다", async () => {
    render(
      <>
        <StudyRow study={study(HOUR)} />
        <p>바깥</p>
      </>,
    );
    await openGuide();
    // Radix는 연 다음 틱부터 바깥 누르기를 듣는다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    fireEvent.pointerDown(screen.getByText("바깥"));

    await guideClosed();
  });

  it("구간을 주지 않는 서버에서는 안내 버튼이 없다", () => {
    render(<StudyRow study={study(HOUR, { tiers: undefined })} />);

    expect(guide()).toBeNull();
  });

  it("같이 값이 혼자 값보다 크지 않으면 안내 버튼이 없다", () => {
    const flat = FIXED.map((tier) => ({ ...tier, togetherPoints: tier.soloPoints }));
    render(<StudyRow study={study(HOUR, { tiers: flat })} />);

    expect(guide()).toBeNull();
  });

  it("오늘 같이 한 시간은 따로 보이지 않는다", () => {
    render(<StudyRow study={study(HOUR, { togetherFocusSec: 70 * 60 })} />);

    expect(screen.queryByText(/같이 1시간 10분/)).toBeNull();
  });
});
