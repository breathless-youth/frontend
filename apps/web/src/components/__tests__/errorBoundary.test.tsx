import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/react";

import { ErrorFallback } from "@/components/ErrorFallback";
import { sentryRootOptions } from "@/lib/sentry";

function Bomb(): never {
  throw new Error("render crash");
}

describe("ErrorBoundary + ErrorFallback", () => {
  it("자식이 던지면 폴백을 렌더한다", () => {
    // React가 렌더 에러를 콘솔에 찍는 것을 조용히 한다 — 테스트 출력 오염 방지.
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <Bomb />
      </Sentry.ErrorBoundary>,
    );

    expect(screen.getByText("일시적인 문제가 생겼어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    errorLog.mockRestore();
  });

  /**
   * **이중 전송 가드(BY-372).** 바운더리가 잡은 에러는 바운더리 자신이 전송하고
   * `onUncaughtError`는 타지 않는다(React 19 — caught는 uncaught 훅으로 안 간다).
   * 이중 전송이 생기는 유일한 경로는 누군가 `sentryRootOptions`에 `onCaughtError`를
   * 추가하는 것이다 — 바운더리 전송 + 훅 전송이 겹친다. 그 변경을 여기서 막는다.
   *
   * (전송 횟수를 직접 세지 않는 이유: `vi.mock("@sentry/react")`로 바꾼 `captureException`은
   * 공개 re-export일 뿐이라 ErrorBoundary 내부가 부르는 원본을 가로채지 못한다 — 항상 0회로
   * 보이는 가짜 단언이 된다.)
   */
  it("sentryRootOptions에 onCaughtError가 없다 — 있으면 바운더리와 이중 전송된다", () => {
    expect(sentryRootOptions).not.toHaveProperty("onCaughtError");
    expect(sentryRootOptions).toHaveProperty("onUncaughtError");
  });
});
