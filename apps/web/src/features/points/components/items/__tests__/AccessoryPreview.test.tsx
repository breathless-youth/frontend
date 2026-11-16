import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ShopItem } from "../../../types";
import { AccessoryPreview } from "../AccessoryPreview";

function accessory(slot: ShopItem["slot"], extra: Partial<ShopItem> = {}): ShopItem {
  return {
    id: `acc-${slot}`,
    kind: "accessory",
    name: "소품",
    imageUrl: `/${slot}.png`,
    acquire: { type: "price", price: 150 },
    owned: true,
    inUse: true,
    mascotId: "stopwatch",
    slot,
    ...extra,
  };
}

const shadow = (container: HTMLElement) => container.querySelector('[data-slot="preview-shadow"]');

describe("AccessoryPreview 바닥 그림자", () => {
  it("발밑 소품이 없으면 발 아래에 그림자를 둔다", () => {
    const { container } = render(
      <AccessoryPreview mascotId="stopwatch" item={null} worn={[accessory("head")]} />,
    );
    expect(shadow(container)).not.toBeNull();
  });

  it("발밑 소품을 끼고 있으면 그 소품이 바닥이라 그림자를 그리지 않는다", () => {
    const { container } = render(
      <AccessoryPreview mascotId="stopwatch" item={null} worn={[accessory("underfoot")]} />,
    );
    expect(shadow(container)).toBeNull();
  });

  it("발밑 소품을 미리 입혀 볼 때도 그림자를 그리지 않는다", () => {
    const { container } = render(
      <AccessoryPreview
        mascotId="stopwatch"
        item={accessory("underfoot", { owned: false, inUse: false })}
        worn={[]}
      />,
    );
    expect(shadow(container)).toBeNull();
  });
});

describe("AccessoryPreview 이름표", () => {
  it("그릴 것이 없는 소품은 이름표를 두고, 배경은 다크에서도 맞는 테마 색이다", () => {
    render(
      <AccessoryPreview
        mascotId="stopwatch"
        item={accessory("head", { name: "왕관", imageUrl: null, owned: false, inUse: false })}
        worn={[]}
      />,
    );

    const label = screen.getByText("왕관 미리 보기");
    // 흰색으로 고정하면 다크에서 회색 판처럼 떠 보인다.
    expect(label.className).not.toMatch(/bg-white/);
    expect(label).toHaveClass("bg-muted/70");
  });
});
