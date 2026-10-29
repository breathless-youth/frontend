import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubImageLoad } from "@/test/imageStub";

import { Avatar, AvatarFallback, AvatarImage } from "../avatar";

function renderAvatar(src?: string, onLoadingStatusChange = vi.fn()) {
  return render(
    <Avatar aria-hidden="true">
      {src ? <AvatarImage src={src} onLoadingStatusChange={onLoadingStatusChange} /> : null}
      <AvatarFallback>커</AvatarFallback>
    </Avatar>,
  );
}

describe("Avatar", () => {
  it("사진 주소가 없으면 이니셜을 보여 준다", () => {
    const { container } = renderAvatar();

    expect(screen.getByText("커")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("사진이 로드되면 이니셜 대신 빈 alt의 사진을 보여 준다", async () => {
    stubImageLoad("load");
    const { container } = renderAvatar("/avatars/a.jpg");

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute("src", "/avatars/a.jpg"),
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.queryByText("커")).toBeNull();
  });

  it("사진에 Amplitude 화면 재생 차단 표식(amp-block)을 붙인다", async () => {
    stubImageLoad("load");
    const { container } = renderAvatar("/avatars/a.jpg");

    await waitFor(() => expect(container.querySelector("img")).toHaveClass("amp-block"));
  });

  it("사진 로드가 실패하면 이니셜을 그대로 보여 준다", async () => {
    stubImageLoad("error");
    const onLoadingStatusChange = vi.fn();
    const { container } = renderAvatar("/avatars/broken.jpg", onLoadingStatusChange);

    await waitFor(() => expect(onLoadingStatusChange).toHaveBeenCalledWith("error"));
    expect(screen.getByText("커")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
