import { describe, expect, it } from "vitest";

import { PROCTOR_SPACE, RAIN_SPACE } from "@/test/spaceFixtures";

import { collectTags, imageSections, spaceKey, videoSections } from "../spaceCatalog";
import type { CatalogSpace } from "../spaceCatalogQuery";

const NATURE = { code: "NATURE", name: "자연" };
const RAIN = { code: "RAIN", name: "비" };
const CAFE = { code: "CAFE", name: "카페" };

const space = (
  itemId: number,
  over: Partial<CatalogSpace["selection"]>,
  tags: CatalogSpace["tags"] = [],
): CatalogSpace => ({
  selection: { ...RAIN_SPACE, itemId, ...over },
  name: `공간 ${itemId}`,
  tags,
});

const watch = space(1, { videoMode: "WATCH" }, [NATURE]);
const rain = space(2, {}, [NATURE, RAIN]);
const plain = space(3, {});
const desk = space(4, { assetType: "IMAGE", videoMode: null }, [CAFE]);
const room = space(5, { assetType: "IMAGE", videoMode: null });

describe("spaceKey", () => {
  it("사진은 id, 서버 공간은 상품 id, 심플은 하나다", () => {
    expect(spaceKey({ kind: "photo", photoId: "a" })).toBe("photo:a");
    expect(spaceKey(PROCTOR_SPACE)).toBe("space:41");
    expect(spaceKey({ kind: "simple" })).toBe("simple");
  });
});

describe("videoSections", () => {
  it("분류 섹션이 서버 순서로 오고 분류 없는 영상이 맨 아래 제목 없이 오며 감독 섹션은 따로 없다", () => {
    const sections = videoSections([plain, rain, watch, desk]);

    expect(sections.map((s) => [s.code, s.title])).toEqual([
      ["NATURE", "자연"],
      ["RAIN", "비"],
      ["", null],
    ]);
    expect(sections.flatMap((s) => s.spaces)).not.toContain(desk);
  });

  it("감시 공간도 분류가 붙으면 반복 공간과 같은 분류 섹션에 들어간다", () => {
    const nature = videoSections([watch, rain]).find((s) => s.code === "NATURE");

    expect(nature?.spaces).toEqual([watch, rain]);
  });

  it("분류가 없는 감시 공간은 맨 아래 제목 없는 묶음에 들어간다", () => {
    const untagged = space(6, { videoMode: "WATCH" });

    expect(videoSections([untagged, rain]).at(-1)).toEqual({
      code: "",
      title: null,
      spaces: [untagged],
    });
  });

  it("분류가 여러 개인 공간은 섹션마다 들어간다", () => {
    const sections = videoSections([rain]);

    expect(sections.filter((s) => s.spaces.includes(rain)).map((s) => s.code)).toEqual([
      "NATURE",
      "RAIN",
    ]);
  });
});

describe("imageSections", () => {
  it("그림 공간의 분류 섹션과 제목 없는 묶음이고 빈 섹션은 없다", () => {
    expect(imageSections([desk, room, rain]).map((s) => s.code)).toEqual(["CAFE", ""]);
    expect(imageSections([rain])).toEqual([]);
  });
});

describe("collectTags", () => {
  it("범위 안 공간의 분류를 처음 나온 순서대로 한 번씩 모은다", () => {
    expect(collectTags([rain, watch, desk])).toEqual([NATURE, RAIN, CAFE]);
  });
});
