import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomAvatarFallback } from "../components/RoomAvatarFallback";

describe("RoomAvatarFallback", () => {
  it("닉네임 첫 글자를 원형 아바타로 그린다", () => {
    render(<RoomAvatarFallback nickname="가나다" />);
    expect(screen.getByText("가")).toBeInTheDocument();
  });

  it("닉네임이 없으면 빈 글자여도 깨지지 않는다", () => {
    const { container } = render(<RoomAvatarFallback nickname={undefined} />);
    expect(container.firstChild).not.toBeNull();
  });
});
