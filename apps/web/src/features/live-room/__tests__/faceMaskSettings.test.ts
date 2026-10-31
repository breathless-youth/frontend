import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FACE_MASK_EMOJIS,
  faceMaskEmojiOf,
  readFaceMaskEmojiId,
  readFaceMaskOn,
  writeFaceMaskEmojiId,
  writeFaceMaskOn,
} from "../faceMaskSettings";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("얼굴 가리기 설정", () => {
  it("처음에는 켜져 있고 첫 번째 이모지를 쓴다", () => {
    expect(readFaceMaskOn()).toBe(true);
    expect(readFaceMaskEmojiId()).toBe(FACE_MASK_EMOJIS[0]!.id);
  });

  it("끈 선택과 고른 이모지를 기억한다", () => {
    const last = FACE_MASK_EMOJIS[FACE_MASK_EMOJIS.length - 1]!;
    writeFaceMaskOn(false);
    writeFaceMaskEmojiId(last.id);
    expect(readFaceMaskOn()).toBe(false);
    expect(readFaceMaskEmojiId()).toBe(last.id);
  });

  it("목록에서 빠진 이모지가 저장돼 있으면 첫 번째로 돌아간다", () => {
    localStorage.setItem("focusmakers.socialFaceMaskEmoji", "removed-emoji");
    expect(readFaceMaskEmojiId()).toBe(FACE_MASK_EMOJIS[0]!.id);
    expect(faceMaskEmojiOf("removed-emoji")).toBe(FACE_MASK_EMOJIS[0]);
  });

  it("목록에 없는 이모지는 첫 번째 이모지로 맞춰 저장한다", () => {
    writeFaceMaskEmojiId("removed-emoji");
    expect(localStorage.getItem("focusmakers.socialFaceMaskEmoji")).toBe(FACE_MASK_EMOJIS[0]!.id);
  });

  it("저장소를 쓸 수 없으면 기본값으로 동작하고 예외를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readFaceMaskOn()).toBe(true);
    expect(readFaceMaskEmojiId()).toBe(FACE_MASK_EMOJIS[0]!.id);
    expect(() => writeFaceMaskOn(false)).not.toThrow();
    expect(() => writeFaceMaskEmojiId("x")).not.toThrow();
  });
});
