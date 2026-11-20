import "fake-indexeddb/auto";

import { fireEvent, render, screen } from "@testing-library/react";
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

import { prepareBackgroundPhoto } from "../../prepareBackgroundPhoto";
import type { TimerBackgroundSelection } from "../../timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "../../timerBackgroundPhotos";
import {
  SessionSpacePage,
  SpaceContent,
  type SessionSpacePageProps,
  type SpaceContentProps,
} from "../SessionSpacePage";

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

const videoSpaces = vi.hoisted(() => ({ open: true }));

vi.mock("../../videoSpaces", () => ({
  get VIDEO_SPACES_OPEN() {
    return videoSpaces.open;
  },
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
    applied: { kind: "simple" },
    onApply: vi.fn((_: TimerBackgroundSelection) => true),
    volume: 80,
    onVolumeChange: vi.fn(),
    onVolumeCommit: vi.fn(),
    onToggleMute: vi.fn(),
    ...over,
  };
  render(<SessionSpacePage {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  videoSpaces.open = true;
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  queryClient.clear();
});

describe("SessionSpacePage", () => {
  it("제목 공간과 영상·이미지 탭을 보이고 영상 탭에 감독관과 분류 칩이 있다", () => {
    renderPage();

    expect(screen.getByRole("dialog", { name: "공간" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "영상", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "감시", pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "독서실 감독관" })).toBeInTheDocument();
  });

  it("썸네일을 누르면 미리보기 없이 바로 적용하고 이벤트를 보낸다", async () => {
    const { onApply } = renderPage();

    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));

    expect(onApply).toHaveBeenCalledWith({ kind: "proctor" });
    expect(trackTimerBackgroundApplied).toHaveBeenCalledWith({
      kind: "proctor",
      source: "tile",
      tab: "video",
      category: "watch",
      surface: "session",
    });
  });

  it("이미지 탭의 심플과 내 사진도 탭과 분류를 함께 보낸다", async () => {
    await timerBackgroundPhotoStore().add(PHOTO, 1);
    // 이미 적용된 타일은 다시 적용하지 않아서 감독관이 적용된 상태에서 시작한다.
    renderPage({ applied: { kind: "proctor" } });
    await openImageTab();

    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));
    expect(trackTimerBackgroundApplied).toHaveBeenLastCalledWith({
      kind: "photo",
      source: "tile",
      tab: "image",
      category: "mine",
      surface: "session",
    });

    await userEvent.click(screen.getByRole("button", { name: "심플" }));
    expect(trackTimerBackgroundApplied).toHaveBeenLastCalledWith({
      kind: "simple",
      source: "tile",
      tab: "image",
      category: "simple",
      surface: "session",
    });
  });

  it("적용 중인 공간 타일은 aria-pressed가 참이고 다시 눌러도 적용하지 않는다", async () => {
    const { onApply } = renderPage({ applied: { kind: "proctor" } });
    const tile = screen.getByRole("button", { name: "독서실 감독관" });

    expect(tile).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(tile);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("이미지 탭으로 바꾸면 내 사진 개수와 심플이 보이고 탭 이벤트를 보낸다", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));

    expect(await screen.findByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심플", pressed: true })).toBeInTheDocument();
    expect(trackSessionSpaceTabSwitched).toHaveBeenCalledWith({ tab: "image" });
  });

  it("검색어와 맞지 않으면 빈 안내를 보인다", async () => {
    renderPage();

    await userEvent.type(screen.getByRole("searchbox", { name: "공간 검색" }), "산");

    expect(screen.getByText("찾는 공간이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "독서실 감독관" })).not.toBeInTheDocument();
  });

  it("저장에 실패하면 적용됐다고 알리지 않는다", async () => {
    renderPage({ onApply: vi.fn(() => false) });

    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관" }));

    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
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

  it("삭제 버튼은 적용으로 번지지 않고, 적용 중인 사진을 지우면 심플로 돌린다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const { onApply } = renderPage({ applied: { kind: "photo", photoId: saved.id } });
    await openImageTab();

    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await vi.waitFor(() =>
      expect(trackTimerBackgroundPhotoRemoved).toHaveBeenCalledWith({
        count: 0,
        wasSelected: true,
      }),
    );
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ kind: "simple" });
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "내 사진 1" })).not.toBeInTheDocument();
  });

  it("적용 중인 사진을 지울 때 심플로 저장하지 못하면 지우지 않고 실패를 알린다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    const onApply = vi.fn((_: TimerBackgroundSelection) => false);
    renderPage({ applied: { kind: "photo", photoId: saved.id }, onApply });
    await openImageTab();

    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));

    await vi.waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("사진을 삭제하지 못했어요. 다시 시도해 주세요"),
    );
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ kind: "simple" });
    expect(await timerBackgroundPhotoStore().list()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "내 사진 1" })).toBeInTheDocument();
    expect(showCtaToast).not.toHaveBeenCalledWith("사진을 삭제했어요");
    expect(trackTimerBackgroundPhotoRemoved).not.toHaveBeenCalled();
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
      renderPage({ applied: { kind: "proctor" } });
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
    const { onApply } = renderPage({ applied: { kind: "proctor" } });
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

  it("감독관이 적용돼 있고 영상 탭이면 음량을 바꿀 수 있고 손을 뗄 때 바꾼 값을 한 번 저장한다", () => {
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
          applied={{ kind: "proctor" }}
          onApply={() => true}
          volume={volume}
          onVolumeChange={setVolume}
          onVolumeCommit={onVolumeCommit}
          onToggleMute={() => {}}
        />
      );
    }
    render(<Harness />);
    // 푸터에는 적용한 공간 이름 한 줄만 둔다.
    expect(screen.queryByText("영상 · 감시")).not.toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "공간 음량" });

    expect(slider).toBeEnabled();
    fireEvent.change(slider, { target: { value: "40" } });
    expect(slider).toHaveValue("40");
    fireEvent.pointerUp(slider);
    expect(onVolumeCommit).toHaveBeenCalledExactlyOnceWith(40);
  });

  it("소리 없는 공간이면 음량과 음소거가 비활성이다", () => {
    renderPage({ applied: { kind: "simple" } });

    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "공간 소리 끄기" })).toBeDisabled();
  });

  it("감독관이 적용돼 있어도 이미지 탭에서는 음량과 음소거가 비활성이다", async () => {
    renderPage({ applied: { kind: "proctor" } });
    await openImageTab();

    expect(screen.getByRole("slider", { name: "공간 음량" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "공간 소리 끄기" })).toBeDisabled();
  });

  it("음량이 0이면 음소거 버튼이 켜기로 바뀐다", async () => {
    const props = renderPage({ applied: { kind: "proctor" }, volume: 0 });

    await userEvent.click(screen.getByRole("button", { name: "공간 소리 켜기" }));

    expect(props.onToggleMute).toHaveBeenCalledOnce();
  });

  it("미리보기 버튼은 적용으로 번지지 않고 실제 세션과 같은 어둡게 깔기 위에 미리보기를 연다", async () => {
    const { onApply } = renderPage();

    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관 미리보기" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(trackSessionSpacePreviewOpened).toHaveBeenCalledWith({ kind: "proctor" });
    expect(screen.getByTestId("space-preview")).toBeInTheDocument();
    expect(screen.getByTestId("watcher-background")).toBeInTheDocument();
    expect(screen.getByTestId("wallpaper-scrim")).toBeInTheDocument();
  });

  it("적용하기는 적용하고 목록으로 돌아온다", async () => {
    const { onApply } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관 미리보기" }));

    await userEvent.click(screen.getByRole("button", { name: "적용하기" }));

    expect(onApply).toHaveBeenCalledWith({ kind: "proctor" });
    expect(trackTimerBackgroundApplied).toHaveBeenCalledWith({
      kind: "proctor",
      source: "preview",
      tab: "video",
      category: "watch",
      surface: "session",
    });
    expect(screen.queryByTestId("space-preview")).not.toBeInTheDocument();
  });

  it("이미 적용 중이면 적용 중으로 비활성이다", async () => {
    renderPage({ applied: { kind: "proctor" } });

    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관 미리보기" }));

    expect(screen.getByRole("button", { name: "적용 중" })).toBeDisabled();
  });

  it("뒤로가기는 적용하지 않고 목록으로 돌아온다", async () => {
    const { onApply } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "독서실 감독관 미리보기" }));

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
    expect(trackSessionSpacePreviewOpened).toHaveBeenCalledWith({ kind: "photo" });
  });
});

describe("SessionSpacePage 영상 공간을 닫아 두면", () => {
  beforeEach(() => {
    videoSpaces.open = false;
  });

  it("이미지 탭에서 열리고 탭 순서는 영상, 이미지 그대로다", async () => {
    renderPage();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["영상", "이미지"]);
    expect(screen.getByRole("tab", { name: "이미지", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("0/3")).toBeInTheDocument();
  });

  it("영상 탭에는 감독관과 검색, 분류 칩 없이 곧 나온다는 안내만 있다", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("tab", { name: "영상" }));

    expect(screen.getByText("영상 공간은 곧 만나볼 수 있어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "독서실 감독관" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "공간 검색" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "감시" })).not.toBeInTheDocument();
    expect(screen.queryByText("찾는 공간이 없어요")).not.toBeInTheDocument();
  });

  it("이미지 탭 검색으로도 감독관이 나오지 않는다", async () => {
    renderPage();

    await userEvent.type(screen.getByRole("searchbox", { name: "공간 검색" }), "감독");

    expect(screen.queryByRole("button", { name: "독서실 감독관" })).not.toBeInTheDocument();
    expect(screen.getByText("찾는 공간이 없어요")).toBeInTheDocument();
  });

  it("푸터에는 적용한 공간 이름만 있고 음소거와 음량은 없다", async () => {
    const saved = await timerBackgroundPhotoStore().add(PHOTO, 1);
    renderPage({ applied: { kind: "photo", photoId: saved.id } });

    const titles = await screen.findAllByText("내 사진 1");
    expect(titles.filter((node) => node.getAttribute("aria-hidden") !== "true")).toHaveLength(1);
    expect(screen.queryByRole("slider", { name: "공간 음량" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공간 소리 끄기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "공간 소리 켜기" })).not.toBeInTheDocument();
  });

  it("사진 올리기와 심플 타일은 그대로 쓴다", async () => {
    vi.mocked(prepareBackgroundPhoto).mockResolvedValue(PHOTO);
    const { onApply } = renderPage({ applied: { kind: "photo", photoId: "gone" } });
    await screen.findByText("0/3");

    await userEvent.upload(
      screen.getByLabelText("사진 올리기"),
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );
    expect(await screen.findByRole("button", { name: "내 사진 1" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "심플" }));
    expect(onApply).toHaveBeenCalledWith({ kind: "simple" });
  });
});

function renderBody(over: Partial<SpaceContentProps> = {}) {
  const props: SpaceContentProps = {
    landscape: false,
    applied: { kind: "photo", photoId: "gone" },
    onApply: vi.fn((_: TimerBackgroundSelection) => true),
    volume: 0,
    onVolumeChange: vi.fn(),
    onVolumeCommit: vi.fn(),
    onToggleMute: vi.fn(),
    listOnly: true,
    surface: "pc_home",
    ...over,
  };
  render(<SpaceContent {...props} />);
  return props;
}

describe("SpaceContent 목록만 보기", () => {
  it("영상 공간이 닫혀 있으면 탭 줄과 검색창 없이 이미지 목록만 보인다", async () => {
    videoSpaces.open = false;
    renderBody();

    expect(await screen.findByText(/^\d\/3$/)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "심플" })).toBeInTheDocument();
  });

  it("영상 공간이 열려 있으면 목록만 보기여도 탭 줄을 남긴다", () => {
    videoSpaces.open = true;
    renderBody();

    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("세션 공간 페이지는 영상 공간이 닫혀 있어도 지금처럼 탭 줄을 보인다", () => {
    videoSpaces.open = false;
    renderPage();

    expect(screen.getByRole("tab", { name: "이미지", selected: true })).toBeInTheDocument();
  });

  it("적용 이벤트에 공간을 고른 화면을 싣는다", async () => {
    videoSpaces.open = false;
    renderBody();

    await userEvent.click(screen.getByRole("button", { name: "심플" }));

    expect(trackTimerBackgroundApplied).toHaveBeenCalledWith({
      kind: "simple",
      source: "tile",
      tab: "image",
      category: "simple",
      surface: "pc_home",
    });
  });
});
