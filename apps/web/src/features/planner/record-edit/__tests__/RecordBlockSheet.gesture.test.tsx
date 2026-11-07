import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordBlockSheet } from "../RecordBlockSheet";
import { createRecordDraft } from "../recordDraft";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";

class Pointer extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.pointerType = options.pointerType ?? "touch";
    this.isPrimary = options.isPrimary ?? true;
  }
}
const block = createRecordDraft(
  plannerDay({
    date: "2026-11-04",
    records: [
      plannerRecord({
        startedAt: "2026-11-04T00:13:00Z",
        endedAt: "2026-11-04T00:29:00Z",
        subjectSegments: [],
      }),
    ],
  }),
).blocks[0]!;
function mount({ blocked = false, hidden = false } = {}) {
  const done = vi.fn();
  const change = vi.fn(() => true);
  const view = render(
    <>
      <div data-testid="outside">배경</div>
      <button data-record="other">다른 기록</button>
      <RecordBlockSheet
        block={block}
        dateKey="2026-11-04"
        timeZone="Asia/Seoul"
        label="과목 없음"
        colorIndex={undefined}
        disabled={blocked}
        hiddenBehindSheet={hidden}
        onChange={change}
        onSubject={() => {}}
        onDelete={() => {}}
        onDone={done}
        onError={() => {}}
      />
    </>,
  );
  return { ...view, done, change };
}
function handle() {
  return screen.getByRole("button", { name: "기록 패널 닫기" });
}
function point(
  target: HTMLElement,
  type: "Down" | "Move" | "Up" | "Cancel",
  y: number,
  pointerType = "touch",
) {
  fireEvent[`pointer${type}`](target, {
    clientX: 100,
    clientY: y,
    pointerType,
    pointerId: 1,
    isPrimary: true,
  });
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", Pointer);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = Number.parseFloat(this.style.height) || 300;
    return {
      x: 0,
      y: 500,
      top: 500,
      left: 0,
      bottom: 500 + height,
      right: 390,
      width: 390,
      height,
      toJSON() {},
    };
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["touch", "mouse"])(
  "%s로 회색 막대를 끌면 위로 끌어도 내용 높이가 늘어나지 않는다",
  (pointerType) => {
    const { done, change } = mount();
    const bar = screen.getByRole("region").firstElementChild as HTMLElement;
    point(bar, "Down", 500, pointerType);
    point(bar, "Move", 400, pointerType);
    expect(screen.getByRole("region").style.height).toBe("");
    point(bar, "Move", 350, pointerType);
    expect(screen.getByRole("region").style.transform).toBe("translateY(0px)");
    point(bar, "Up", 350, pointerType);
    expect(done).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  },
);
it("막대를 충분히 아래로 끌고 놓을 때만 패널을 닫는다", () => {
  const { done } = mount();
  const bar = handle();
  point(bar, "Down", 500);
  point(bar, "Move", 760);
  expect(done).not.toHaveBeenCalled();
  point(bar, "Up", 760);
  expect(done).toHaveBeenCalledTimes(1);
});
it.each(["pointerCancel", "lostPointerCapture"] as const)(
  "%s는 크기를 되돌리고 닫지 않는다",
  (event) => {
    const { done } = mount();
    const bar = handle();
    point(bar, "Down", 500);
    point(bar, "Move", 760);
    fireEvent[event](bar, { pointerId: 1 });
    point(bar, "Up", 760);
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByRole("region").style.transform).toBe("translateY(0px)");
  },
);
it("자식의 capture 이탈은 부모의 아래로 끌어 닫기를 취소하지 않는다", () => {
  const { done } = mount();
  const bar = handle();
  point(bar, "Down", 500);
  fireEvent.lostPointerCapture(bar.firstElementChild!, { pointerId: 1 });
  point(bar, "Move", 760);
  point(bar, "Up", 760);
  expect(done).toHaveBeenCalledTimes(1);
});
it("밖을 누르기 시작할 때는 유지하고 짧게 놓았을 때만 닫는다", () => {
  const { done, change } = mount();
  const outside = screen.getByTestId("outside");
  point(outside, "Down", 100);
  expect(done).not.toHaveBeenCalled();
  point(outside, "Up", 100);
  expect(done).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
});
it.each(["move", "cancel", "scroll", "hold"])("바깥 %s는 닫기로 읽지 않는다", (kind) => {
  const { done } = mount();
  const outside = screen.getByTestId("outside");
  vi.spyOn(Date, "now").mockReturnValue(1000);
  point(outside, "Down", 100);
  if (kind === "move") point(outside, "Move", 150);
  if (kind === "cancel") point(outside, "Cancel", 100);
  if (kind === "scroll") fireEvent.scroll(outside);
  if (kind === "hold") vi.spyOn(Date, "now").mockReturnValue(1600);
  point(outside, "Up", 100);
  expect(done).not.toHaveBeenCalled();
});
it("다른 기록 선택과 현재 패널 입력은 바깥 닫기가 아니다", () => {
  const { done } = mount();
  for (const target of [screen.getByText("다른 기록"), screen.getByLabelText("끝")]) {
    point(target, "Down", 100);
    point(target, "Up", 100);
  }
  expect(done).not.toHaveBeenCalled();
});
it("키보드 클릭과 Escape로 선택 패널만 닫는다", () => {
  const { done } = mount();
  fireEvent.click(handle(), { detail: 0 });
  expect(done).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(handle(), { key: "Escape" });
  expect(done).toHaveBeenCalledTimes(2);
});
it("짧은 아래 끌기는 내용 높이를 유지한 채 이동하고 놓으면 돌아온다", () => {
  const { done } = mount();
  const bar = handle();
  point(bar, "Down", 500);
  point(bar, "Move", 530);
  expect(screen.getByRole("region").style.transform).toBe("translateY(30px)");
  expect(screen.getByRole("region").style.height).toBe("");
  point(bar, "Up", 530);
  fireEvent.click(bar, { detail: 1 });
  expect(screen.getByRole("region").style.transform).toBe("translateY(0px)");
  expect(done).not.toHaveBeenCalled();
});
it("중첩 시트 뒤에서는 DOM과 입력값을 유지하면서 패널을 숨긴다", () => {
  mount({ hidden: true });
  const panel = screen.getByRole("region", { hidden: true });
  expect(panel).not.toBeVisible();
  expect(screen.getByLabelText("끝")).toHaveValue("09:29");
});
it("저장 중에는 막대·바깥 탭·Escape가 닫거나 크기를 바꾸지 않는다", () => {
  const { done } = mount({ blocked: true });
  const bar = handle();
  point(bar, "Down", 500);
  point(bar, "Move", 760);
  point(bar, "Up", 760);
  point(screen.getByTestId("outside"), "Down", 100);
  point(screen.getByTestId("outside"), "Up", 100);
  fireEvent.keyDown(bar, { key: "Escape" });
  expect(done).not.toHaveBeenCalled();
});
it("뷰포트가 작아지면 내용 높이의 상한을 보이는 범위로 제한한다", () => {
  mount();
  const bar = handle();
  fireEvent.keyDown(bar, { key: "End" });
  vi.stubGlobal("innerHeight", 400);
  act(() => window.dispatchEvent(new Event("resize")));
  expect(parseFloat(screen.getByRole("region").style.maxHeight)).toBeLessThanOrEqual(348);
});
it("끄는 중 언마운트와 이후 pointerup은 닫기를 호출하지 않는다", () => {
  const { unmount, done } = mount();
  const bar = handle();
  point(bar, "Down", 500);
  point(bar, "Move", 760);
  unmount();
  point(document.body, "Up", 760);
  expect(done).not.toHaveBeenCalled();
});
it("회색 막대를 잡은 채 창 포커스를 잃으면 복구하고 이후 놓기를 닫기로 읽지 않는다", () => {
  const { done } = mount();
  const bar = handle();
  point(bar, "Down", 500);
  point(bar, "Move", 760);
  act(() => window.dispatchEvent(new Event("blur")));
  point(bar, "Up", 760);
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByRole("region").style.transform).toBe("translateY(0px)");
});
