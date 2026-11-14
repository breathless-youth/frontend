import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomAvatarFallback } from "../components/RoomAvatarFallback";

describe("RoomAvatarFallback", () => {
  it("사진이 없으면 글자 대신 기본 마스코트를 원형 아바타로 그린다", () => {
    const { container } = render(<RoomAvatarFallback />);
    expect(container.querySelector("[data-default-mascot]")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("타일 아래 닉네임과 겹쳐 읽지 않게 화면 낭독기에서는 숨긴다", () => {
    const { container } = render(<RoomAvatarFallback />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
