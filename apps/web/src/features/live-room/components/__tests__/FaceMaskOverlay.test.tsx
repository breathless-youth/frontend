import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CameraFacing } from "@/features/study-session/adapters/cameraAdapter";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";

import type { FaceMaskView } from "../FaceMaskOverlay";
import { FaceMaskOverlay } from "../FaceMaskOverlay";

const spot = (over: Partial<FaceSpot> = {}): FaceSpot => ({
  x: 0.25,
  y: 0.4,
  size: 0.2,
  aspect: 16 / 9,
  visible: true,
  ...over,
});

function setup(mask: FaceMaskView | null, facing: CameraFacing = "front") {
  const view = render(
    <FaceMaskOverlay mask={mask} facing={facing}>
      <video data-testid="video" />
    </FaceMaskOverlay>,
  );
  const mode = () =>
    view.container.querySelector("[data-face-mask]")?.getAttribute("data-face-mask");
  return { ...view, mode };
}

/** 이모지 그림을 불러온 상태로 만든다. */
function loadEmoji() {
  fireEvent.load(screen.getByTestId("face-mask-emoji"));
}

describe("FaceMaskOverlay", () => {
  it("가릴 위치가 없으면 영상을 흐린다", () => {
    const { mode } = setup({ spot: null, emojiUrl: "/face-mask/dog.png" });
    loadEmoji();

    expect(mode()).toBe("blur");
    expect(screen.getByTestId("video")).toBeInTheDocument();
  });

  it("이모지 그림을 불러오기 전에는 위치가 있어도 흐린다", () => {
    const { mode } = setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" });

    expect(mode()).toBe("blur");
  });

  it("그림을 불러오면 원본 프레임 비율 상자 안에 위치를 %로 바꿔 붙인다", () => {
    const { mode } = setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" });
    loadEmoji();

    expect(mode()).toBe("sticker");
    expect(screen.getByTestId("face-mask-frame").style.getPropertyValue("--face-aspect")).toBe(
      String(16 / 9),
    );
    const emoji = screen.getByTestId("face-mask-emoji");
    expect(emoji).toHaveAttribute("src", "/face-mask/dog.png");
    expect(emoji.style.left).toBe("25%");
    expect(emoji.style.top).toBe("40%");
    expect(emoji.style.width).toBe("20%");
  });

  it("얼굴을 못 찾았으면 이모지 없이 선명하게 둔다", () => {
    const { mode } = setup({ spot: spot({ visible: false }), emojiUrl: "/face-mask/dog.png" });
    loadEmoji();

    expect(mode()).toBe("plain");
  });

  it("전면 카메라는 상자를 영상처럼 반전하고 이모지 그림은 다시 뒤집는다", () => {
    setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" }, "front");

    expect(screen.getByTestId("face-mask-frame")).toHaveClass("scale-x-[-1]");
    expect(screen.getByTestId("face-mask-emoji")).toHaveClass("scale-x-[-1]");
  });

  it("후면 카메라는 반전하지 않는다", () => {
    setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" }, "back");

    expect(screen.getByTestId("face-mask-frame")).not.toHaveClass("scale-x-[-1]");
    expect(screen.getByTestId("face-mask-emoji")).not.toHaveClass("scale-x-[-1]");
  });

  it("가리기가 꺼져 있으면 영상만 그대로 둔다", () => {
    const { mode } = setup(null);

    expect(mode()).toBe("plain");
    expect(screen.queryByTestId("face-mask-emoji")).toBeNull();
    expect(screen.getByTestId("video")).toBeInTheDocument();
  });

  // 이모지 위치가 inline style로 DOM에 남아 Session Replay 차단 표식 밖이면 좌표가 기록된다.
  it("좌표를 담은 상자 전체가 Session Replay 차단 표식 안에 있다", () => {
    setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" });
    loadEmoji();

    const frame = screen.getByTestId("face-mask-frame");
    const blocked = screen.getByTestId("face-mask-emoji").closest(".amp-block.sentry-block");
    expect(blocked).not.toBeNull();
    expect(blocked!.contains(frame)).toBe(true);
  });

  it("다른 이모지로 바꾸면 새 그림을 불러올 때까지 흐린다", () => {
    const { mode, rerender } = setup({ spot: spot(), emojiUrl: "/face-mask/dog.png" });
    loadEmoji();

    rerender(
      <FaceMaskOverlay mask={{ spot: spot(), emojiUrl: "/face-mask/cat.png" }} facing="front">
        <video data-testid="video" />
      </FaceMaskOverlay>,
    );
    expect(mode()).toBe("blur");
    loadEmoji();
    expect(mode()).toBe("sticker");
  });
});
