import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { READY_PIP_SIZE, SessionHelpScreen } from "../components/SessionHelpScreen";
import { SESSION_HELP_STEPS } from "../sessionGuide";

const timelapse = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async () => {}),
}));
vi.mock("@/features/timelapse/timelapseSettings", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadTimelapseSettings: timelapse.load,
  saveTimelapseSettings: timelapse.save,
}));

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/prefersReducedMotion", () => ({ prefersReducedMotion: () => motion.reduced }));

/** 핵심 단어를 따로 감싸서 문구가 여러 노드로 나뉜다. 고정 줄바꿈을 공백으로 보고 문단 전체 글자로 찾는다. */
function paragraph(text: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === "P" && element.textContent?.replace(/\n/g, " ") === text,
  );
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "다음" }));
const dialog = () => screen.getByRole("dialog", { name: "세션 도움말" });

function renderHelp(mode: "first" | "menu") {
  const onComplete = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <SessionHelpScreen mode={mode} onComplete={onComplete} onDismiss={onDismiss} />,
  );
  return { ...view, onComplete, onDismiss };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** 장면 시간을 흘리지 않아도 되는 테스트는 마지막 장까지 바로 넘긴다. */
function goToLast() {
  for (let index = 0; index < 5; index += 1) next();
}

beforeEach(() => {
  timelapse.load.mockResolvedValue({ enabled: true });
  motion.reduced = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SessionHelpScreen", () => {
  it("단계는 인사, 확인 중, 멈춤, 심플 모드, 구도, 시작 여섯 장이다", () => {
    expect(SESSION_HELP_STEPS.map((step) => step.id)).toEqual([
      "welcome",
      "grace",
      "distract",
      "simple",
      "ready",
      "start",
    ]);
  });

  it("장마다 마스코트 표정이 다르다(인사 기쁨, 확인 중 집중, 멈춤 졸림, 심플 기쁨, 구도 집중, 시작 점프)", () => {
    renderHelp("first");
    const cells: (string | null)[] = [];
    for (let index = 0; index < 6; index += 1) {
      cells.push(screen.getByTestId("help-mascot").getAttribute("data-cell"));
      if (index < 5) next();
    }
    expect(cells).toEqual(["2", "1", "4", "2", "1", "7"]);
  });

  it("첫 장은 인사 제목과 본문이다", () => {
    renderHelp("first");

    expect(paragraph("포커스메이커스에 오신 걸 환영해요.")).toBeInTheDocument();
    expect(paragraph("어떻게 사용하는지 같이 알아볼까요?")).toBeInTheDocument();
    expect(screen.getByText("1 / 6")).toBeInTheDocument();
  });

  it("세션 도움말이라는 이름의 비모달 대화상자이고 뜨면 루트에 초점을 둔다", () => {
    renderHelp("first");
    expect(dialog()).not.toHaveAttribute("aria-modal");
    expect(document.activeElement).toBe(dialog());
  });

  it("2장 확인 중: 공부하지 않는 카메라 창과 상태 문구, 깜빡이는 동안 시간은 흐른다는 말풍선이다", () => {
    renderHelp("first");
    next();

    expect(screen.getByTestId("help-demo-camera")).toHaveAttribute("data-demo", "away");
    expect(screen.getByText("공부 자세를 확인해 주세요")).toBeInTheDocument();
    expect(paragraph("공부 자세가 흐트러지면 시간을 깜빡여 알려줘요")).toBeInTheDocument();
    expect(paragraph("깜빡이는 동안은 시간이 계속 흘러가요")).toBeInTheDocument();
  });

  it("2장 확인 중에는 시계 숫자가 1초마다 흐르고, 3장 멈춤으로 넘어가면 그 값에서 멈춘다", async () => {
    vi.useFakeTimers();
    renderHelp("first");
    next();
    const number = () => screen.getByTestId("session-clock-number").textContent;

    const start = number();
    await advance(3000);
    const flowed = number();
    expect(flowed).not.toBe(start);

    next();
    await advance(3000);
    expect(number()).toBe(flowed);
  });

  it("4장 심플 모드에서도 시계 숫자가 1초마다 흐른다", async () => {
    vi.useFakeTimers();
    renderHelp("first");
    for (let index = 0; index < 3; index += 1) next();
    await advance(1400);
    const number = () => screen.getByTestId("session-clock-number").textContent;

    const start = number();
    await advance(3000);
    expect(number()).not.toBe(start);
  });

  it("5장 구도에서도 뒤 시계 숫자가 1초마다 흐른다", async () => {
    vi.useFakeTimers();
    renderHelp("first");
    for (let index = 0; index < 4; index += 1) next();
    await advance(1400);
    const number = () => screen.getByTestId("session-clock-number").textContent;

    const start = number();
    await advance(3000);
    expect(number()).not.toBe(start);
  });

  it("카메라 창 사진은 확인 중·멈춤 장만 휴대폰 보는 모습이고 나머지 장은 공부하는 모습이다", () => {
    renderHelp("first");
    const photo = () =>
      screen.getByTestId("help-demo-camera").querySelector("img")!.getAttribute("src");
    const photos: (string | null)[] = [];
    for (let index = 0; index < 6; index += 1) {
      photos.push(photo());
      if (index < 5) next();
    }

    expect(
      photos.map((src) =>
        src?.includes("session-help-phone")
          ? "phone"
          : src?.includes("session-help-ready")
            ? "ready"
            : src,
      ),
    ).toEqual(["ready", "phone", "phone", "ready", "ready", "ready"]);
  });

  it("확인 중·멈춤 장은 덮개에 시계 자리 구멍 하나만 뚫고 카메라 창은 덮으며, 다른 장은 구멍 없이 덮는다", () => {
    const { container } = renderHelp("first");
    const holes = () => container.querySelectorAll("[data-hole]").length;

    expect(holes()).toBe(0);
    expect(screen.queryByTestId("help-clock-spot")).not.toBeInTheDocument();
    next();
    expect(holes()).toBe(1);
    expect(screen.getByTestId("help-clock-spot")).toBeInTheDocument();
    expect(screen.getByTestId("help-demo-camera")).not.toHaveClass("z-20");
    next();
    expect(holes()).toBe(1);
    next();
    expect(holes()).toBe(0);
  });

  it("3장 멈춤: 확정 문구와 순공이 멈춘다는 말풍선이다", () => {
    renderHelp("first");
    next();
    next();

    expect(screen.getByTestId("help-demo-camera")).toHaveAttribute("data-demo", "away");
    expect(screen.getByText("공부가 감지되면 다시 측정돼요")).toBeInTheDocument();
    expect(paragraph("계속 공부가 감지되지 않으면 순공시간이 멈춰요")).toBeInTheDocument();
    expect(paragraph("다시 공부를 시작하면 시간이 흘러가요")).toBeInTheDocument();
  });

  it("멈춤 장에서 다음을 누르면 일반 화면에서 탭하는 손을 보인 뒤 심플 모드 화면으로 바뀐다", async () => {
    vi.useFakeTimers();
    const { container } = renderHelp("first");
    next();
    next();
    next();

    expect(paragraph("화면을 탭하면 심플 모드로 바뀌어요")).toBeInTheDocument();
    expect(paragraph("카메라 화면만 숨기고 측정은 계속돼요")).toBeInTheDocument();
    expect(screen.getByTestId("tap-hand")).toBeInTheDocument();
    expect(container.querySelector('[data-session-surface="simple"]')).toBeNull();

    // 손은 1.4초 동안 보이고 그 전에는 바뀌지 않는다.
    await advance(1300);
    expect(screen.getByTestId("tap-hand")).toBeInTheDocument();
    await advance(100);
    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
    expect(container.querySelector('[data-session-surface="simple"]')).not.toBeNull();
  });

  it("동작 줄이기를 켰으면 손 없이 바로 심플 모드 화면이다", () => {
    motion.reduced = true;
    const { container } = renderHelp("first");
    next();
    next();
    next();

    expect(screen.queryByTestId("tap-hand")).not.toBeInTheDocument();
    expect(container.querySelector('[data-session-surface="simple"]')).not.toBeNull();
  });

  it("5장 구도: 키운 카메라 창에 얼굴·손·공부도구를 짚고 창 위에 영상 안내를 달며, 타임랩스는 아직 없다", () => {
    renderHelp("first");
    for (let index = 0; index < 4; index += 1) next();

    expect(paragraph("얼굴, 손, 공부도구가 함께 보이면 더 정확하게 감지해요")).toBeInTheDocument();
    const camera = screen.getByTestId("help-demo-camera");
    expect(camera).toHaveTextContent("얼굴");
    expect(camera).toHaveTextContent("공부도구");
    expect(camera).toHaveTextContent("손");
    expect(camera).toHaveTextContent("영상은 서버에 저장되지 않아요");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeInTheDocument();
  });

  it("구도 장의 키운 카메라 창은 모든 화면에서 사진과 같은 3:4라 구도 표시가 어긋나지 않는다", () => {
    // Tailwind 크기 단위(4px)로 적힌 높이·너비 쌍을 화면 구분별로 읽어 비율을 본다.
    const sizes = new Map<string, { h?: number; w?: number }>();
    for (const token of READY_PIP_SIZE.split(" ")) {
      const match = /^(?:(.+):)?([hw])-(\d+)$/.exec(token);
      if (!match) continue;
      const screenKind = match[1] ?? "base";
      const size = sizes.get(screenKind) ?? {};
      size[match[2] as "h" | "w"] = Number(match[3]);
      sizes.set(screenKind, size);
    }

    expect([...sizes.keys()]).toEqual(["base", "regular", "landscape-compact"]);
    for (const { h, w } of sizes.values()) {
      expect((w ?? 0) * 4).toBe((h ?? 0) * 3);
    }
  });

  describe("6장 시작", () => {
    it("시작 문구, 저장된 타임랩스 값이 있고 다시 보지 않기·나중에 할게요는 없다", async () => {
      renderHelp("first");
      goToLast();

      expect(paragraph("이제 집중해서 공부해볼까요?")).toBeInTheDocument();
      expect(screen.queryByText("영상은 서버에 저장되지 않아요")).not.toBeInTheDocument();
      expect(await screen.findByRole("switch", { name: "타임랩스 녹화" })).toBeChecked();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "나중에 할게요" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    });

    it("저장된 타임랩스가 꺼져 있으면 꺼진 채로 시작하고, 바꾸면 바로 저장한다", async () => {
      timelapse.load.mockResolvedValue({ enabled: false });
      renderHelp("first");
      goToLast();

      const toggle = await screen.findByRole("switch", { name: "타임랩스 녹화" });
      expect(toggle).not.toBeChecked();
      // 흰 말풍선 위에서 꺼짐이 보이도록 회색 트랙을 쓴다.
      expect(toggle).toHaveClass("data-[state=unchecked]:bg-text-tertiary/60");
      fireEvent.click(toggle);

      expect(toggle).toBeChecked();
      expect(timelapse.save).toHaveBeenCalledExactlyOnceWith({ enabled: true });
    });

    it("공부 시작하기는 타임랩스 값을 함께 알린다", async () => {
      const { onComplete } = renderHelp("first");
      goToLast();
      fireEvent.click(await screen.findByRole("switch", { name: "타임랩스 녹화" }));

      fireEvent.click(screen.getByRole("button", { name: "공부 시작하기" }));
      expect(onComplete).toHaveBeenCalledExactlyOnceWith({
        cta: "start",
        timelapseEnabled: false,
      });
    });

    it("메뉴로 연 도움말은 타임랩스 없이 닫기만 있다", () => {
      const { onComplete } = renderHelp("menu");
      goToLast();

      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "공부 시작하기" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "나중에 할게요" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      expect(onComplete).toHaveBeenCalledExactlyOnceWith({
        cta: "close",
        timelapseEnabled: null,
      });
    });
  });

  it("이전은 첫 장에서 누를 수 없고, 다음 장에서는 앞 장으로 돌아간다. 마지막 장에도 있다", () => {
    renderHelp("first");
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();

    next();
    expect(screen.getByText("2 / 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByText("1 / 6")).toBeInTheDocument();

    goToLast();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByText("5 / 6")).toBeInTheDocument();
  });

  it("덮개를 눌러도 장이 넘어가거나 닫히지 않는다", () => {
    const { onComplete, onDismiss } = renderHelp("first");

    fireEvent.click(dialog());

    expect(screen.getByText("1 / 6")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Escape는 어느 장에서든 바로 닫는다", () => {
    const { onDismiss, onComplete } = renderHelp("first");
    next();

    fireEvent.keyDown(dialog(), { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("장을 넘기면 초점을 루트로 다시 둔다", () => {
    renderHelp("first");
    screen.getByRole("button", { name: "다음" }).focus();
    next();

    expect(document.activeElement).toBe(dialog());
  });

  it("단계를 호출부가 들면 그 단계부터 보이고 바뀐 단계를 알린다", () => {
    const onStepChange = vi.fn();
    render(
      <SessionHelpScreen
        mode="menu"
        step={1}
        onStepChange={onStepChange}
        onComplete={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("2 / 6")).toBeInTheDocument();
    next();
    expect(onStepChange).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("닫히면 열기 전 초점으로 돌려준다", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = renderHelp("menu");
    unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
