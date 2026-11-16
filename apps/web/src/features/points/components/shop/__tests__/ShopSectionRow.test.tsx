import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ShopItem } from "../../../types";
import { ShopSectionRow } from "../ShopSectionRow";

const base = { acquire: { type: "price", price: 300 }, owned: false, inUse: false } as const;

function cardPictures(name: string) {
  const card = screen.getByRole("button", { name: new RegExp(name) });
  return [...card.querySelectorAll("img")];
}

describe("ShopSectionRow", () => {
  it("소품은 투명한 판을 잘라 소품만 그림 칸에 크게 그리고 측정하는 동안은 숨긴다", async () => {
    const items: ShopItem[] = [
      {
        ...base,
        id: "acc-wings",
        kind: "accessory",
        name: "망토",
        mascotId: "book",
        slot: "wings",
        imageUrl: "/shop-row/straps.png",
        backImageUrl: "/shop-row/cape.png",
      },
    ];
    render(<ShopSectionRow title="부기 소품" items={items} onOpen={vi.fn()} />);

    const pictures = cardPictures("망토");
    // 뒤 그림이 본체인 소품도 무엇인지 보이게 소품 화면 격자처럼 뒤 그림부터 겹친다.
    expect(pictures.map((img) => img.getAttribute("src"))).toEqual([
      "/shop-row/cape.png",
      "/shop-row/straps.png",
    ]);
    const frame = pictures[0].parentElement;
    if (!frame) throw new Error("그림 틀이 없다");
    expect(frame).not.toBeVisible();
    // 테스트의 jsdom은 그림을 읽지 못해 측정이 끝나면 판 전체를 칸에 맞춰 보인다.
    await waitFor(() => expect(frame).toBeVisible());
  });

  it("타이머 배경은 그림 칸을 꽉 채운 한 장으로 그린다", () => {
    const items: ShopItem[] = [
      {
        ...base,
        id: "bg-sea",
        kind: "timerBackground",
        name: "바닷가",
        imageUrl: "/shop-row/sea.png",
      },
    ];
    render(<ShopSectionRow title="타이머 배경" items={items} dark onOpen={vi.fn()} />);

    const pictures = cardPictures("바닷가");
    expect(pictures).toHaveLength(1);
    expect(pictures[0]).toHaveAttribute("src", "/shop-row/sea.png");
    expect(pictures[0]).toBeVisible();
  });
});
