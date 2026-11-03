import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useTogetherSeconds } from "../useTogetherSeconds";

afterEach(() => {
  vi.useRealTimers();
});

it("카메라를 켠 다른 멤버가 있는 동안만 센다", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: true, othersWithCamera: 1 },
  });
  vi.advanceTimersByTime(30_000);
  rerender({ counting: true, othersWithCamera: 0 });
  vi.advanceTimersByTime(60_000);
  rerender({ counting: true, othersWithCamera: 2 });
  vi.advanceTimersByTime(10_000);
  expect(result.current()).toBe(40);
});

it("카메라를 켠 다른 멤버가 없으면 세지 않는다", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTogetherSeconds({ counting: true, othersWithCamera: 0 }));
  vi.advanceTimersByTime(60_000);
  expect(result.current()).toBe(0);
});

it("내가 멈춘 동안은 세지 않는다", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: false, othersWithCamera: 3 },
  });
  vi.advanceTimersByTime(60_000);
  rerender({ counting: true, othersWithCamera: 3 });
  vi.advanceTimersByTime(5_000);
  expect(result.current()).toBe(5);
});

it("함께인 사이 멤버 수만 바뀌면 이어서 세고 다시 그려도 읽는 함수는 같다", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: true, othersWithCamera: 1 },
  });
  const read = result.current;
  vi.advanceTimersByTime(20_000);
  rerender({ counting: true, othersWithCamera: 3 });
  vi.advanceTimersByTime(20_000);
  expect(result.current).toBe(read);
  expect(read()).toBe(40);
});

it("화면이 멈춰 타이머가 돌지 않아도 벽시계 차이로 센다", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTogetherSeconds({ counting: true, othersWithCamera: 1 }));
  // 백그라운드에서 타이머가 멈춘 웹뷰처럼 타이머는 돌리지 않고 시계만 건너뛴다.
  vi.setSystemTime(Date.now() + 90_000);
  expect(result.current()).toBe(90);
});
