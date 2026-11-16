import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ItemCutout } from "../ItemCutout";

describe("ItemCutout", () => {
  it("그림을 읽지 못하면 측정이 끝난 뒤 판 전체를 칸에 맞춰 보인다", async () => {
    // 테스트의 jsdom에는 그림을 읽는 decode가 없어 측정이 늘 실패한다.
    const { container } = render(
      <ItemCutout
        item={{ imageUrl: "/cutout/front.png", backImageUrl: "/cutout/back.png" }}
        aspect={6 / 5}
      />,
    );
    const frame = container.querySelector("img")?.parentElement;
    if (!frame) throw new Error("그림 틀이 없다");

    expect(frame).not.toBeVisible();
    await waitFor(() => expect(frame).toBeVisible());
    expect(frame).toHaveStyle({ top: "0px", height: "100%", width: "83.333%", left: "8.333%" });
    // 뒤 그림을 먼저, 앞 그림을 위에 겹친다.
    expect([...frame.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([
      "/cutout/back.png",
      "/cutout/front.png",
    ]);
  });
});
