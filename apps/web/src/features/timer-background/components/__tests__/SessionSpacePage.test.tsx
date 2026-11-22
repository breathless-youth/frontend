import "fake-indexeddb/auto";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import {
  trackSessionSpacePhotoFailed,
  trackSessionSpacePreviewOpened,
  trackSessionSpacePhotoLimitReached,
  trackSessionSpaceTabSwitched,
  trackTimerBackgroundApplied,
  trackTimerBackgroundPhotoAdded,
  trackTimerBackgroundPhotoRemoved,
} from "@/lib/amplitude";
import { queryClient } from "@/lib/queryClient";
import { showCtaToast } from "@/lib/toast";
import { PROCTOR_SPACE, RAIN_ITEM, RAIN_SPACE, shopSpace } from "@/test/spaceFixtures";

import { prepareBackgroundPhoto } from "../../prepareBackgroundPhoto";
import type { TimerBackgroundSelection } from "../../timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "../../timerBackgroundPhotos";
import { SessionSpacePage, type SessionSpacePageProps } from "../SessionSpacePage";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionSpaceTabSwitched: vi.fn(),
  trackSessionSpacePreviewOpened: vi.fn(),
  trackTimerBackgroundApplied: vi.fn(),
  trackTimerBackgroundPhotoAdded: vi.fn(),
  trackTimerBackgroundPhotoRemoved: vi.fn(),
  trackSessionSpacePhotoFailed: vi.fn(),
  trackSessionSpacePhotoLimitReached: vi.fn(),
}));

const shop = vi.hoisted(() => ({ items: [] as unknown[], fail: false }));

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(async () => {
    if (shop.fail) throw new Error("offline");
    return { items: shop.items };
  }),
}));

vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showCtaToast: vi.fn(),
}));

vi.mock("../../prepareBackgroundPhoto", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prepareBackgroundPhoto: vi.fn(),
}));

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };

async function openImageTab() {
  await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
  await screen.findByText(/^\d\/3$/);
}

function renderPage(over: Partial<SessionSpacePageProps> = {}) {
  const props: SessionSpacePageProps = {
    open: true,
    onOpenChange: vi.fn(),
    container: document.body,
    returnFocus: () => null,
    landscape: false,
    userId: 1,
    applied: { kind: "simple" },
    onApply: vi.fn(async (_: TimerBackgroundSelection, _options?: { localOnly?: boolean }) => true),
    volume: 80,
    onVolumeChange: vi.fn(),
    onVolumeCommit: vi.fn(),
    onToggleMute: vi.fn(),
    loopSoundAvailable: false,
    ...over,
  };
  render(<SessionSpacePage {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  shop.items = [shopSpace()];
  shop.fail = false;
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  queryClient.clear();
});

describe("SessionSpacePage", () => {
  it("영상 탭으로 열리고 서버 목록의 감독 공간 타일과 전체·감독 칩을 보이며 칩과 겹치는 섹션 제목은 없다", async () => {
    renderPage();

    expect(screen.getByRole("dialog", { name: "공간" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "영상", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "독서실 감독관" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "감독", pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "감독" })).not.toBeInTheDocument();
  });

  it("가로에서도 대화상자 이름과 제목이 하나씩이고 탭이 자기 목록을 가리키며 칩과 볼륨이 보인다", async () => {
    renderPage({ landscape: true });

    expect(screen.getByRole("dialog", { name: "공간" })).toBeInTheDocument();
    expect(screen.getAllByText("공간", { exact: true })).toHaveLength(1);
    const videoTab = screen.getByRole("tab", { name: "영상", selected: true });
    const panelId = videoTab.getAttribute("aria-controls");
    expect(panelId && document.getElementById(panelId)).toBe(screen.getByRole("tabpanel"));
    expect(await screen.findByRole("button", { name: "전체", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeInTheDocument();
  });

  it("이미지 탭으로 바꾸면 내 사진 개수와 심플이 보이고 탭 이벤트를 보낸다", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));

    expect(await screen.findByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심플", pressed: true })).toBeInTheDocument();
    expect(trackSessionSpaceTabSwitched).toHaveBeenCalledWith({ tab: "image" });
  });

  it("사진을 올리면 내 사진 타일이 생기고 이벤트를 보내며 자동으로 적용하지는 않는다", async () => {
    vi.mocked(prepareBackgroundPhoto).mockResolvedValue(PHOTO);
    const { onApply } = renderPage();
    await openImageTab();

    await userEvent.upload(
      screen.getByLabelText("사진 올리기"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByRole("button", { name: "내 사진 1" })).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(trackTimerBackgroundPhotoAdded).toHaveBeenCalledWith({ count: 1 });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("쓸 수 없는 사진이면 실패 이벤트를 unusable로 보낸다", async () => {
    vi.mocked(prepareBackgroundPhoto).mockRejectedValue(new UnusablePhotoError());
    renderPage();
    await openImageTab();

    await userEvent.upload(
      screen.getByLabelText("사진 올리기"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );

    await vi.waitFor(() =>
      expect(trackSessionSpacePhotoFailed).toHaveBeenCalledWith({ reason: "unusable" }),
    );
    expect(trackTimerBackgroundPhotoAdded).not.toHaveBeenCalled();
  });

  describe("기기 저장소가 실패하면 storage 실패 이벤트를 보내고 알린다", () => {
    const quota = () => new DOMException("full", "QuotaExceededError");

    it("사진을 담지 못할 때", async () => {
      vi.mocked(prepareBackgroundPhoto).mockResolvedValue(PHOTO);
      vi.spyOn(timerBackgroundPhotoStore(), "add").mockRejectedValue(quota());
      renderPage();
      await openImageTab();

      await userEvent.upload(
        screen.getByLabelText("사진 올리기"),
        new File(["x"], "a.jpg", { type: "image/jpeg" }),
      );

      await vi.waitFor(() =>
        expect(trackSessionSpacePhotoFailed).toHaveBeenCalledExactlyOnceWith({
          reason: "storage",
        }),
      );
      expect(showCtaToast).toHaveBeenCalledWith("사진을 올리지 못했어요. 다시 시도해 주세요");
      expect(trackTimerBackgroundPhotoAdded).not.toHaveBeenCalled();
    });

    it("사진 목록을 읽지 못할 때", async () => {
      vi.spyOn(timerBackgroundPhotoStore(), "list").mockRejectedValue(quota());
      renderPage();

      await vi.waitFor(
        () =>
          expect(trackSessionSpacePhotoFailed).toHaveBeenCalledExactlyOnceWith({
            reason: "storage",
          }),
        { timeout: 3000 },
      );
      expect(showCtaToast).toHaveBeenCalledWith("사진을 불러오지 못했어요");
      await openImageTab();
      expect(screen.getByText("0/3")).toBeInTheDocument();
    });

    it("미리보기 사진을 읽지 못할 때", async () => {
      await timerBackgroundPhotoStore().add(PHOTO, 1);
      vi.spyOn(timerBackgroundPhotoStore(), "get").mockRejectedValue(quota());
      renderPage();
      await openImageTab();

      await userEvent.click(await screen.findByRole("button", { name: "내 사진 1 미리보기" }));

      await vi.waitFor(
        () =>
          expect(trackSessionSpacePhotoFailed).toHaveBeenCalledExactlyOnceWith({
            reason: "storage",
          }),
        { timeout: 3000 },
      );
      expect(showCtaToast).toHaveBeenCalledWith("사진을 불러오지 못했어요");
      expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();
    });
  });

  it("3장이 차면 사진 올리기를 비활성으로 보이고 누르면 한도 이벤트를 보낸다", async () => {
    for (let i = 0; i < 3; i += 1) await timerBackgroundPhotoStore().add(PHOTO, i);
    renderPage();
    await openImageTab();

    const upload = screen.getByRole("button", { name: "사진 올리기" });
    expect(upload).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(upload);

    expect(trackSessionSpacePhotoLimitReached).toHaveBeenCalledOnce();
  });

  describe("바꾼 뒤 목록을 다시 읽지 못하면 바꾼 기록은 남기고 읽기 실패를 알린다", () => {
    const quota = () => new DOMException("full", "QuotaExceededError");

    it("사진을 올린 뒤", async () => {
      vi.mocked(prepareBackgroundPhoto).mockResolvedValue(PHOTO);
      renderPage();
      await openImageTab();
      vi.spyOn(timerBackgroundPhotoStore(), "list").mockRejectedValue(quota());

      await userEvent.upload(
        screen.getByLabelText("사진 올리기"),
        new File(["x"], "a.jpg", { type: "image/jpeg" }),
      );

      await vi.waitFor(
        () => expect(trackTimerBackgroundPhotoAdded).toHaveBeenCalledWith({ count: 1 }),
        { timeout: 3000 },
      );
      expect(trackSessionSpacePhotoFailed).toHaveBeenCalledExactlyOnceWith({ reason: "storage" });
      expect(showCtaToast).toHaveBeenLastCalledWith("사진을 불러오지 못했어요");
    });

    it("사진을 지운 뒤", async () => {
      await timerBackgroundPhotoStore().add(PHOTO, 1);
      renderPage({ applied: PROCTOR_SPACE });
      await openImageTab();
      await screen.findByRole("button", { name: "내 사진 1" });
      vi.spyOn(timerBackgroundPhotoStore(), "list").mockRejectedValue(quota());

      await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

      await vi.waitFor(
        () =>
          expect(trackTimerBackgroundPhotoRemoved).toHaveBeenCalledWith({
            count: 0,
            wasSelected: false,
          }),
        { timeout: 3000 },
      );
      expect(trackSessionSpacePhotoFailed).toHaveBeenCalledExactlyOnceWith({ reason: "storage" });
      expect(showCtaToast).toHaveBeenLastCalledWith("사진을 불러오지 못했어요");
      expect(screen.queryByRole("button", { name: "내 사진 1" })).not.toBeInTheDocument();
    });
  });

  it("적용 중이 아닌 사진을 지우면 적용한 공간은 그대로다", async () => {
    await timerBackgroundPhotoStore().add(PHOTO, 1);
    const { onApply } = renderPage({ applied: PROCTOR_SPACE });
    await openImageTab();

    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await vi.waitFor(() =>
      expect(trackTimerBackgroundPhotoRemoved).toHaveBeenCalledWith({
        count: 0,
        wasSelected: false,
      }),
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it("푸터에 적용된 공간 이름만 보이고 분류 줄은 두지 않는다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    renderPage({ applied: { kind: "photo", photoId: saved.id } });

    // 타일 이름은 화면 읽기에서 숨겨 두어 보이는 이름 중 숨기지 않은 것이 푸터 제목이다.
    const titles = await screen.findAllByText("내 사진 1");
    expect(titles.filter((node) => node.getAttribute("aria-hidden") !== "true")).toHaveLength(1);
    expect(screen.queryByText("이미지 · 내 사진")).not.toBeInTheDocument();
  });

  it("타일 그림은 감시면 폰 세로 포스터, 반복 영상이면 thumb.webp다", async () => {
    shop.items = [shopSpace(), RAIN_ITEM];
    renderPage();

    const proctor = await screen.findByRole("button", { name: "독서실 감독관" });
    expect(proctor.querySelector("img")).toHaveAttribute(
      "src",
      "/spaces/watcher/9c8d9f19/poster/phone_portrait.jpg",
    );
    expect(
      screen.getByRole("button", { name: "비 오는 창가" }).querySelector("img"),
    ).toHaveAttribute("src", "/spaces/loop/1a2b3c4d/thumb.webp");
  });

  it("영상 탭은 섹션 제목 없이 감독, 서버 분류, 분류 없는 반복 영상 순서이고 칩을 고르면 그 분류만 남는다", async () => {
    shop.items = [
      shopSpace({
        id: 50,
        code: "SPACE_PLAIN",
        name: "그냥 영상",
        assetKey: "loop/plain",
        videoMode: "LOOP",
      }),
      RAIN_ITEM,
      shopSpace(),
    ];
    renderPage();
    await screen.findByRole("button", { name: "독서실 감독관" });
    const tiles = () =>
      [...document.querySelectorAll("li button[aria-pressed]")].map((b) =>
        b.getAttribute("aria-label"),
      );

    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
    expect(tiles()).toEqual(["독서실 감독관", "비 오는 창가", "그냥 영상"]);

    await userEvent.click(screen.getByRole("button", { name: "자연" }));
    expect(tiles()).toEqual(["비 오는 창가"]);
  });

  it("분류가 두 개 붙은 공간도 전체에서는 한 번만 나온다", async () => {
    shop.items = [
      shopSpace({
        id: 70,
        code: "SPACE_RAIN_CAFE",
        name: "비 오는 카페",
        assetKey: "loop/rain-cafe",
        videoMode: "LOOP",
        tags: [
          { code: "NATURE", name: "자연" },
          { code: "CAFE", name: "카페" },
        ],
      }),
    ];
    renderPage();

    expect(await screen.findAllByRole("button", { name: "비 오는 카페" })).toHaveLength(1);
  });

  it("이미지 탭은 내 사진 제목만 두고 심플을 서버 그림 공간과 같은 격자 첫 칸에 두며 서버 분류가 없으면 칩이 없다", async () => {
    shop.items = [
      shopSpace(),
      shopSpace({
        id: 60,
        code: "SPACE_DESK",
        name: "책상",
        assetKey: "image/desk",
        assetType: "IMAGE",
        videoMode: null,
      }),
    ];
    renderPage();
    await openImageTab();

    const desk = await screen.findByRole("button", { name: "책상" });
    const simple = screen.getByRole("button", { name: "심플" });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "내 사진",
    ]);
    expect(simple.closest("ul")).toBe(desk.closest("ul"));
    expect(
      [...(desk.closest("ul")?.querySelectorAll("button[aria-pressed]") ?? [])].map((b) =>
        b.getAttribute("aria-label"),
      ),
    ).toEqual(["심플", "책상"]);
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
  });

  it("이미지 탭에 분류 붙은 그림 공간이 있으면 칩이 생기고 칩을 골라도 내 사진과 심플은 남는다", async () => {
    const image = { assetType: "IMAGE", videoMode: null } as const;
    shop.items = [
      shopSpace({
        ...image,
        id: 60,
        code: "SPACE_DESK",
        name: "책상",
        assetKey: "image/desk",
        tags: [{ code: "CAFE", name: "카페" }],
      }),
      shopSpace({ ...image, id: 61, code: "SPACE_ROOM", name: "방", assetKey: "image/room" }),
    ];
    renderPage();
    await openImageTab();

    await userEvent.click(await screen.findByRole("button", { name: "카페" }));

    expect(screen.getByRole("button", { name: "책상" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "방" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심플" })).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("공간 목록을 받지 못하면 영상 탭은 빈 안내를, 이미지 탭은 내 사진과 심플만 보인다", async () => {
    shop.fail = true;
    renderPage();

    // 목록 조회는 한 번 다시 시도한 뒤에 실패한다.
    expect(
      await screen.findByText("찾는 공간이 없어요", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    await openImageTab();
    expect(screen.getByRole("button", { name: "심플" })).toBeInTheDocument();
    expect(screen.queryByText("찾는 공간이 없어요")).not.toBeInTheDocument();
  });

  it("타일을 누르면 서버 공간 값을 넘기고 저장이 끝난 뒤에 적용 이벤트를 보낸다", async () => {
    let finish!: (ok: boolean) => void;
    const onApply = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    renderPage({ onApply });

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    expect(onApply).toHaveBeenCalledWith(PROCTOR_SPACE);
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();

    await act(async () => finish(true));
    expect(trackTimerBackgroundApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "space",
        source: "tile",
        tab: "video",
        category: "all",
        item: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
      }),
    );
  });

  it("저장에 실패하면 실패를 알리고 적용 이벤트를 보내지 않는다", async () => {
    renderPage({ onApply: vi.fn(async () => false) });

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    await vi.waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("공간을 바꾸지 못했어요. 다시 시도해 주세요"),
    );
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
  });

  it("칩을 고른 채 적용하면 분류에 그 칩 코드를 싣는다", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "감독" }));
    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));

    await vi.waitFor(() =>
      expect(trackTimerBackgroundApplied).toHaveBeenCalledWith(
        expect.objectContaining({ category: "watch" }),
      ),
    );
  });

  it("적용 중인 공간 타일은 aria-pressed가 참이고 다시 눌러도 적용하지 않는다", async () => {
    const { onApply } = renderPage({ applied: PROCTOR_SPACE });
    const tile = await screen.findByRole("button", { name: "독서실 감독관" });

    expect(tile).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(tile);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("이미지 탭의 심플과 내 사진도 탭과 분류를 함께 보낸다", async () => {
    await timerBackgroundPhotoStore().add(PHOTO, 1);
    // 이미 적용된 타일은 다시 적용하지 않아서 감독관이 적용된 상태에서 시작한다.
    renderPage({ applied: PROCTOR_SPACE });
    await openImageTab();

    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));
    await vi.waitFor(() =>
      expect(trackTimerBackgroundApplied).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "photo", source: "tile", tab: "image", category: "all" }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "심플" }));
    await vi.waitFor(() =>
      expect(trackTimerBackgroundApplied).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "simple", source: "tile", tab: "image", category: "all" }),
      ),
    );
  });

  it("검색어와 맞지 않으면 빈 안내를 보인다", async () => {
    renderPage();
    await screen.findByRole("button", { name: "독서실 감독관" });

    await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "공간 검색" }), "산");

    expect(screen.getByText("찾는 공간이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "독서실 감독관" })).not.toBeInTheDocument();
  });

  it("세로에서 미리보기를 열어도 머리는 막히지 않고 뒤 목록만 막힌다", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관 미리보기" }));

    expect(screen.getByTestId("space-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공간 검색" }).closest("[inert]")).toBeNull();
    expect(screen.getByRole("tab", { name: "영상" }).closest("[inert]")).not.toBeNull();
  });

  describe("머리의 검색", () => {
    it("처음에는 검색 입력창 없이 머리에 검색 버튼만 있다", () => {
      renderPage();

      expect(screen.getByRole("button", { name: "공간 검색" })).toBeInTheDocument();
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("검색 버튼을 누르면 입력창이 나타나고 포커스가 입력창에 간다", async () => {
      renderPage();

      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));

      expect(screen.getByRole("searchbox", { name: "공간 검색" })).toHaveFocus();
    });

    it("검색 닫기를 누르면 입력창이 사라지고 걸렀던 목록이 돌아온다", async () => {
      renderPage();
      await screen.findByRole("button", { name: "독서실 감독관" });
      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));
      await userEvent.type(screen.getByRole("searchbox"), "산");

      await userEvent.click(screen.getByRole("button", { name: "검색 닫기" }));

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "독서실 감독관" })).toBeInTheDocument();
    });

    it("검색어 지우기는 입력창을 남기고 검색어만 비운다", async () => {
      renderPage();
      await screen.findByRole("button", { name: "독서실 감독관" });
      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));
      await userEvent.type(screen.getByRole("searchbox"), "산");

      await userEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));

      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(screen.getByRole("button", { name: "독서실 감독관" })).toBeInTheDocument();
    });

    it("검색 중에도 대화상자 이름은 공간이다", async () => {
      renderPage();

      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));

      expect(screen.getByRole("dialog", { name: "공간" })).toBeInTheDocument();
    });

    it("입력창에서 Esc를 누르면 검색만 닫히고 페이지는 열려 있다", async () => {
      const { onOpenChange } = renderPage();
      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("검색을 닫으면 포커스가 검색 버튼으로 돌아간다", async () => {
      renderPage();
      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));
      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("button", { name: "공간 검색" })).toHaveFocus();

      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));
      await userEvent.click(screen.getByRole("button", { name: "검색 닫기" }));
      expect(screen.getByRole("button", { name: "공간 검색" })).toHaveFocus();
    });

    it("검색 키를 누르면 입력창은 남고 포커스만 빠진다", async () => {
      renderPage();
      await userEvent.click(screen.getByRole("button", { name: "공간 검색" }));

      await userEvent.keyboard("비{Enter}");

      expect(screen.getByRole("searchbox")).toHaveValue("비");
      expect(screen.getByRole("searchbox")).not.toHaveFocus();
    });
  });

  it("삭제 버튼은 적용으로 번지지 않고, 적용 중인 사진을 지우면 심플로 돌리되 서버에는 보내지 않는다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const { onApply } = renderPage({ applied: { kind: "photo", photoId: saved.id } });
    await openImageTab();

    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await waitFor(() => {
      expect(trackTimerBackgroundPhotoRemoved).toHaveBeenCalledWith({
        count: 0,
        wasSelected: true,
      });
      expect(screen.queryByRole("button", { name: "내 사진 1" })).not.toBeInTheDocument();
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ kind: "simple" }, { localOnly: true });
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
  });

  it("적용 중인 사진을 지울 때 심플로 저장하지 못하면 지우지 않고 실패를 알린다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const onApply = vi.fn(async () => false);
    renderPage({ applied: { kind: "photo", photoId: saved.id }, onApply });
    await openImageTab();

    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await vi.waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("사진을 삭제하지 못했어요. 다시 시도해 주세요"),
    );
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: "simple" }, { localOnly: true });
    expect(await timerBackgroundPhotoStore().list()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "내 사진 1" })).toBeInTheDocument();
    expect(showCtaToast).not.toHaveBeenCalledWith("사진을 삭제했어요");
    expect(trackTimerBackgroundPhotoRemoved).not.toHaveBeenCalled();
  });

  it("서버 공간이 적용돼 있으면 푸터에 서버가 준 이름을 보인다", async () => {
    renderPage({ applied: PROCTOR_SPACE });
    await screen.findByRole("button", { name: "독서실 감독관" });

    const titles = screen.getAllByText("독서실 감독관");
    expect(titles.filter((node) => node.getAttribute("aria-hidden") !== "true")).toHaveLength(1);
  });

  it("적용한 공간이 목록에 없으면 푸터 이름 자리를 비운다", async () => {
    renderPage({ applied: RAIN_SPACE });
    await screen.findByRole("button", { name: "독서실 감독관" });

    expect(
      screen
        .queryAllByText("비 오는 창가")
        .filter((node) => node.getAttribute("aria-hidden") !== "true"),
    ).toHaveLength(0);
    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeInTheDocument();
  });

  it("감시 공간이 적용돼 있고 영상 탭이면 음량을 바꿀 수 있고 손을 뗄 때 바꾼 값을 한 번 저장한다", () => {
    const onVolumeCommit = vi.fn();
    // 호출부처럼 바꾼 음량을 다시 내려 줘야 손을 뗄 때 새 값이 저장되는지 볼 수 있다.
    function Harness() {
      const [volume, setVolume] = useState(80);
      return (
        <SessionSpacePage
          open
          onOpenChange={() => {}}
          container={document.body}
          returnFocus={() => null}
          landscape={false}
          loopSoundAvailable={false}
          userId={1}
          applied={PROCTOR_SPACE}
          onApply={async () => true}
          volume={volume}
          onVolumeChange={setVolume}
          onVolumeCommit={onVolumeCommit}
          onToggleMute={() => {}}
        />
      );
    }
    render(<Harness />);
    // 푸터에는 적용한 공간 이름 한 줄만 둔다.
    expect(screen.queryByText("영상 · 감독")).not.toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "공간 음량" });

    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "40" } });
    expect(slider).toHaveValue("40");
    fireEvent.pointerUp(slider);
    expect(onVolumeCommit).toHaveBeenCalledExactlyOnceWith(40);
  });

  it("소리 있는 반복 공간이 적용돼 있으면 음량과 음소거를 쓸 수 있다", () => {
    renderPage({ applied: RAIN_SPACE, loopSoundAvailable: true });

    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "공간 소리 끄기" })).toBeEnabled();
  });

  it("소리 없는 공간이면 음량과 음소거가 비활성이다", () => {
    for (const applied of [{ kind: "simple" } as const, RAIN_SPACE]) {
      renderPage({ applied });

      expect(screen.getByRole("slider", { name: "공간 음량" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "공간 소리 끄기" })).toBeDisabled();
      cleanup();
    }
  });

  it("감시 공간이 적용돼 있어도 이미지 탭에서는 음량과 음소거가 비활성이다", async () => {
    renderPage({ applied: PROCTOR_SPACE });
    await openImageTab();

    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "공간 소리 끄기" })).toBeDisabled();
  });

  it("음량이 0이면 음소거 버튼이 켜기로 바뀐다", async () => {
    const props = renderPage({ applied: PROCTOR_SPACE, volume: 0 });

    await userEvent.click(screen.getByRole("button", { name: "공간 소리 켜기" }));

    expect(props.onToggleMute).toHaveBeenCalledOnce();
  });

  it("미리보기 버튼은 적용으로 번지지 않고 실제 세션과 같은 어둡게 깔기 위에 감시 견본을 연다", async () => {
    const { onApply } = renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관 미리보기" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(trackSessionSpacePreviewOpened).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "space",
        item: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
      }),
    );
    expect(screen.getByTestId("space-preview")).toBeInTheDocument();
    expect(screen.getByTestId("watcher-background")).toBeInTheDocument();
    expect(screen.getByTestId("wallpaper-scrim")).toBeInTheDocument();
  });

  it("반복 영상 미리보기에서 파일을 받지 못하면 미리보기 안에 안내를 보인다", async () => {
    shop.items = [RAIN_ITEM];
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "비 오는 창가 미리보기" }));
    const preview = screen.getByTestId("space-preview");
    fireEvent.error(preview.querySelector("video")!);
    fireEvent.error(preview.querySelector("img")!);

    expect(within(preview).getByText("공간을 불러오지 못했어요")).toBeInTheDocument();
  });

  it("적용하기는 적용하고 목록으로 돌아온다", async () => {
    const { onApply } = renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관 미리보기" }));

    await userEvent.click(screen.getByRole("button", { name: "적용하기" }));

    expect(onApply).toHaveBeenCalledWith(PROCTOR_SPACE);
    await vi.waitFor(() =>
      expect(trackTimerBackgroundApplied).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "space",
          source: "preview",
          tab: "video",
          category: "all",
          item: { itemCode: "SPACE_PROCTOR", videoMode: "WATCH" },
        }),
      ),
    );
    expect(screen.queryByTestId("space-preview")).not.toBeInTheDocument();
  });

  it("이미 적용 중이면 적용 중으로 비활성이다", async () => {
    renderPage({ applied: PROCTOR_SPACE });

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관 미리보기" }));

    expect(screen.getByRole("button", { name: "적용 중" })).toBeDisabled();
  });

  it("뒤로가기는 적용하지 않고 목록으로 돌아온다", async () => {
    const { onApply } = renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관 미리보기" }));

    await userEvent.click(screen.getByRole("button", { name: "뒤로가기" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByTestId("space-preview")).not.toBeInTheDocument();
  });

  it("내 사진 미리보기는 원본 사진을 깔고, 사진 올리기 타일에는 미리보기 버튼이 없다", async () => {
    await timerBackgroundPhotoStore().add(PHOTO, 1);
    renderPage();
    await openImageTab();

    expect(screen.queryByRole("button", { name: /^사진 올리기 미리보기/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1 미리보기" }));

    expect(await screen.findByTestId("timer-background-layer")).toBeInTheDocument();
    expect(trackSessionSpacePreviewOpened).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "photo" }),
    );
  });

  it("적용 중인 사진을 지우다 실패하면 그 사진을 다시 적용하고 실패를 알린다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const photo = { kind: "photo", photoId: saved.id } as const;
    vi.spyOn(timerBackgroundPhotoStore(), "remove").mockRejectedValue(
      new DOMException("blocked", "UnknownError"),
    );
    const { onApply } = renderPage({ applied: photo });
    await openImageTab();

    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1 삭제" }));

    await vi.waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("사진을 삭제하지 못했어요. 다시 시도해 주세요"),
    );
    expect(vi.mocked(onApply).mock.calls).toEqual([
      [{ kind: "simple" }, { localOnly: true }],
      [photo, { localOnly: true }],
    ]);
    expect(screen.getByRole("button", { name: "내 사진 1" })).toBeInTheDocument();
  });
});
