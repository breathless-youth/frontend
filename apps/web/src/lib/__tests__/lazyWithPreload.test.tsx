import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { lazyWithPreload } from "@/lib/lazyWithPreload";

const reportHandled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sentry", () => ({ reportHandled }));

afterEach(() => reportHandled.mockReset());

function Sheet({ open }: { open: boolean }) {
  return <p>{open ? "열림" : "닫힘"}</p>;
}

describe("lazyWithPreload", () => {
  it("미리 받은 뒤 열면 다시 받지 않고 바로 그린다", async () => {
    const load = vi.fn(() => Promise.resolve(Sheet));
    const { LazySheet, preload } = lazyWithPreload(load);

    await preload();
    render(<LazySheet open />);

    expect(screen.getByText("열림")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("닫혀 있는 동안은 받지 않고, 받기 전에 열면 받은 뒤 그린다", async () => {
    const load = vi.fn(() => Promise.resolve(Sheet));
    const { LazySheet } = lazyWithPreload(load);

    const view = render(<LazySheet open={false} />);
    expect(load).not.toHaveBeenCalled();

    view.rerender(<LazySheet open />);

    expect(await screen.findByText("열림")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("닫혀도 받은 시트를 남겨 닫히는 모습을 그린다", async () => {
    const { LazySheet } = lazyWithPreload(() => Promise.resolve(Sheet));

    const view = render(<LazySheet open />);
    await screen.findByText("열림");
    view.rerender(<LazySheet open={false} />);

    expect(screen.getByText("닫힘")).toBeInTheDocument();
  });

  it("첫 받기에 실패하면 아무것도 그리지 않고 알린 뒤, 다음에 열 때 다시 받는다", async () => {
    const error = new Error("chunk");
    const load = vi
      .fn<() => Promise<typeof Sheet>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(Sheet);
    const { LazySheet } = lazyWithPreload(load);

    const view = render(<LazySheet open />);
    await act(async () => {});

    expect(view.container).toBeEmptyDOMElement();
    expect(reportHandled).toHaveBeenCalledWith(error, "lazy_sheet_load");

    view.rerender(<LazySheet open={false} />);
    view.rerender(<LazySheet open />);

    expect(await screen.findByText("열림")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("받기에 실패하면 호출부가 시트를 닫힌 것으로 처리하도록 그때의 props로 알린다", async () => {
    const onLoadError = vi.fn();
    const { LazySheet } = lazyWithPreload(() => Promise.reject(new Error("chunk")), {
      onLoadError,
    });

    render(<LazySheet open />);
    await act(async () => {});

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(onLoadError).toHaveBeenCalledWith({ open: true });
  });

  it("따로 넘긴 처리가 없으면 받기에 실패했을 때 onOpenChange(false)로 시트를 닫아 다시 열 수 있게 한다", async () => {
    const onOpenChange = vi.fn();
    const { LazySheet } = lazyWithPreload<{ open: boolean; onOpenChange: (open: boolean) => void }>(
      () => Promise.reject(new Error("chunk")),
    );

    render(<LazySheet open onOpenChange={onOpenChange} />);

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("미리 받기가 실패해도 던지지 않고 알리지도 않는다", async () => {
    const { preload } = lazyWithPreload(() => Promise.reject(new Error("chunk")));

    await expect(preload()).resolves.toBeUndefined();
    expect(reportHandled).not.toHaveBeenCalled();
  });
});
