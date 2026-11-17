import { describe, expect, it } from "vitest";

import { filterSpaces, spaceKey, type SpaceItem } from "../spaceCatalog";

const ITEMS: SpaceItem[] = [
  { selection: { kind: "proctor" }, name: "독서실 감독관", tab: "video", category: "watch" },
  { selection: { kind: "photo", photoId: "a" }, name: "내 사진 1", tab: "image", category: "mine" },
  { selection: { kind: "simple" }, name: "심플", tab: "image", category: "simple" },
];

describe("filterSpaces", () => {
  it("탭에 속한 공간만 남긴다", () => {
    expect(
      filterSpaces(ITEMS, { tab: "image", category: "all", text: "" }).map((i) => i.name),
    ).toEqual(["내 사진 1", "심플"]);
  });

  it("분류 칩이 전체가 아니면 그 분류만 남긴다", () => {
    expect(filterSpaces(ITEMS, { tab: "video", category: "watch", text: "" })).toHaveLength(1);
    expect(filterSpaces(ITEMS, { tab: "image", category: "mine", text: "" })).toHaveLength(1);
  });

  it("검색어는 앞뒤 공백을 무시하고 대소문자 없이 이름에 포함되는지 본다", () => {
    expect(filterSpaces(ITEMS, { tab: "video", category: "all", text: "  감독 " })).toHaveLength(1);
    expect(filterSpaces(ITEMS, { tab: "video", category: "all", text: "심플" })).toHaveLength(0);
    expect(
      filterSpaces([{ ...ITEMS[0]!, name: "Study hall proctor" }], {
        tab: "video",
        category: "all",
        text: "PROCTOR",
      }),
    ).toHaveLength(1);
  });
});

describe("spaceKey", () => {
  it("같은 공간은 같은 키를 주고 다른 사진은 다른 키를 준다", () => {
    expect(spaceKey({ kind: "photo", photoId: "a" })).toBe("photo:a");
    expect(spaceKey({ kind: "photo", photoId: "b" })).not.toBe("photo:a");
    expect(spaceKey({ kind: "proctor" })).toBe("proctor");
  });
});
