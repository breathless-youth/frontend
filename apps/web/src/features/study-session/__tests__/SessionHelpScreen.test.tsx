import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionHelpScreen } from "../components/SessionHelpScreen";
import { MASCOT_CELL } from "../mascot/mascotExpression";

/** 핵심 단어를 따로 감싸서 문구가 여러 노드로 나뉜다. 문단 전체 글자로 찾는다. */
function queryParagraph(text: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === "P" && element.textContent === text,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "다음" }));
const helpScreen = () => screen.getByTestId("help-screen");
const holes = () => document.querySelectorAll("[data-hole]");
const mascotCell = () => screen.getByTestId("help-mascot").getAttribute("data-cell");

function renderHelp(props: { onLater?: () => void } = {}) {
  const onComplete = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <SessionHelpScreen onComplete={onComplete} onDismiss={onDismiss} {...props} />,
  );
  return { ...view, onComplete, onDismiss };
}

/** n단계(1부터 센다)까지 다음으로 넘긴다. */
function goToStep(n: number) {
  for (let index = 1; index < n; index += 1) next();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SessionHelpScreen", () => {
  it("세션 도움말이라는 이름의 비모달 대화상자이고 뜨면 루트에 초점을 둔다", () => {
    renderHelp();
    const dialog = screen.getByRole("dialog", { name: "세션 도움말" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(document.activeElement).toBe(dialog);
  });

  it("1 / 5 환영 단계는 이전을 막고 제목과 본문을 보이며 강조 자리가 없다", () => {
    renderHelp();
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    expect(queryParagraph("포커스메이커스에 오신 걸 환영해요.")).toBeInTheDocument();
    expect(queryParagraph("어떻게 사용하는지 같이 알아볼까요?")).toBeInTheDocument();
    expect(holes()).toHaveLength(0);
    expect(mascotCell()).toBe(String(MASCOT_CELL.joy));
  });

  it("자리 비움 단계는 상태 줄 하나를 강조하고 공부 안 함 문구와 졸린 마스코트를 보인다", () => {
    renderHelp();
    next();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(queryParagraph("집중하지 않는 것 같으면 여기에 알려줘요")).toBeInTheDocument();
    expect(queryParagraph("그동안 순공시간은 멈춰요")).toBeInTheDocument();
    expect(screen.getByText("자리를 비운 것 같아요")).toBeInTheDocument();
    expect(holes()).toHaveLength(1);
    expect(mascotCell()).toBe(String(MASCOT_CELL.sleepy));
  });

  it("제목의 핵심 단어만 따로 감싸고 본문은 감싸지 않는다", () => {
    renderHelp();
    next();
    expect(screen.getByText("집중하지 않는 것 같으면").tagName).toBe("SPAN");
    expect(queryParagraph("그동안 순공시간은 멈춰요")?.children).toHaveLength(0);
  });

  it("측정 중 단계는 시계 묶음을 강조하고 집중 마스코트를 보인다", () => {
    renderHelp();
    goToStep(3);
    expect(queryParagraph("집중하면 다시 측정해요")).toBeInTheDocument();
    expect(screen.getByText("순공시간 측정 중")).toBeInTheDocument();
    expect(holes()).toHaveLength(1);
    expect(mascotCell()).toBe(String(MASCOT_CELL.focus));
  });

  it("측정 중에서 다음을 누르면 탭 모션 뒤 심플 화면으로 바뀐다", () => {
    vi.useFakeTimers();
    renderHelp();
    goToStep(3);
    next();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(queryParagraph("화면을 탭하면 심플 모드로 바뀌어요")).toBeInTheDocument();
    expect(screen.getByTestId("tap-hand")).toBeInTheDocument();
    expect(helpScreen()).toHaveAttribute("data-screen", "normal");
    // 누르는 동안은 아직 일반 화면이라 심플 시계 자리를 밝히지 않는다.
    expect(holes()).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(helpScreen()).toHaveAttribute("data-screen", "simple");
    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
    // 심플 화면은 시계 말고 다른 것이 없어 덮개 상자 없이 글자만 밝힌다.
    expect(document.querySelector("[data-dim]")).toBeNull();
    // 과목 줄은 일반 화면과 심플 화면에 하나씩 있고 심플 쪽이 뒤에 그려진다.
    const [normalLabel, simpleLabel] = screen.getAllByText("수학").map((el) => el.closest("p"));
    expect(simpleLabel?.className).toContain("[&_span]:text-white");
    expect(normalLabel?.className).not.toContain("[&_span]:text-white");
  });

  it("움직임 줄이기면 탭 모션 없이 바로 심플 화면이다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    renderHelp();
    goToStep(4);
    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
    expect(helpScreen()).toHaveAttribute("data-screen", "simple");
    expect(document.querySelector("[data-dim]")).toBeNull();
  });

  it("마지막 단계에서 이전으로 돌아오면 모션 없이 심플 화면이다", () => {
    vi.useFakeTimers();
    renderHelp();
    goToStep(5);
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
    expect(helpScreen()).toHaveAttribute("data-screen", "simple");
  });

  it("마지막 단계는 더보기와 작은 창을 강조하고 말풍선 밖 두 안내 글을 보인다", () => {
    renderHelp();
    goToStep(5);
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
    expect(holes()).toHaveLength(2);
    expect(
      queryParagraph("이 도움말은 더보기 메뉴에서\n언제든 다시 볼 수 있어요"),
    ).toBeInTheDocument();
    expect(
      queryParagraph("카메라 화면은 어디로도 보내지 않으니\n안심하세요😌"),
    ).toBeInTheDocument();
    expect(mascotCell()).toBe(String(MASCOT_CELL.jump));
  });

  it("마지막 단계는 다음 대신 순공 시작하기로 끝낸다", () => {
    const { onComplete } = renderHelp();
    goToStep(5);
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "순공 시작하기" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("onLater를 넘기면 마지막 단계에만 나중에 하기가 있고, 넘기지 않으면 없다", () => {
    const onLater = vi.fn();
    const { unmount } = renderHelp({ onLater });
    goToStep(4);
    expect(screen.queryByRole("button", { name: "나중에 하기" })).not.toBeInTheDocument();
    next();
    fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));
    expect(onLater).toHaveBeenCalledOnce();
    unmount();

    renderHelp();
    goToStep(5);
    expect(screen.queryByRole("button", { name: "나중에 하기" })).not.toBeInTheDocument();
  });

  it("말풍선 바깥을 탭해도 넘어가지 않고 다음 버튼으로만 넘어간다", () => {
    renderHelp();
    expect(screen.queryByLabelText("다음 안내")).not.toBeInTheDocument();
    fireEvent.click(helpScreen());
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    next();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("단계를 넘겨도 초점은 루트에 있다", () => {
    renderHelp();
    next();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "세션 도움말" }));
  });

  it("Escape로 닫으면 끝까지 본 것과 따로 알린다", () => {
    const { onComplete, onDismiss } = renderHelp();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("닫히면 열기 전 초점으로 돌려준다", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = renderHelp();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("가짜 상태 줄은 라이브 리전이 아니다", () => {
    renderHelp();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
