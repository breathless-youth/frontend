import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import pencil from "@/assets/points/mascot-pencil.png";

import { RankAvatar } from "../RankAvatar";

describe("RankAvatar", () => {
  it("사진이 없으면 글자 대신 기본 마스코트를 그리고 화면 낭독기에서는 숨긴다", () => {
    const { container } = render(<RankAvatar />);

    expect(container.querySelector("[data-default-mascot]")).not.toBeNull();
    expect(container.textContent).toBe("");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("나도 같은 마스코트를 쓰고 내 표시는 남는다", () => {
    const { container } = render(<RankAvatar me />);

    expect(container.querySelector("[data-default-mascot]")).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute("data-me", "true");
  });

  it("모습을 넘기면 그 마스코트를 소품과 함께 그린다", () => {
    const { container } = render(
      <RankAvatar look={{ id: "pencil", accessories: [{ slot: "head", imageUrl: "/cap.png" }] }} />,
    );

    expect(container.querySelector("[data-slot='mascot-body'] img")).toHaveAttribute("src", pencil);
    expect(container.querySelector("[data-slot='accessory-head']")).toHaveAttribute(
      "src",
      "/cap.png",
    );
  });

  it("원 밖으로 나가는 소품은 잘리게 두고 마스코트는 줄이지 않는다", () => {
    const { container } = render(
      <RankAvatar
        look={{ id: "pencil", accessories: [{ slot: "underfoot", imageUrl: "/mat.png" }] }}
      />,
    );

    // 소품 판은 마스코트 상자보다 사방으로 넓고, 둥근 틀이 넘치는 부분을 자른다.
    const mat = container.querySelector<HTMLElement>("[data-slot='accessory-underfoot']");
    expect(mat?.style.inset.startsWith("-")).toBe(true);
    expect(container.querySelector("[data-slot='avatar']")).toHaveClass("overflow-hidden");
    // 소품이 있어도 마스코트 상자는 소품이 없을 때와 같은 자리, 같은 크기다.
    expect(container.querySelector("[data-default-mascot]")).toHaveClass("p-[14%]");
    expect(container.querySelector("[data-slot='mascot-body']")).toHaveClass("inset-0");
  });
});
