import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { flushAmplitude, trackStoreLinkRedirected } from "@/lib/amplitude";

import { DownloadPage } from "../DownloadPage";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStoreLinkRedirected: vi.fn(),
  flushAmplitude: vi.fn(() => Promise.resolve()),
}));

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
// 허용하지 않은 code 쿼리는 목적지에 실리지 않아야 한다.
const SEARCH = "?utm_source=timelapse&utm_medium=share&utm_campaign=timelapse_share&code=0412";

function setDevice(ua: string, touchPoints: number) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
}

function renderAt(search = SEARCH) {
  const go = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/download${search}`]}>
      <DownloadPage go={go} />
    </MemoryRouter>,
  );
  return go;
}

const ORIGINAL_UA = navigator.userAgent;
const ORIGINAL_TOUCH = navigator.maxTouchPoints;

afterEach(() => {
  setDevice(ORIGINAL_UA, ORIGINAL_TOUCH);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("설치 링크 /download", () => {
  it("Android는 UTM을 실은 Play 스토어로 보낸다", async () => {
    setDevice(ANDROID_UA, 5);
    const go = renderAt();

    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(go).toHaveBeenCalledWith(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile&referrer=utm_source%3Dtimelapse%26utm_medium%3Dshare%26utm_campaign%3Dtimelapse_share",
    );
    expect(trackStoreLinkRedirected).toHaveBeenCalledWith("android");
  });

  it("iOS는 App Store 캠페인 링크로 보낸다", async () => {
    setDevice(IPHONE_UA, 5);
    const go = renderAt();

    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(go).toHaveBeenCalledWith(
      "https://apps.apple.com/app/apple-store/id6797220287?pt=129235193&ct=timelapse_share&mt=8",
    );
    expect(trackStoreLinkRedirected).toHaveBeenCalledWith("ios");
  });

  it("PC는 랜딩으로 보내고 스토어 이동 이벤트는 보내지 않는다", async () => {
    setDevice(MAC_UA, 0);
    const go = renderAt();

    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(go).toHaveBeenCalledWith(
      "https://focusmakers.app/?utm_source=timelapse&utm_medium=share&utm_campaign=timelapse_share",
    );
    expect(trackStoreLinkRedirected).not.toHaveBeenCalled();
  });

  it("자동 이동이 막힐 때를 위해 같은 목적지로 가는 링크를 둔다", async () => {
    setDevice(ANDROID_UA, 5);
    const go = renderAt();
    await waitFor(() => expect(go).toHaveBeenCalled());

    expect(screen.getByText("스토어로 이동하는 중…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "직접 이동하기" })).toHaveAttribute(
      "href",
      go.mock.calls[0]?.[0] as string,
    );
  });

  it("StrictMode에서도 이동과 이벤트는 한 번만 일어난다", async () => {
    setDevice(ANDROID_UA, 5);
    const go = vi.fn();
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/download${SEARCH}`]}>
          <DownloadPage go={go} />
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(go).toHaveBeenCalledTimes(1);
    expect(trackStoreLinkRedirected).toHaveBeenCalledTimes(1);
  });

  it("이동 중 문구를 보조기기에 상태로 알린다", () => {
    setDevice(ANDROID_UA, 5);
    renderAt();

    expect(screen.getByRole("status")).toHaveTextContent("스토어로 이동하는 중…");
  });

  it("모아 둔 분석 이벤트를 보낸 뒤 이동한다", async () => {
    // 열자마자 떠나면 이동 이벤트와 UTM 유입 기록이 전송되기 전에 사라진다.
    setDevice(ANDROID_UA, 5);
    let finishFlush = () => {};
    vi.mocked(flushAmplitude).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFlush = resolve;
      }),
    );
    const go = renderAt();

    await act(() => Promise.resolve());
    expect(go).not.toHaveBeenCalled();
    finishFlush();

    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
  });

  it("전송이 늦어도 0.8초 뒤에는 이동한다", async () => {
    vi.useFakeTimers();
    setDevice(ANDROID_UA, 5);
    vi.mocked(flushAmplitude).mockReturnValueOnce(new Promise<void>(() => {}));
    const go = renderAt();

    await act(() => vi.advanceTimersByTimeAsync(799));
    expect(go).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(go).toHaveBeenCalledTimes(1);
  });
});
