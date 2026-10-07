import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STICKER_URL } from "../photoFrame";
import { DEFAULT_TIMELAPSE_SETTINGS } from "../timelapseSettings";
import { TimelapsePreview } from "../TimelapsePreview";

const NONE = DEFAULT_TIMELAPSE_SETTINGS.info;

describe("TimelapsePreview", () => {
  it("켠 요소가 없으면 안내 문구와 워터마크만 있다", () => {
    render(<TimelapsePreview aspect="9:16" info={NONE} />);
    const preview = screen.getByTestId("timelapse-preview");

    expect(within(preview).getByText("공부 중 화면")).toBeInTheDocument();
    expect(within(preview).getByText("포커스 메이커스")).toBeInTheDocument();
    expect(within(preview).queryByText("10월 5일")).toBeNull();
  });

  it("켠 정보만 보여주고 안내 문구는 숨긴다", () => {
    render(<TimelapsePreview aspect="9:16" info={{ ...NONE, date: true, streak: true }} />);
    const preview = screen.getByTestId("timelapse-preview");

    expect(within(preview).getByText("10월 5일")).toBeInTheDocument();
    expect(within(preview).getByText("5일 연속 공부 🔥")).toBeInTheDocument();
    expect(within(preview).queryByText("순공 2시간 14분")).toBeNull();
    expect(within(preview).queryByText("공부 중 화면")).toBeNull();
  });

  it("D-Day와 연속 공부는 왼쪽 위에, 나머지 정보는 오른쪽 아래에 둔다", () => {
    render(
      <TimelapsePreview aspect="9:16" info={{ ...NONE, date: true, dday: true, streak: true }} />,
    );
    const top = screen.getByTestId("timelapse-preview-top");

    expect(within(top).getByText("D-Day")).toBeInTheDocument();
    expect(within(top).getByText("5일 연속 공부 🔥")).toBeInTheDocument();
    expect(within(top).queryByText("10월 5일")).toBeNull();
    expect(top).toHaveClass("items-start");
  });

  it("D-Day 글자를 받으면 예시 대신 그 글자를 보여준다", () => {
    render(
      <TimelapsePreview aspect="9:16" info={{ ...NONE, dday: true }} ddayLabel="D-3 · 기말고사" />,
    );

    expect(screen.getByText("D-3 · 기말고사")).toBeInTheDocument();
    expect(screen.queryByText("D-Day")).toBeNull();
  });

  it("D-Day와 연속 공부를 모두 끄면 왼쪽 위 묶음이 없다", () => {
    render(<TimelapsePreview aspect="9:16" info={{ ...NONE, date: true }} />);

    expect(screen.queryByTestId("timelapse-preview-top")).toBeNull();
  });

  it("얼굴 가림과 흐름 바를 켜면 스티커와 흐름 바가 나타난다", () => {
    const { container } = render(
      <TimelapsePreview aspect="9:16" info={{ ...NONE, faceMask: true, flowBar: true }} />,
    );

    expect(container.querySelector(`img[src="${STICKER_URL}"]`)).not.toBeNull();
    expect(screen.getByTestId("timelapse-preview-flow-bar")).toBeInTheDocument();
    expect(screen.queryByText("공부 중 화면")).toBeNull();
  });

  it("비율에 따라 상자 모양이 바뀐다", () => {
    const { rerender } = render(<TimelapsePreview aspect="9:16" info={NONE} />);
    expect(screen.getByTestId("timelapse-preview")).toHaveClass("h-[320px]", "w-[180px]");

    rerender(<TimelapsePreview aspect="16:9" info={NONE} />);
    expect(screen.getByTestId("timelapse-preview")).toHaveClass("aspect-video", "w-full");
  });

  it("스크린리더에는 숨긴다", () => {
    render(<TimelapsePreview aspect="9:16" info={NONE} />);

    expect(screen.getByTestId("timelapse-preview")).toHaveAttribute("aria-hidden", "true");
  });
});
