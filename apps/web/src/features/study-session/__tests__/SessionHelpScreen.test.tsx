import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionHelpScreen } from "../components/SessionHelpScreen";
import { SESSION_HELP_STEPS } from "../sessionHelpCopy";

/** 핵심 단어를 따로 감싸서 문구가 여러 노드로 나뉜다. 문단 전체 글자로 찾는다. */
function queryParagraph(text: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === "P" && element.textContent === text,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "다음" }));

/** 단계 하나의 설명 문구 전부 */
const stepTexts = (index: number) =>
  Object.values(SESSION_HELP_STEPS[index].callouts).map((callout) => callout.text);

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionHelpScreen", () => {
  it("세션 도움말이라는 이름의 비모달 대화상자이고 뜨면 루트에 초점을 둔다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "세션 도움말" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(document.activeElement).toBe(dialog);
  });

  it("여섯 단계를 순서대로 보이고 단계마다 그 단계 문구만 있다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);

    SESSION_HELP_STEPS.forEach((_, index) => {
      expect(screen.getByText(`${index + 1}/6`)).toBeInTheDocument();
      for (const text of stepTexts(index)) {
        expect(queryParagraph(text)).toBeInTheDocument();
      }
      SESSION_HELP_STEPS.forEach((__, other) => {
        if (other === index) return;
        for (const text of stepTexts(other)) {
          if (!stepTexts(index).includes(text)) {
            expect(queryParagraph(text)).not.toBeInTheDocument();
          }
        }
      });
      if (index < SESSION_HELP_STEPS.length - 1) next();
    });
  });

  it("마지막 단계 버튼은 순공 시작하기이고 누르면 끝까지 본 것으로 닫는다", async () => {
    const onComplete = vi.fn();
    render(<SessionHelpScreen onComplete={onComplete} onDismiss={() => {}} />);
    for (let index = 0; index < 5; index += 1) next();

    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("1단계에는 이전이 없고, 2단계부터 이전으로 돌아간다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    expect(screen.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();

    next();
    expect(screen.getByText("2/6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));

    expect(screen.getByText("1/6")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();
  });

  it("덮개를 탭하면 다음 단계로 가고 마지막에서는 닫는다", () => {
    const onComplete = vi.fn();
    render(<SessionHelpScreen onComplete={onComplete} onDismiss={() => {}} />);

    fireEvent.click(screen.getByLabelText("다음 안내"));
    expect(screen.getByText("2/6")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByLabelText("다음 안내"));
    expect(screen.getByText("6/6")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("다음 안내"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("단계를 넘겨도 초점은 루트에 있다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    next();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "세션 도움말" }));
  });

  it("1단계는 순공을 멈추고 총 공부만 1초씩 올린다", () => {
    vi.useFakeTimers();
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("01:24:08")).toBeInTheDocument();
    expect(screen.getByText("총 01:45:12")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("01:24:08")).toBeInTheDocument();
    expect(screen.getByText("총 01:45:14")).toBeInTheDocument();
  });

  it("2단계는 순공과 총 공부가 함께 올라간다", () => {
    vi.useFakeTimers();
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    next();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("01:24:09")).toBeInTheDocument();
    expect(screen.getByText("총 01:45:13")).toBeInTheDocument();
    expect(screen.getByText("순공시간 측정 중")).toBeInTheDocument();
  });

  it("5단계에만 손 아이콘이 있다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    for (let index = 0; index < 4; index += 1) {
      expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
      next();
    }
    expect(screen.getByTestId("tap-hand")).toBeInTheDocument();
    next();
    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
  });

  it("핵심 단어는 따로 감싼다", () => {
    render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    // 핵심 단어가 문단 안에서 따로 감싼 노드로 나뉜다.
    const word = screen.getByText("자리 이탈");
    expect(word.tagName).toBe("SPAN");
    expect(word.parentElement?.tagName).toBe("P");
  });

  it("Escape로 닫으면 끝까지 본 것과 따로 알린다", () => {
    const onComplete = vi.fn();
    const onDismiss = vi.fn();
    render(<SessionHelpScreen onComplete={onComplete} onDismiss={onDismiss} />);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("닫히면 열기 전 초점으로 돌려준다", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("화살표·손 아이콘·가짜 요소는 낭독기에서 숨기고 가짜 필은 라이브 리전이 아니다", () => {
    const { container } = render(<SessionHelpScreen onComplete={() => {}} onDismiss={() => {}} />);
    container.querySelectorAll("svg").forEach((svg) => {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
