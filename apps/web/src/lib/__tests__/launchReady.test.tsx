import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetLaunchReadyForTests,
  signalLaunchReady,
  useLaunchReadyOutsideHome,
} from "@/lib/launchReady";

const postMessage = vi.fn();

function sentTypes(): string[] {
  return postMessage.mock.calls.map(
    ([raw]) => (JSON.parse(raw as string) as { type: string }).type,
  );
}

function Probe() {
  useLaunchReadyOutsideHome();
  return null;
}

beforeEach(() => {
  __resetLaunchReadyForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
});

afterEach(() => {
  vi.unstubAllGlobals();
  postMessage.mockClear();
});

describe("signalLaunchReady", () => {
  it("문서당 한 번만 보낸다", () => {
    signalLaunchReady();
    signalLaunchReady();

    expect(sentTypes()).toEqual(["launch-ready"]);
  });
});

describe("useLaunchReadyOutsideHome", () => {
  it("홈 밖의 화면으로 시작하면 바로 보낸다", () => {
    render(
      <MemoryRouter initialEntries={["/records"]}>
        <Probe />
      </MemoryRouter>,
    );

    expect(sentTypes()).toEqual(["launch-ready"]);
  });

  it.each(["/home", "/onboarding", "/room/7"])(
    "%s로 시작하면 화면이 스스로 보내도록 여기서는 보내지 않는다",
    (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Probe />
        </MemoryRouter>,
      );

      expect(sentTypes()).toEqual([]);
    },
  );
});
