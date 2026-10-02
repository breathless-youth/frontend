import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PAGE_TRANSITION_COMMIT_TIMEOUT_MS,
  pageTransitionFinished,
  slideNavigate,
  usePageTransitionCommit,
} from "@/lib/pageTransition";
import { resetViewTransitionStub, stubViewTransition } from "@/test/viewTransitionStub";

/**
 * 실제 API는 갱신 콜백을 시작 순서와 다르게(비동기로) 부를 수 있다. 이 스텁은 콜백을 즉시
 * 실행하지 않고 캡처해 두어, 테스트가 원하는 순서로 나중에 실행할 수 있게 한다.
 */
function stubViewTransitionDeferred() {
  const callbacks: Array<() => Promise<void> | void> = [];
  const updateDones: Array<Promise<unknown>> = [];
  const resolveUpdateDones: Array<(value: unknown) => void> = [];
  const start = vi.fn((callback: () => Promise<void> | void) => {
    callbacks.push(callback);
    let resolveUpdateDone!: (value: unknown) => void;
    const updateDone = new Promise<unknown>((resolve) => {
      resolveUpdateDone = resolve;
    });
    resolveUpdateDones.push(resolveUpdateDone);
    updateDones.push(updateDone);
    return {
      finished: new Promise<void>(() => {}),
      updateCallbackDone: updateDone,
      ready: Promise.resolve(),
      skipTransition: vi.fn(),
    };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  return {
    start,
    /** index번째로 시작된 전환의 갱신 콜백을 지금 실행한다. */
    runCallback(index: number) {
      resolveUpdateDones[index](callbacks[index]());
    },
    updateDoneAt(index: number) {
      return updateDones[index];
    },
  };
}

/**
 * 겹침·숨김 문서·뷰포트 리사이즈 등으로 브라우저가 전환을 건너뛰면 ready가 거부된다.
 * 거부를 스텁 함수 스코프(모듈 스코프가 아님) 안에서 지연 생성해, 이 스텁을 정의하는
 * 시점이 아니라 실제로 startViewTransition이 불릴 때만 거부가 만들어지게 한다.
 */
function stubViewTransitionSkippedReady() {
  const finished = new Promise<void>(() => {});
  const start = vi.fn((callback: () => Promise<void> | void) => {
    const updateDone = Promise.resolve(callback());
    return {
      finished,
      updateCallbackDone: updateDone,
      ready: Promise.reject(new DOMException("Transition was skipped", "AbortError")),
      skipTransition: vi.fn(),
    };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  return { start };
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: reduce && query.includes("reduce"), media: query })),
  );
}

afterEach(() => {
  resetViewTransitionStub();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("slideNavigate", () => {
  it("View Transitions API가 없으면 전환 없이 바로 이동한다", () => {
    const update = vi.fn();
    slideNavigate("forward", update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
    expect(pageTransitionFinished()).toBeNull();
  });

  it("동작 줄이기 설정이면 API가 있어도 전환 없이 바로 이동한다", () => {
    const { start } = stubViewTransition();
    stubReducedMotion(true);
    const update = vi.fn();
    slideNavigate("forward", update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("방향을 html 속성으로 넘기고 전환이 끝나면 지운다", async () => {
    const { start, finish } = stubViewTransition();
    const update = vi.fn();
    slideNavigate("back", update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.pageTransition).toBe("back");
    const done = pageTransitionFinished();
    expect(done).not.toBeNull();

    finish();
    await done;
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
    expect(pageTransitionFinished()).toBeNull();
  });

  it("갱신 콜백은 라우트가 커밋될 때 풀린다", async () => {
    const { updateDone } = stubViewTransition();
    // usePageTransitionCommit은 실제 App처럼 Routes 바깥(형제)에서 한 번 마운트해야 한다.
    // 이동할 라우트 엘리먼트 안에 두면 라우트 교체와 함께 언마운트돼 새 위치를 관찰하지 못한다.
    function NavButton() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => slideNavigate("forward", () => navigate("/b"))}>
          이동
        </button>
      );
    }
    function Harness() {
      usePageTransitionCommit();
      return (
        <Routes>
          <Route path="/a" element={<NavButton />} />
          <Route path="/b" element={<p>B 화면</p>} />
        </Routes>
      );
    }
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Harness />
      </MemoryRouter>,
    );

    const startedAt = performance.now();
    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    await act(async () => {
      await updateDone();
    });
    expect(screen.getByText("B 화면")).toBeInTheDocument();
    // 타임아웃으로 풀린 것이 아니라 커밋 신호로 풀렸는지 확인한다.
    expect(performance.now() - startedAt).toBeLessThan(PAGE_TRANSITION_COMMIT_TIMEOUT_MS);
  });

  it("이동이 일어나지 않으면 타임아웃으로 풀려 화면이 멈춘 채 남지 않는다", async () => {
    vi.useFakeTimers();
    const { updateDone } = stubViewTransition();
    let settled = false;
    slideNavigate("back", () => {});
    void updateDone().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_COMMIT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("겹치는 전환에서 갱신 콜백이 역순으로 실행돼도 커밋 신호가 둘 다 제때 푼다", async () => {
    const stub = stubViewTransitionDeferred();
    let navigate!: (path: string) => void;
    function NavCapture() {
      navigate = useNavigate();
      return null;
    }
    function Harness() {
      usePageTransitionCommit();
      return (
        <Routes>
          <Route path="/a" element={<NavCapture />} />
          <Route path="/b" element={<p>B 화면</p>} />
        </Routes>
      );
    }
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Harness />
      </MemoryRouter>,
    );

    // 두 전환을 겹쳐서 시작한다. 실제 라우트 이동은 두 번째(index 1) 것만 수행한다.
    slideNavigate("forward", () => {});
    slideNavigate("back", () => navigate("/b"));

    const startedAt = performance.now();
    let firstSettled = false;
    let secondSettled = false;
    void stub.updateDoneAt(0).then(() => {
      firstSettled = true;
    });
    void stub.updateDoneAt(1).then(() => {
      secondSettled = true;
    });

    // 실제 API처럼 콜백 실행 순서가 시작 순서와 다를 수 있다. 역순으로, 그리고 둘 다
    // 라우트 커밋이 끼어들기 전에 실행한다. 동기 act()라야 startTransition 갱신이
    // 곧바로 플러시된다(비동기 act 안에서는 스케줄러 처리가 미뤄진다).
    act(() => {
      stub.runCallback(1);
      stub.runCallback(0);
    });
    await act(async () => {
      await Promise.all([stub.updateDoneAt(0), stub.updateDoneAt(1)]);
    });

    expect(screen.getByText("B 화면")).toBeInTheDocument();
    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);
    // 단일 슬롯이면 나중 전환이 앞 전환의 대기자를 덮어써 400ms 타임아웃을 기다리게 된다.
    expect(performance.now() - startedAt).toBeLessThan(PAGE_TRANSITION_COMMIT_TIMEOUT_MS);
  });

  it("앞 전환이 끝나기 전에 새 전환이 시작되면 앞 전환의 종료가 새 방향을 지우지 않는다", async () => {
    const first = stubViewTransition();
    slideNavigate("forward", () => {});
    const second = stubViewTransition();
    slideNavigate("back", () => {});

    first.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.dataset.pageTransition).toBe("back");

    second.finish();
    await pageTransitionFinished();
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it("전환이 건너뛰어져 ready가 거부돼도 처리되지 않은 거부로 새지 않는다", async () => {
    stubViewTransitionSkippedReady();
    slideNavigate("forward", () => {});
    // 마이크로태스크와 매크로태스크를 한 번씩 흘려보내 거부가 처리될 시간을 준다.
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
