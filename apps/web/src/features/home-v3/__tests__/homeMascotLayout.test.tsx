import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { HomePlannerShortcut } from "../HomeShortcuts";
import { HomeStudyCard } from "../HomeStudyCard";

afterEach(cleanup);

it("타이미에게 세트옷을 입혀도 홈의 기본 그림과 배치가 유지된다", () => {
  const { container, rerender } = render(
    <HomeStudyCard stats={{ status: "pending" }}>{null}</HomeStudyCard>,
  );
  const frame = container.querySelector(".home-v3-clock");
  const body = container.querySelector('img[src*="mascot-clock"]');
  expect(frame).toBeInTheDocument();
  expect(body).toBeInTheDocument();

  rerender(
    <HomeStudyCard
      stats={{ status: "pending" }}
      accessories={[{ slot: "set", imageUrl: "/hero.webp", backImageUrl: "/cape.webp" }]}
    >
      {null}
    </HomeStudyCard>,
  );

  expect(container.querySelector(".home-v3-clock")).toBe(frame);
  expect(container.querySelector('img[src*="mascot-clock"]')).toBe(body);
  expect(frame?.querySelector('img[src="/hero.webp"]')).toBeInTheDocument();
  expect(frame?.querySelector('img[src="/cape.webp"]')).toBeInTheDocument();
});

it("플래니에게 모자를 씌워도 바로가기의 기본 그림과 배치가 유지된다", () => {
  const onOpen = vi.fn();
  const { container, rerender } = render(<HomePlannerShortcut onOpen={onOpen} />);
  const frame = container.querySelector(".home-v3-notebook");
  const body = container.querySelector('img[src*="mascot-notebook"]');
  expect(frame).toBeInTheDocument();
  expect(body).toBeInTheDocument();

  rerender(
    <HomePlannerShortcut onOpen={onOpen} accessories={[{ slot: "head", imageUrl: "/hat.webp" }]} />,
  );

  expect(container.querySelector(".home-v3-notebook")).toBe(frame);
  expect(container.querySelector('img[src*="mascot-notebook"]')).toBe(body);
  expect(frame?.querySelector('img[src="/hat.webp"]')).toBeInTheDocument();
});
