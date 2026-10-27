import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Avatar, AvatarFallback, AvatarImage } from "../avatar";

let outcome: "load" | "error" = "load";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  crossOrigin: string | null = null;
  set src(_value: string) {
    queueMicrotask(() => (outcome === "load" ? this.onload?.() : this.onerror?.()));
  }
}

const RealImage = window.Image;

beforeEach(() => {
  window.Image = FakeImage as unknown as typeof Image;
});

afterEach(() => {
  window.Image = RealImage;
  outcome = "load";
});

function renderAvatar(src?: string) {
  return render(
    <Avatar aria-hidden="true">
      {src && <AvatarImage src={src} alt="" />}
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

  it("사진이 로드되면 이니셜 대신 사진을 보여 준다", async () => {
    const { container } = renderAvatar("/avatars/a.jpg");

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute("src", "/avatars/a.jpg"),
    );
    expect(screen.queryByText("커")).toBeNull();
  });

  it("사진 로드가 실패하면 이니셜을 그대로 보여 준다", async () => {
    outcome = "error";
    const { container } = renderAvatar("/avatars/broken.jpg");

    await act(async () => {});

    expect(screen.getByText("커")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
