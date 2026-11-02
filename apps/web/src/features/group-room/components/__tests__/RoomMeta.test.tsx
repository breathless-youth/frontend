import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoomMeta } from "../RoomMeta";

describe("RoomMeta", () => {
  it("공개 표시, 시험·목표, 멤버 수를 한 줄에 둔다", () => {
    render(<RoomMeta visibility="public" categoryLabel="공무원" memberCount={4} />);
    expect(screen.getByText("공개")).toBeInTheDocument();
    expect(screen.getByText("공무원")).toBeInTheDocument();
    expect(screen.getByText("멤버 4/6")).toBeInTheDocument();
  });

  it("비공개 그룹은 비공개라고 쓴다", () => {
    render(<RoomMeta visibility="private" categoryLabel="내신" memberCount={5} />);
    expect(screen.getByText("비공개")).toBeInTheDocument();
    expect(screen.getByText("멤버 5/6")).toBeInTheDocument();
  });
});
