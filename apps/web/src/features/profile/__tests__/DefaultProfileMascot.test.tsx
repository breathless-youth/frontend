import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import timiAvatar from "@/assets/mascot/timi-avatar.png";

import { DefaultProfileMascot } from "../DefaultProfileMascot";

describe("DefaultProfileMascot", () => {
  it("그림을 넘기지 않으면 기본 타이미를 그린다", () => {
    const { container } = render(<DefaultProfileMascot />);

    expect(container.querySelector("img[data-default-mascot]")).toHaveAttribute("src", timiAvatar);
  });

  it("그림을 넘기면 그 그림을 그린다", () => {
    const { container } = render(<DefaultProfileMascot src="/custom-mascot.png" />);

    expect(container.querySelector("img[data-default-mascot]")).toHaveAttribute(
      "src",
      "/custom-mascot.png",
    );
  });
});
