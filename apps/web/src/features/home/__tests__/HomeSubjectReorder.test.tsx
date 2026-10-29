import type { SubjectResponse } from "@focusmakers/types";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { HomeSubjectReorder, type ReorderStore } from "../HomeSubjectReorder";

// jsdom에는 PointerEvent가 없어 끌기 판정에 쓰는 좌표와 isPrimary를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const subject = (id: number, name: string): SubjectResponse => ({
  id,
  name,
  colorIndex: id,
  studySec: 0,
  focusSec: 0,
  tasks: [],
});

const SUBJECTS = [subject(1, "국어"), subject(2, "수학"), subject(3, "영어")];

/** 순서 바꾸기는 화면에만 반영하고, 저장은 잡았을 때와 순서가 다를 때만 한다. 실제 훅과 같은 규칙이다. */
function useFakeStore(commit: (ids: number[]) => void): ReorderStore {
  const [subjects, setSubjects] = useState(SUBJECTS);
  const [base, setBase] = useState<number[] | null>(null);
  return {
    subjects,
    startReorder: () => setBase(SUBJECTS.map((item) => item.id)),
    reorderSubject: (fromId, overId) =>
      setSubjects((prev) => {
        const next = [...prev];
        const from = next.findIndex((item) => item.id === fromId);
        const to = next.findIndex((item) => item.id === overId);
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return next;
      }),
    commitReorder: () => {
      const ids = subjects.map((item) => item.id);
      if (base !== null && ids.join() !== base.join()) {
        commit(ids);
      }
      return Promise.resolve();
    },
  };
}

function Harness({ commit, onDone }: { commit: (ids: number[]) => void; onDone: () => void }) {
  const store = useFakeStore(commit);
  const [shown, setShown] = useState(true);
  return shown ? (
    <HomeSubjectReorder
      store={store}
      onDone={() => {
        onDone();
        setShown(false);
      }}
    />
  ) : null;
}

function names() {
  return within(screen.getByRole("list", { name: "과목 순서" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("HomeSubjectReorder", () => {
  it("제목과 완료가 있고 과목마다 이름과 순서 손잡이만 보인다", () => {
    render(<Harness commit={vi.fn()} onDone={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "과목 순서 변경" })).toBeInTheDocument();
    expect(names()).toEqual(["국어", "수학", "영어"]);
    expect(screen.getByRole("button", { name: "국어 순서 이동" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /공부 시작/ })).toBeNull();
  });

  it("손잡이를 끌어 다른 과목 위로 가면 자리를 바꾸고, 완료하면 한 번만 저장한다", async () => {
    const commit = vi.fn();
    const onDone = vi.fn();
    render(<Harness commit={commit} onDone={onDone} />);
    const handle = screen.getByRole("button", { name: "국어 순서 이동" });
    const target = within(screen.getByRole("list", { name: "과목 순서" })).getAllByRole(
      "listitem",
    )[1]!;
    // 든 줄이 손가락 밑을 덮으므로 겹친 요소 목록에서 자기 아래를 찾는다.
    document.elementsFromPoint = vi.fn(() => [handle, target]);

    fireEvent.pointerDown(handle, { clientX: 300, clientY: 20 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 101 });
    const lifted = handle.closest("li")!;
    expect(lifted.style.translate).toBe("0px 81px");
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 101 });
    expect(lifted.style.translate).toBe("");
    expect(names()).toEqual(["수학", "국어", "영어"]);
    expect(commit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith([2, 1, 3]);
  });

  it("화살표 키로도 이동하고, 이동한 자리를 화면 낭독기에 알린다", () => {
    render(<Harness commit={vi.fn()} onDone={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();

    const handle = screen.getByRole("button", { name: "영어 순서 이동" });
    act(() => handle.focus());
    fireEvent.keyDown(handle, { key: "ArrowUp" });

    expect(names()).toEqual(["국어", "영어", "수학"]);
    expect(screen.getByRole("button", { name: "영어 순서 이동" })).toHaveFocus();
    expect(status).toHaveTextContent("영어, 3개 중 2번째");
  });

  it("순서를 바꾸지 않고 나가면 저장하지 않는다", async () => {
    const commit = vi.fn();
    render(<Harness commit={commit} onDone={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(commit).not.toHaveBeenCalled();
  });
});
