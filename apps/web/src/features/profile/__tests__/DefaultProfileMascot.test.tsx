import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import timiAvatar from "@/assets/mascot/timi-avatar.png";
import lamp from "@/assets/points/mascot-lamp.png";

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

  it("모습을 넘기면 그 마스코트를 소품과 함께 그린다", () => {
    const { container } = render(
      <DefaultProfileMascot
        look={{ id: "lamp", accessories: [{ slot: "face", imageUrl: "/glasses.png" }] }}
      />,
    );

    const figure = container.querySelector("[data-default-mascot]");
    expect(figure?.querySelector("[data-slot='mascot-body'] img")).toHaveAttribute("src", lamp);
    expect(figure?.querySelector("[data-slot='accessory-face']")).toHaveAttribute(
      "src",
      "/glasses.png",
    );
  });

  it("고른 마스코트는 기본 타이미 그림과 같은 구도로 크게, 기울여 넣는다", () => {
    const { container } = render(
      <DefaultProfileMascot look={{ id: "stopwatch", accessories: [] }} />,
    );

    const frame = container.querySelector<HTMLElement>("[data-mascot-frame]");
    expect(frame?.style.width).toBe("128.16%");
    expect(frame?.style.transform).toBe("rotate(-10deg)");
    // 눈 사이 가운데를 축으로 돌리고, 그 점이 원의 같은 자리에 오게 민다.
    expect(frame?.style.transformOrigin).toBe("49.52% 47.05%");
    expect(frame?.style.left).toBe("-13.7%");
    expect(frame?.style.top).toBe("-5.54%");
  });

  it("눈 높이가 다른 마스코트도 눈이 원의 같은 자리에 온다", () => {
    const { container } = render(
      <DefaultProfileMascot look={{ id: "padlock", accessories: [] }} />,
    );

    const frame = container.querySelector<HTMLElement>("[data-mascot-frame]");
    expect(frame?.style.transformOrigin).toBe("49.7% 52.44%");
    expect(frame?.style.top).toBe("-12.45%");
  });
});
