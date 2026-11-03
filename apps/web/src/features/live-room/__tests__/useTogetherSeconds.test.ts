import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createMockSystemPauseSource } from "@/features/study-session/adapters/systemPauseSource";

import { useTogetherSeconds } from "../useTogetherSeconds";

afterEach(() => {
  vi.useRealTimers();
});

it("카메라를 켠 다른 멤버가 있는 동안만 센다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: true, othersWithCamera: 1, systemPause },
  });
  vi.advanceTimersByTime(30_000);
  rerender({ counting: true, othersWithCamera: 0, systemPause });
  vi.advanceTimersByTime(60_000);
  rerender({ counting: true, othersWithCamera: 2, systemPause });
  vi.advanceTimersByTime(10_000);
  expect(result.current()).toBe(40);
});

it("카메라를 켠 다른 멤버가 없으면 세지 않는다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result } = renderHook(() =>
    useTogetherSeconds({ counting: true, othersWithCamera: 0, systemPause }),
  );
  vi.advanceTimersByTime(60_000);
  expect(result.current()).toBe(0);
});

it("내가 멈춘 동안은 세지 않는다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: false, othersWithCamera: 3, systemPause },
  });
  vi.advanceTimersByTime(60_000);
  rerender({ counting: true, othersWithCamera: 3, systemPause });
  vi.advanceTimersByTime(5_000);
  expect(result.current()).toBe(5);
});

it("함께인 사이 멤버 수만 바뀌면 이어서 세고 다시 그려도 읽는 함수는 같다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: true, othersWithCamera: 1, systemPause },
  });
  const read = result.current;
  vi.advanceTimersByTime(20_000);
  rerender({ counting: true, othersWithCamera: 3, systemPause });
  vi.advanceTimersByTime(20_000);
  expect(result.current).toBe(read);
  expect(read()).toBe(40);
});

it("보이는 채로 타이머가 멈춰도 벽시계 차이로 센다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result } = renderHook(() =>
    useTogetherSeconds({ counting: true, othersWithCamera: 1, systemPause }),
  );
  // 화면은 보이는데 타이머가 늦게 도는 웹뷰처럼 타이머는 돌리지 않고 시계만 건너뛴다.
  vi.setSystemTime(Date.now() + 90_000);
  expect(result.current()).toBe(90);
});

it("화면이 가려진 뒤 웹뷰가 얼어도 가려진 시간은 세지 않는다", () => {
  vi.useFakeTimers();
  const systemPause = createMockSystemPauseSource();
  const { result, rerender } = renderHook((props) => useTogetherSeconds(props), {
    initialProps: { counting: true, othersWithCamera: 1, systemPause },
  });
  vi.advanceTimersByTime(30_000);

  // 가려진 신호는 왔지만 멈춤을 그리기 전에 웹뷰가 10분 얼었다가 깨어난다.
  act(() => systemPause.leave());
  vi.setSystemTime(Date.now() + 600_000);
  rerender({ counting: false, othersWithCamera: 1, systemPause });
  expect(result.current()).toBe(30);

  // 돌아와 다시 측정을 시작하면 새 구간부터 이어서 센다.
  rerender({ counting: true, othersWithCamera: 1, systemPause });
  vi.advanceTimersByTime(5_000);
  expect(result.current()).toBe(35);
});
