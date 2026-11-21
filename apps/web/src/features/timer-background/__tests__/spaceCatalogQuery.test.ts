import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDecorations, getShopItems } from "@/lib/pointsApi";
import { getProfile } from "@/lib/profileApi";
import { queryClient } from "@/lib/queryClient";
import { PROCTOR_SPACE, RAIN_ITEM, RAIN_SPACE, shopSpace } from "@/test/spaceFixtures";

import {
  fetchAppliedSpace,
  isMemberUser,
  spaceCatalogQuery,
  toCatalogSpace,
} from "../spaceCatalogQuery";

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(),
  getDecorations: vi.fn(),
}));

vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));

const member = () => vi.mocked(getProfile).mockResolvedValue({ loginProvider: "KAKAO" } as never);
const guest = () => vi.mocked(getProfile).mockResolvedValue({} as never);
const decorations = (timerBackground: unknown) =>
  vi
    .mocked(getDecorations)
    .mockResolvedValue({ selectedMascotCode: "BOOK", accessories: [], timerBackground } as never);

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe("toCatalogSpace", () => {
  it("가진 타이머 배경만 공간으로 고른다", () => {
    expect(toCatalogSpace(shopSpace({ owned: false }))).toBeNull();
    expect(toCatalogSpace(shopSpace({ category: "MASCOT_ACCESSORY" }))).toBeNull();
  });

  it("공간 정보가 없는 상품은 뺀다", () => {
    expect(toCatalogSpace(shopSpace({ assetKey: null }))).toBeNull();
    expect(toCatalogSpace(shopSpace({ assetType: null }))).toBeNull();
    const { assetKey: _key, assetType: _type, videoMode: _mode, ...old } = shopSpace();
    expect(toCatalogSpace(old)).toBeNull();
  });

  it("모르는 종류와 영상 방식은 뺀다", () => {
    expect(toCatalogSpace(shopSpace({ assetType: "AUDIO" }))).toBeNull();
    expect(toCatalogSpace(shopSpace({ videoMode: "SLIDESHOW" }))).toBeNull();
    expect(toCatalogSpace(shopSpace({ videoMode: null }))).toBeNull();
  });

  it("이름과 분류를 옮기고 분류가 없는 응답은 빈 배열이다", () => {
    expect(toCatalogSpace(RAIN_ITEM)).toEqual({
      selection: RAIN_SPACE,
      name: "비 오는 창가",
      tags: [{ code: "NATURE", name: "자연" }],
    });
    const { tags: _tags, ...withoutTags } = shopSpace();
    expect(toCatalogSpace(withoutTags)?.tags).toEqual([]);
  });
});

describe("spaceCatalogQuery", () => {
  it("공간 목록 조회는 상품 목록에서 공간만 남긴다", async () => {
    vi.mocked(getShopItems).mockResolvedValue({
      items: [shopSpace(), RAIN_ITEM, shopSpace({ id: 7, category: "MASCOT_ACCESSORY" })],
    });

    const list = await queryClient.fetchQuery(spaceCatalogQuery(1));

    expect(list.map((space) => space.selection.itemId)).toEqual([41, 42]);
  });
});

describe("fetchAppliedSpace", () => {
  it("비회원이면 적용한 공간을 묻지 않는다", async () => {
    guest();

    expect(await fetchAppliedSpace(1)).toBeUndefined();
    expect(getDecorations).not.toHaveBeenCalled();
  });

  it("회원이면 적용한 공간을 선택 값으로 바꾸고 기본 배경이면 null이다", async () => {
    member();
    decorations({
      itemId: 41,
      code: "SPACE_PROCTOR",
      imageUrl: null,
      assetKey: "watcher/9c8d9f19",
      assetType: "VIDEO",
      videoMode: "WATCH",
    });
    expect(await fetchAppliedSpace(1)).toEqual(PROCTOR_SPACE);

    queryClient.clear();
    decorations(null);
    expect(await fetchAppliedSpace(1)).toBeNull();
  });

  it("회원인데 조회가 실패하면 undefined다", async () => {
    member();
    vi.mocked(getDecorations).mockRejectedValue(new Error("offline"));

    expect(await fetchAppliedSpace(1)).toBeUndefined();
  });

  it("사용자가 없거나 프로필을 받지 못하면 비회원이다", async () => {
    expect(await isMemberUser(null)).toBe(false);
    vi.mocked(getProfile).mockRejectedValue(new Error("offline"));
    expect(await isMemberUser(1)).toBe(false);
  });
});
