import { colors } from "@focusmakers/design-tokens";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRoomDocumentBackground } from "../useRoomDocumentBackground";

function Room() {
  useRoomDocumentBackground();
  return null;
}

describe("useRoomDocumentBackground", () => {
  it("방에 있는 동안 문서 배경을 방 색으로 두고 나가면 되돌린다", () => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = colors.bg.base.dark;
    const roomColor = probe.style.backgroundColor;

    const { unmount } = render(<Room />);
    expect(document.documentElement.style.backgroundColor).toBe(roomColor);
    expect(document.body.style.backgroundColor).toBe(roomColor);

    unmount();
    expect(document.documentElement.style.backgroundColor).toBe("");
    expect(document.body.style.backgroundColor).toBe("");
  });
});
