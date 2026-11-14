import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { SessionHelpScreen } from "../components/SessionHelpScreen";
import { SESSION_HELP_STEPS } from "../sessionGuide";

/** 핵심 단어를 따로 감싸서 문구가 여러 노드로 나뉜다. 문단 전체 글자로 찾는다. */
function queryParagraph(text: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === "P" && element.textContent === text,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "다음" }));
const tapOverlay = () => fireEvent.click(screen.getByLabelText("다음 안내"));

/** 단계 하나의 문구 전부(설명과 정중앙 제목). 문구 상수가 카탈로그로 옮겨 가 강조 태그를 뺀 글자로 비교한다. */
const stepTexts = (index: number) => {
  const { callouts, center } = SESSION_HELP_STEPS[index];
  return [...Object.values(callouts), ...(center === undefined ? [] : [center])].map((key) =>
    i18n.t(`study-session:${key}`).replace(/<\/?hl>/g, ""),
  );
};

function renderHelp() {
  const onComplete = vi.fn();
  const onDismiss = vi.fn();
  const view = render(<SessionHelpScreen onComplete={onComplete} onDismiss={onDismiss} />);
  return { ...view, onComplete, onDismiss };
}

/** n단계(1부터 센다)까지 다음으로 넘긴다. */
function goToStep(n: number) {
  for (let index = 1; index < n; index += 1) next();
}

const simpleSurface = (container: HTMLElement) =>
  container.querySelector('[data-session-surface="simple"]');

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionHelpScreen", () => {
  it("세션 도움말이라는 이름의 비모달 대화상자이고 뜨면 루트에 초점을 둔다", () => {
    renderHelp();
    const dialog = screen.getByRole("dialog", { name: "세션 도움말" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(document.activeElement).toBe(dialog);
  });

  it("단계 id·배경·끝내기 버튼은 설계 표 그대로다", () => {
    expect(SESSION_HELP_STEPS.map((step) => step.id)).toEqual([
      "away",
      "measuring",
      "camera",
      "buttons",
      "finish",
    ]);
    expect(SESSION_HELP_STEPS.map((step) => step.background)).toEqual([
      "simple",
      "simple",
      "simple",
      "photo",
      "photo",
    ]);
    expect(
      SESSION_HELP_STEPS.map((step) =>
        step.cta === true ? i18n.t("study-session:help.finishCta") : undefined,
      ),
    ).toEqual([undefined, undefined, undefined, undefined, "순공 시작하기"]);
  });

  it("다섯 단계를 순서대로 보이고 단계마다 그 단계 문구만 있다", () => {
    renderHelp();

    SESSION_HELP_STEPS.forEach((_, index) => {
      expect(screen.getByText(`${index + 1}/5`)).toBeInTheDocument();
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

  it("1단계 이전은 자리를 지키되 누를 수 없고, 2단계부터 돌아간다", () => {
    renderHelp();
    const prev = screen.getByRole("button", { name: "이전" });
    expect(prev).toBeDisabled();
    expect(prev).toHaveAttribute("aria-disabled", "true");

    next();
    expect(screen.getByRole("button", { name: "이전" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));

    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("5단계 막대에는 이전과 진행도만 있고 정중앙 순공 시작하기로 끝낸다", async () => {
    const { onComplete } = renderHelp();
    goToStep(5);

    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("onLater를 넘기면 5단계에만 나중에 시작할게요가 있고, 넘기지 않으면 없다", async () => {
    const onLater = vi.fn();
    const onComplete = vi.fn();
    const view = render(
      <SessionHelpScreen onComplete={onComplete} onLater={onLater} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "나중에 시작할게요" })).not.toBeInTheDocument();

    goToStep(5);
    await userEvent.click(screen.getByRole("button", { name: "나중에 시작할게요" }));
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    view.unmount();

    renderHelp();
    goToStep(5);
    expect(screen.queryByRole("button", { name: "나중에 시작할게요" })).not.toBeInTheDocument();
  });

  it("덮개를 탭하면 1~4단계는 다음으로 가고, 5단계에서는 아무 일도 없다", () => {
    const { onComplete } = renderHelp();

    tapOverlay();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    for (let index = 0; index < 3; index += 1) tapOverlay();
    expect(screen.getByText("5/5")).toBeInTheDocument();

    tapOverlay();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("단계를 넘겨도 초점은 루트에 있다", () => {
    renderHelp();
    next();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "세션 도움말" }));
  });

  it("1단계는 비집중 문구와 멈춘 순공시간(큰 숫자)을 보인다", () => {
    vi.useFakeTimers();
    renderHelp();
    expect(screen.getByText("자리를 확인해 주세요")).toBeInTheDocument();
    expect(screen.getByText("01:10:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("01:10:00")).toBeInTheDocument();
  });

  it("2단계는 측정 중 라벨과 1초씩 오르는 순공시간을, 3단계는 설명 없이 시간만 보인다", () => {
    vi.useFakeTimers();
    renderHelp();

    next();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("01:10:01")).toBeInTheDocument();
    expect(screen.getByText("현재 집중")).toBeInTheDocument();

    next();
    expect(screen.getByText("01:10:00")).toBeInTheDocument();
    expect(screen.queryByText("순공시간")).not.toBeInTheDocument();
  });

  it("1~3단계는 심플 모드 화면을, 4~5단계는 사진을 배경으로 쓴다", () => {
    const { container } = renderHelp();

    for (let index = 0; index < 3; index += 1) {
      expect(simpleSurface(container)).not.toBeNull();
      next();
    }
    expect(simpleSurface(container)).toBeNull();
    next();
    expect(simpleSurface(container)).toBeNull();
  });

  it("3단계에만 손 아이콘이 있다", () => {
    renderHelp();

    SESSION_HELP_STEPS.forEach((step, index) => {
      if (step.id === "camera") {
        expect(screen.getByTestId("tap-hand")).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
      }
      if (index < SESSION_HELP_STEPS.length - 1) next();
    });
  });

  it("핵심 단어는 따로 감싼다", () => {
    renderHelp();
    const word = screen.getByText("졸면");
    expect(word.tagName).toBe("SPAN");
    expect(word.parentElement?.tagName).toBe("P");
  });

  it("Escape로 닫으면 끝까지 본 것과 따로 알린다", () => {
    const { onComplete, onDismiss } = renderHelp();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("닫히면 열기 전 초점으로 돌려준다", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderHelp();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("화살표·손 아이콘·가짜 요소는 낭독기에서 숨기고 가짜 필은 라이브 리전이 아니다", () => {
    const { container } = renderHelp();
    container.querySelectorAll("svg").forEach((svg) => {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("01:10:00").closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByText("자리를 확인해 주세요").closest("[aria-hidden='true']")).not.toBeNull();
  });
});
