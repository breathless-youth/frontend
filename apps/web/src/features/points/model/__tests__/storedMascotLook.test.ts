import { afterEach, describe, expect, it, vi } from "vitest";

import type { MascotLook } from "@/components/mascot/types";

import { forgetMascotLook, recallMascotLook, rememberMascotLook } from "../storedMascotLook";

const KEY = "focusmakers:my-mascot-look.v1";

const PENCIL: MascotLook = {
  id: "pencil",
  accessories: [
    { slot: "head", imageUrl: "/beret.png" },
    {
      slot: "effect",
      backImageUrl: "/aura.png",
      effectPieces: [
        {
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4,
          motion: "flash",
          sprite: { url: "/fire.webp", frames: 12, durationMs: 1200 },
        },
      ],
    },
  ],
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("storedMascotLook", () => {
  it("남긴 사용자에게 남긴 모습을 그대로 돌려준다", () => {
    rememberMascotLook(7, PENCIL);

    expect(recallMascotLook(7)).toEqual(PENCIL);
  });

  it("고른 마스코트가 없다는 답도 null로 남겨 돌려준다", () => {
    rememberMascotLook(7, null);

    expect(recallMascotLook(7)).toBeNull();
  });

  it("다른 사용자가 남긴 모습은 돌려주지 않는다", () => {
    rememberMascotLook(8, PENCIL);

    expect(recallMascotLook(7)).toBeUndefined();
  });

  it("새 사용자의 모습을 남기면 앞 사용자의 모습은 덮인다", () => {
    rememberMascotLook(8, PENCIL);
    rememberMascotLook(7, { id: "lamp", accessories: [] });

    expect(recallMascotLook(8)).toBeUndefined();
    expect(recallMascotLook(7)).toEqual({ id: "lamp", accessories: [] });
  });

  it("지우면 더는 돌려주지 않는다", () => {
    rememberMascotLook(7, PENCIL);
    forgetMascotLook();

    expect(recallMascotLook(7)).toBeUndefined();
  });

  it.each([
    ["JSON이 아닌 값", "not json"],
    ["모르는 마스코트", JSON.stringify({ userId: 7, look: { id: "robot", accessories: [] } })],
    [
      "모르는 칸",
      JSON.stringify({ userId: 7, look: { id: "pencil", accessories: [{ slot: "tail" }] } }),
    ],
    [
      "주소가 문자열이 아닌 소품",
      JSON.stringify({
        userId: 7,
        look: { id: "pencil", accessories: [{ slot: "head", imageUrl: 3 }] },
      }),
    ],
    [
      "자리가 숫자가 아닌 효과 조각",
      JSON.stringify({
        userId: 7,
        look: {
          id: "pencil",
          accessories: [{ slot: "effect", effectPieces: [{ x: "0", motion: "float" }] }],
        },
      }),
    ],
    ["사용자 번호가 문자열", JSON.stringify({ userId: "7", look: PENCIL })],
  ])("%s은 읽지 않는다", (_, raw) => {
    localStorage.setItem(KEY, raw);

    expect(recallMascotLook(7)).toBeUndefined();
  });

  it("저장소를 쓸 수 없는 기기에서도 오류 없이 아무것도 남기지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => rememberMascotLook(7, PENCIL)).not.toThrow();
    expect(recallMascotLook(7)).toBeUndefined();
    expect(() => forgetMascotLook()).not.toThrow();
  });
});
