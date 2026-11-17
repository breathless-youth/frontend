import { ImagePlus, Search, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import { ExpandGlyph } from "@/features/study-session/components/SessionControlButtons";
import { SessionPage, SessionPageFooter } from "@/features/study-session/components/SessionPage";
import {
  trackSessionSpacePhotoFailed,
  trackSessionSpacePhotoLimitReached,
  trackSessionSpacePreviewOpened,
  trackSessionSpaceTabSwitched,
  trackTimerBackgroundApplied,
  trackTimerBackgroundPhotoAdded,
  trackTimerBackgroundPhotoRemoved,
  type SpaceTab,
} from "@/lib/amplitude";
import { REPLAY_BLOCKED } from "@/lib/jpegDataUrl";
import { queryClient } from "@/lib/queryClient";
import { showCtaToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { prepareBackgroundPhoto } from "../prepareBackgroundPhoto";
import { filterSpaces, spaceKey, type SpaceItem } from "../spaceCatalog";
import { TimerBackgroundLayer } from "../TimerBackgroundLayer";
import {
  MAX_BACKGROUND_PHOTOS,
  PROCTOR_BACKGROUND,
  PROCTOR_TILE_URL,
  SIMPLE_BACKGROUND,
  SIMPLE_BACKGROUND_COLOR,
  type TimerBackgroundSelection,
} from "../timerBackground";
import { PhotoLimitError, timerBackgroundPhotoStore } from "../timerBackgroundPhotos";
import {
  TIMER_BACKGROUND_PHOTOS_KEY,
  timerBackgroundPhotoQuery,
  timerBackgroundPhotosQuery,
  type BackgroundPhotoTile,
  type BackgroundPhotoView,
} from "../timerBackgroundQueries";
import { WallpaperScrim } from "../WallpaperScrim";
import { WatcherDemo } from "../watcher/WatcherBackground";
import { clearWatcherAssets, saveWatcherAssets, watcherAssetUrls } from "../watcher/watcherAssets";

export interface SessionSpacePageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 포털 자리. `--session-*` 변수가 풀리도록 세션 `main`을 넘긴다. */
  container: HTMLElement | null;
  returnFocus: () => HTMLElement | null;
  landscape: boolean;
  /** 지금 적용된 공간. 지운 사진을 가리키면 호출부가 심플로 넘긴다. */
  applied: TimerBackgroundSelection;
  /** 저장하고 화면에 반영한다. 저장소가 막히면 false이고 이 페이지가 실패를 알린다. */
  onApply: (next: TimerBackgroundSelection) => boolean;
  /** 공간 소리 음량 0~100. 0이면 꺼짐이다. */
  volume: number;
  onVolumeChange: (volume: number) => void;
  onVolumeCommit: (volume: number) => void;
  onToggleMute: () => void;
}

type ChipCategory = "all" | "watch";

/**
 * 세션 공간 페이지
 *
 * 배경음 페이지처럼 세션 위 오른쪽 페이지로 열어 카메라와 측정을 멈추지 않는다.
 * 타일을 누르면 미리보기 없이 바로 적용한다.
 */
export function SessionSpacePage(props: SessionSpacePageProps) {
  const { t } = useTranslation("study-session");
  return (
    <SessionPage
      open={props.open}
      onOpenChange={props.onOpenChange}
      container={props.container}
      returnFocus={props.returnFocus}
      title={t("space.title")}
      landscape={props.landscape}
    >
      {/* 닫힌 동안은 Sheet가 내용을 그리지 않아 사진 목록도 열 때마다 새로 읽는다. */}
      <SpaceContent {...props} />
    </SessionPage>
  );
}

function SpaceContent({
  landscape,
  applied,
  onApply,
  volume,
  onVolumeChange,
  onVolumeCommit,
  onToggleMute,
}: SessionSpacePageProps) {
  const { t } = useTranslation(["study-session", "profile"]);
  const [tab, setTab] = useState<SpaceTab>("video");
  const [category, setCategory] = useState<ChipCategory>("all");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<BackgroundPhotoTile[] | null>(null);
  const [previewing, setPreviewing] = useState<SpaceItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    queryClient.fetchQuery(timerBackgroundPhotosQuery()).then(
      (list) => {
        if (!cancelled) setPhotos(list);
      },
      () => {
        if (cancelled) return;
        setPhotos([]);
        noticePhotoReadFailed(t("space.photoLoadFailed"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [t]);

  const fileRef = useRef<HTMLInputElement>(null);
  const full = photos !== null && photos.length >= MAX_BACKGROUND_PHOTOS;

  // 목록 실패는 빈 목록으로 두고, 바꾼 뒤 다시 읽기 실패는 지금 목록을 그대로 둔 채 알린다.
  async function reloadPhotos(): Promise<BackgroundPhotoTile[] | null> {
    try {
      await queryClient.invalidateQueries({ queryKey: TIMER_BACKGROUND_PHOTOS_KEY });
      const list = await queryClient.fetchQuery(timerBackgroundPhotosQuery());
      setPhotos(list);
      return list;
    } catch {
      noticePhotoReadFailed(t("space.photoLoadFailed"));
      return null;
    }
  }

  function noticeLimit() {
    trackSessionSpacePhotoLimitReached();
    showCtaToast(t("space.photoLimit", { max: MAX_BACKGROUND_PHOTOS }));
  }

  // 올린 사진은 자동으로 적용하지 않는다. 고르는 건 타일을 눌러서 한다.
  async function addPhoto(file: File) {
    try {
      await timerBackgroundPhotoStore().add(await prepareBackgroundPhoto(file), Date.now());
    } catch (error) {
      if (error instanceof PhotoLimitError) {
        noticeLimit();
      } else if (error instanceof UnusablePhotoError) {
        trackSessionSpacePhotoFailed({ reason: "unusable" });
        showCtaToast(t("profile:photo.unusable"));
      } else {
        trackSessionSpacePhotoFailed({ reason: "storage" });
        showCtaToast(t("profile:photo.uploadFailed"));
      }
      return;
    }
    const list = await reloadPhotos();
    trackTimerBackgroundPhotoAdded({ count: list?.length ?? (photos?.length ?? 0) + 1 });
  }

  async function removePhoto(id: string) {
    const wasSelected = applied.kind === "photo" && applied.photoId === id;
    // 지운 사진을 가리킨 채 두면 다음 세션도 빈 배경이라 지우기 전에 심플로 돌린다.
    // 심플을 저장하지 못하면 지운 사진이 적용된 채 남아 지우지 않는다.
    // 사용자가 고른 적용이 아니라 적용 이벤트는 보내지 않는다.
    if (wasSelected && !onApply(SIMPLE_BACKGROUND)) {
      showCtaToast(t("space.removeFailed"));
      return;
    }
    try {
      await timerBackgroundPhotoStore().remove(id);
    } catch {
      showCtaToast(t("space.removeFailed"));
      return;
    }
    const list = await reloadPhotos();
    trackTimerBackgroundPhotoRemoved({
      count: list?.length ?? Math.max(0, (photos?.length ?? 1) - 1),
      wasSelected,
    });
    if (list) {
      showCtaToast(t("space.removed"));
    } else {
      // 지운 사진 타일이 남으면 눌러서 없는 사진을 적용할 수 있어 목록에서 뺀다.
      // 토스트는 한 자리라 읽기 실패 안내를 삭제 완료로 덮지 않는다.
      setPhotos((prev) => prev?.filter((photo) => photo.id !== id) ?? prev);
    }
  }

  const thumbs = new Map((photos ?? []).map((photo) => [photo.id, photo.thumb]));
  const items: SpaceItem[] = [
    {
      selection: PROCTOR_BACKGROUND,
      name: t("space.names.proctor"),
      tab: "video",
      category: "watch",
    },
    ...(photos ?? []).map((photo, index): SpaceItem => ({
      selection: { kind: "photo", photoId: photo.id },
      name: t("space.names.photo", { number: index + 1 }),
      tab: "image",
      category: "mine",
    })),
    {
      selection: SIMPLE_BACKGROUND,
      name: t("space.names.simple"),
      tab: "image",
      category: "simple",
    },
  ];
  const visible = filterSpaces(items, {
    tab,
    category: tab === "video" ? category : "all",
    text,
  });
  const appliedKey = spaceKey(applied);

  function apply(item: SpaceItem, source: "tile" | "preview"): boolean {
    const { selection } = item;
    if (!onApply(selection)) {
      showCtaToast(t("space.applyFailed"));
      return false;
    }
    // 감독관 소재를 기기에 받아 두면 첫 등장이 늦지 않다. 받지 않아도 네트워크로 재생돼 기다리지 않는다.
    if (selection.kind === "proctor") {
      void saveWatcherAssets(watcherAssetUrls({ width: innerWidth, height: innerHeight }));
    } else {
      void clearWatcherAssets();
    }
    trackTimerBackgroundApplied({
      kind: selection.kind,
      source,
      tab: item.tab,
      category: item.category,
    });
    return true;
  }

  function tileContent(selection: TimerBackgroundSelection): ReactNode {
    if (selection.kind === "proctor") {
      return <img src={PROCTOR_TILE_URL} alt="" className="size-full object-cover" />;
    }
    if (selection.kind === "photo") {
      return (
        <img
          src={thumbs.get(selection.photoId)}
          alt=""
          className={cn("size-full object-cover", REPLAY_BLOCKED)}
        />
      );
    }
    return (
      <span className="block size-full" style={{ backgroundColor: SIMPLE_BACKGROUND_COLOR }} />
    );
  }

  function tile(item: SpaceItem) {
    const { selection } = item;
    const key = spaceKey(selection);
    const selected = key === appliedKey;
    return (
      <li key={key}>
        <div className="relative aspect-4/3">
          <button
            type="button"
            aria-label={item.name}
            aria-pressed={selected}
            onClick={() => {
              if (!selected) apply(item, "tile");
            }}
            className={cn(
              "absolute inset-0 overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none",
              selected ? "ring-2 ring-white" : "ring-1 ring-white/10",
            )}
          >
            {tileContent(selection)}
          </button>
          {selection.kind === "photo" && (
            <OverlayButton
              label={t("space.remove", { name: item.name })}
              onClick={() => void removePhoto(selection.photoId)}
              className="top-0 right-0"
            >
              <Trash2 aria-hidden="true" className="size-4.5 text-feedback-danger" />
            </OverlayButton>
          )}
          <OverlayButton
            label={t("space.preview", { name: item.name })}
            onClick={() => {
              trackSessionSpacePreviewOpened({ kind: selection.kind });
              setPreviewing(item);
            }}
            className="right-0 bottom-0"
            circleClassName="size-6"
          >
            <ExpandGlyph aria-hidden="true" className="size-3.5 text-white" />
          </OverlayButton>
        </div>
        {/* 이름은 타일 버튼의 이름과 같아 화면 읽기에서 두 번 읽히지 않게 숨긴다. */}
        <p
          aria-hidden="true"
          className={cn(
            "mt-2 truncate text-[13px] leading-4.5",
            selected ? "font-bold text-(--session-dialog-title)" : "text-(--session-dialog-body)",
          )}
        >
          {item.name}
        </p>
      </li>
    );
  }

  function section(
    title: string,
    list: readonly SpaceItem[],
    trailing?: ReactNode,
    extra?: ReactNode,
  ) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] leading-5.5 font-bold text-(--session-dialog-title)">
            {title}
          </h3>
          {trailing}
        </div>
        <ul className="grid grid-cols-2 gap-3 landscape-compact:grid-cols-4">
          {list.map(tile)}
          {extra}
        </ul>
      </section>
    );
  }

  const of = (category: SpaceItem["category"]) =>
    visible.filter((item) => item.category === category);
  const empty = visible.length === 0 && (
    <p className="py-10 text-center text-[14px] leading-5 text-(--session-dialog-body)">
      {t("space.empty")}
    </p>
  );

  const appliedIndex =
    applied.kind === "photo" ? (photos ?? []).findIndex((p) => p.id === applied.photoId) : -1;
  const appliedName = {
    proctor: t("space.names.proctor"),
    photo:
      appliedIndex >= 0
        ? t("space.names.photo", { number: appliedIndex + 1 })
        : t("space.sections.mine"),
    simple: t("space.names.simple"),
  }[applied.kind];
  // 소리는 감독관만 내고, 이미지 탭에서는 영상 공간의 소리를 만지지 않게 막는다.
  const soundEnabled = tab === "video" && applied.kind === "proctor";
  const muted = volume === 0;
  const commit = (event: { currentTarget: HTMLInputElement }) =>
    onVolumeCommit(Number(event.currentTarget.value));
  const footer = (
    <div
      className={cn(
        // 소리 줄은 누르는 높이가 44px라 보이는 줄보다 위아래로 4px씩 커서 제목과의 간격을 그만큼 줄인다.
        "flex min-w-0 flex-col gap-1.5",
        landscape
          ? "flex-1"
          : // 아래 안전 영역은 푸터 틀이 이미 더한다.
            "border-t border-(--session-sheet-line) px-6 pt-3.5",
      )}
    >
      <p className="truncate text-[15px] leading-4.5 font-bold text-(--session-dialog-title)">
        {appliedName}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={muted ? t("space.unmute") : t("space.mute")}
          disabled={!soundEnabled}
          onClick={onToggleMute}
          className="-ml-3 flex size-11 shrink-0 items-center justify-center text-(--session-dialog-title) focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none disabled:opacity-40"
        >
          {muted || !soundEnabled ? (
            <VolumeX aria-hidden="true" className="size-5" />
          ) : (
            <Volume2 aria-hidden="true" className="size-5" />
          )}
        </button>
        {/* 끄는 동안 이벤트가 쏟아지지 않게 저장과 기록은 손을 뗄 때 한 번만 한다. */}
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          aria-label={t("space.volume")}
          disabled={!soundEnabled}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          className="relative min-h-11 min-w-0 flex-1 accent-white disabled:opacity-40"
        />
      </div>
    </div>
  );

  return (
    <>
      {/* 미리보기가 덮은 동안 뒤 목록에 포커스가 가지 않게 한다. */}
      <div
        inert={previewing !== null}
        className={cn("flex min-h-0 flex-1 flex-col", landscape && "gap-2")}
      >
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = value as SpaceTab;
            setTab(next);
            trackSessionSpaceTabSwitched({ tab: next });
          }}
          className={cn("flex min-h-0 flex-1 flex-col gap-4 pt-2", !landscape && "px-6")}
        >
          <TabsList className="shrink-0">
            {(["video", "image"] as const).map((id) => (
              <TabsTrigger
                key={id}
                value={id}
                className="flex-1 justify-center text-white/40 data-[state=active]:border-(--session-dialog-title) data-[state=active]:text-(--session-dialog-title)"
              >
                {t(`space.tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="relative shrink-0">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-(--session-dialog-body)"
            />
            <Input
              type="search"
              aria-label={t("space.search")}
              placeholder={t("space.search")}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-11 rounded-lg border-(--session-sheet-line) bg-(--session-sheet-surface) pl-10 text-[14px] text-(--session-dialog-title) placeholder:text-(--session-dialog-body)"
            />
          </div>

          <TabsContent
            value="video"
            // 스크롤 상자가 고른 타일 바깥 테두리를 자르지 않게 양옆에 여백을 둔다.
            className="-mx-1 mt-0 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1 pb-4"
          >
            <div className="flex shrink-0 gap-2">
              {(["all", "watch"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                  className="group flex min-h-11 items-center focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[13px] leading-4.5 font-medium group-focus-visible:ring-2 group-focus-visible:ring-(--state-focus)",
                      category === id
                        ? "border-white bg-white text-black"
                        : "border-white/20 text-(--session-dialog-title)",
                    )}
                  >
                    {id === "all" ? t("space.all") : t("space.sections.watch")}
                  </span>
                </button>
              ))}
            </div>
            {of("watch").length > 0 && section(t("space.sections.watch"), of("watch"))}
            {empty}
          </TabsContent>

          <TabsContent
            value="image"
            className="-mx-1 mt-0 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-1 pb-4"
          >
            {(text === "" || of("mine").length > 0) &&
              section(
                t("space.sections.mine"),
                of("mine"),
                photos !== null && (
                  <span className="text-[13px] leading-4.5 text-(--session-dialog-body) tabular-nums">
                    {t("space.photoCount", { current: photos.length, max: MAX_BACKGROUND_PHOTOS })}
                  </span>
                ),
                text === "" && photos !== null && (
                  <li>
                    {/* disabled 대신 aria-disabled라 다 찬 뒤에도 눌러서 한도 안내를 받는다. */}
                    <button
                      type="button"
                      aria-disabled={full}
                      onClick={() => (full ? noticeLimit() : fileRef.current?.click())}
                      className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 text-[13px] leading-4.5 text-(--session-dialog-title) focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none aria-disabled:opacity-40"
                    >
                      <ImagePlus aria-hidden="true" className="size-5" />
                      {t("space.upload")}
                    </button>
                  </li>
                ),
              )}
            {of("simple").length > 0 && section(t("space.names.simple"), of("simple"))}
            {empty}
          </TabsContent>
        </Tabs>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label={t("space.upload")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 같은 파일을 다시 골라도 change가 오도록 비운다.
            event.target.value = "";
            if (file) void addPhoto(file);
          }}
        />
        {landscape ? (
          <SessionPageFooter landscape leading={footer} />
        ) : (
          <SessionPageFooter landscape={false} actions={footer} />
        )}
      </div>
      {previewing && (
        <SpacePreview
          item={previewing}
          landscape={landscape}
          applied={spaceKey(previewing.selection) === appliedKey}
          onBack={() => setPreviewing(null)}
          onApply={() => {
            if (apply(previewing, "preview")) setPreviewing(null);
          }}
        />
      )}
    </>
  );
}

// 읽지 못한 채 두면 사진이 사라진 것처럼 빈 목록이나 빈 미리보기만 보여 알린다.
function noticePhotoReadFailed(message: string) {
  trackSessionSpacePhotoFailed({ reason: "storage" });
  showCtaToast(message);
}

/**
 * 타일 구석의 작은 버튼
 *
 * 타일 버튼 안에 넣으면 누름이 적용으로 번져서 형제로 둔다.
 * 보이는 원은 작아도 누르는 자리는 44px이다.
 */
function OverlayButton({
  label,
  onClick,
  className,
  circleClassName = "size-7",
  children,
}: {
  label: string;
  onClick: () => void;
  className: string;
  circleClassName?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "group absolute flex size-11 items-center justify-center focus-visible:outline-none",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-black/50 group-focus-visible:ring-2 group-focus-visible:ring-(--state-focus)",
          circleClassName,
        )}
      >
        {children}
      </span>
    </button>
  );
}

/**
 * 공간 미리보기
 *
 * 페이지 머리 아래부터 끝까지 덮어 실제 세션처럼 보인다.
 * 감독관 견본은 발소리를 내지 않는다.
 */
function SpacePreview({
  item,
  landscape,
  applied,
  onBack,
  onApply,
}: {
  item: SpaceItem;
  landscape: boolean;
  applied: boolean;
  onBack: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation("study-session");
  const { selection } = item;
  const photoId = selection.kind === "photo" ? selection.photoId : null;
  const [photo, setPhoto] = useState<BackgroundPhotoView | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  // 덮개를 열면 뒤 목록이 inert라 포커스를 덮개 안으로 옮긴다.
  useEffect(() => backRef.current?.focus(), []);

  useEffect(() => {
    if (photoId === null) return;
    let cancelled = false;
    queryClient.fetchQuery(timerBackgroundPhotoQuery(photoId)).then(
      (view) => {
        if (!cancelled) setPhoto(view);
      },
      () => {
        if (!cancelled) noticePhotoReadFailed(t("space.photoLoadFailed"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [photoId, t]);

  return (
    <div
      role="group"
      aria-label={t("space.preview", { name: item.name })}
      data-testid="space-preview"
      // 머리 높이는 SessionPage 머리 식과 같아야 제목과 뒤로 가기가 덮이지 않는다.
      className={cn(
        "absolute inset-x-0 top-[calc(52px+env(safe-area-inset-top))] bottom-0 z-10 overflow-hidden bg-(--session-simple-base)",
        landscape && "landscape-compact:top-[calc(60px+env(safe-area-inset-top))]",
      )}
    >
      {selection.kind === "proctor" && <WatcherDemo className="absolute inset-0" />}
      {photo && <TimerBackgroundLayer src={photo.src} fit={photo.fit} />}
      <WallpaperScrim simple={false} />
      <div className="absolute inset-x-0 bottom-0 flex gap-3 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <Button
          ref={backRef}
          variant="unstyled"
          onClick={onBack}
          className="h-13 flex-1 rounded-[14px] bg-(--session-dialog-cancel-bg) text-[16px] font-semibold text-white motion-reduce:transition-none"
        >
          {t("space.back")}
        </Button>
        <Button
          disabled={applied}
          onClick={onApply}
          className="h-13 flex-1 rounded-[14px] text-[16px] font-semibold motion-reduce:transition-none"
        >
          {applied ? t("space.applied") : t("space.apply")}
        </Button>
      </div>
    </div>
  );
}
