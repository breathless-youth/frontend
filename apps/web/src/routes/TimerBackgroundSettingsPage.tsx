import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import { DEFAULT_FIT, type PhotoFit } from "@/features/timer-background/photoFit";
import { prepareBackgroundPhoto } from "@/features/timer-background/prepareBackgroundPhoto";
import {
  MAX_BACKGROUND_PHOTOS,
  NATURE_BACKGROUNDS,
  readTimerBackground,
  SIMPLE_BACKGROUND,
  SIMPLE_BACKGROUND_COLOR,
  PROCTOR_BACKGROUND,
  PROCTOR_TILE_URL,
  WATCH_BACKGROUNDS,
  writeTimerBackground,
  type TimerBackgroundSelection,
  type UpcomingBackground,
} from "@/features/timer-background/timerBackground";
import {
  PhotoLimitError,
  timerBackgroundPhotoStore,
  type NewTimerBackgroundPhoto,
} from "@/features/timer-background/timerBackgroundPhotos";
import {
  TIMER_BACKGROUND_PHOTOS_KEY,
  timerBackgroundPhotosQuery,
  type BackgroundPhotoView,
} from "@/features/timer-background/timerBackgroundQueries";
import { TimerBackgroundPreview } from "@/features/timer-background/TimerBackgroundPreview";
import { WatcherDemo } from "@/features/timer-background/watcher/WatcherBackground";
import {
  trackTimerBackgroundApplied,
  trackTimerBackgroundPhotoAdded,
  trackTimerBackgroundPhotoRemoved,
} from "@/lib/amplitude";
import { REPLAY_BLOCKED } from "@/lib/jpegDataUrl";
import {
  canUseNativeBackgroundPhoto,
  pickNativeBackgroundPhoto,
} from "@/lib/nativeBackgroundPhoto";
import {
  clearWatcherAssets,
  saveWatcherAssets,
  watcherAssetUrls,
} from "@/features/timer-background/watcher/watcherAssets";
import { slideBack } from "@/lib/pageTransition";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { showToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SECTIONS = ["mine", "watch", "nature", "simple"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_EMOJI: Record<Section, string> = {
  mine: "📷",
  watch: "👀",
  nature: "🌿",
  simple: "⏱️",
};

/** 묶음 제목이 이 높이(화면 위에서부터 비율) 안으로 들어오면 그 묶음 칩을 켠다. */
const SPY_LINE_RATIO = 0.4;
/** 화면이 낮아도 칩 줄(머리 줄 아래 약 130px) 밑에서 판정한다. */
const MIN_SPY_LINE_PX = 160;

/** 칩을 누른 뒤 부드러운 스크롤이 끝날 때까지 스크롤 위치로 칩을 바꾸지 않는다. */
const JUMP_LOCK_MS = 1000;

/** 감독관 소재를 받는 동안 `적용하는 중`으로 기다리는 최대 시간 */
const PROCTOR_APPLY_WAIT_MS = 10_000;

/** 고정 머리 줄(안전 영역 + 52px)과 칩 줄(66px) 아래로 묶음 제목이 보이게 한다. */
const SECTION_SCROLL_MARGIN = "scroll-mt-[calc(env(safe-area-inset-top)+130px)]";

/** 시안의 세션 알약 바탕. 이 화면은 세션 밖이라 세션 변수 대신 값을 쓴다. */
const PILL_BG = "bg-[rgba(16,20,25,0.65)]";

const TILE = "relative aspect-[3/4.4] w-full overflow-hidden rounded-xl";
/** 고른 타일 테두리. 바탕색으로 한 칸 띄운 뒤 브랜드색 고리를 두른다. */
const SELECTED_RING = "shadow-[0_0_0_2px_var(--muted),0_0_0_4px_var(--primary)]";
const BADGE =
  "pointer-events-none absolute rounded-full bg-primary px-2 py-0.75 text-xs leading-4 font-semibold text-primary-foreground";

type Staged = { selection: TimerBackgroundSelection; fit: PhotoFit };

/**
 * 설정 › 타이머 배경
 *
 * 위쪽 칩으로 묶음 사이를 옮겨 다니고, 타일을 누르면 미리보기가 떠서 `적용하기`로 확정한다.
 * 고른 배경은 이 기기의 localStorage에, 담은 사진은 IndexedDB에만 저장하고 서버로 보내지 않는다(ADR 0022).
 * 감시·자연 배경은 아직 출시 전이라 누를 수 없다.
 */
export function TimerBackgroundSettingsPage() {
  const { t } = useTranslation(["settings", "profile"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const photos = useQuery(timerBackgroundPhotosQuery());
  const photoList = photos.data ?? [];
  const [selection, setSelection] = useState(readTimerBackground);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [adding, setAdding] = useState(false);
  const [applying, setApplying] = useState(false);
  // 받는 동안 미리보기를 닫았으면 받기가 끝나도 적용하지 않는다.
  const stagedRef = useRef(staged);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  const [activeChip, setActiveChip] = useState<Section>("mine");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Partial<Record<Section, HTMLElement | null>>>({});
  // 칩을 누른 뒤 스크롤이 끝날 때까지 걸어 두는 타이머. 걸려 있는 동안 스크롤 위치로 칩을 바꾸지 않는다.
  const jumpLock = useRef<number | undefined>(undefined);

  // 지운 사진을 가리키는 값은 심플로 보인다. 세션 화면도 같은 규칙이다.
  const selectedPhotoMissing =
    selection.kind === "photo" &&
    photos.isSuccess &&
    !photoList.some((photo) => photo.id === selection.photoId);
  const effective = selectedPhotoMissing ? SIMPLE_BACKGROUND : selection;

  useEffect(() => {
    function onScroll() {
      if (jumpLock.current !== undefined) return;
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const spyLine = Math.max(MIN_SPY_LINE_PX, window.innerHeight * SPY_LINE_RATIO);
      let active: Section = "mine";
      for (const section of SECTIONS) {
        const element = sectionRefs.current[section];
        // 묶음 제목이 화면 위쪽 40% 안으로 들어오면 그 묶음을 보고 있는 것으로 본다.
        // 칩 줄 바로 아래까지 기다리면 묶음을 거의 다 지나서야 칩이 바뀐다.
        if (element && element.getBoundingClientRect().top <= spyLine) active = section;
      }
      setActiveChip(atEnd ? "simple" : active);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(jumpLock.current);
    };
  }, []);

  function jumpTo(section: Section) {
    setActiveChip(section);
    window.clearTimeout(jumpLock.current);
    jumpLock.current = window.setTimeout(() => {
      jumpLock.current = undefined;
    }, JUMP_LOCK_MS);
    sectionRefs.current[section]?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  function photoName(id: string): string {
    const index = photoList.findIndex((photo) => photo.id === id);
    return t("timerBackground.photoName", { number: index + 1 });
  }

  function openPreview(next: TimerBackgroundSelection, fit: PhotoFit = DEFAULT_FIT) {
    setStaged({ selection: next, fit });
  }

  async function savePhoto(photo: NewTimerBackgroundPhoto, source: "native" | "file") {
    try {
      const saved = await timerBackgroundPhotoStore().add(photo, Date.now());
      await queryClient.invalidateQueries({ queryKey: TIMER_BACKGROUND_PHOTOS_KEY });
      trackTimerBackgroundPhotoAdded({ count: photoList.length + 1, source });
      openPreview({ kind: "photo", photoId: saved.id });
    } catch (error) {
      showToast(
        error instanceof PhotoLimitError
          ? t("timerBackground.photoLimit")
          : t("profile:photo.unusable"),
      );
    }
  }

  async function addPhoto() {
    if (photoList.length >= MAX_BACKGROUND_PHOTOS) {
      showToast(t("timerBackground.photoLimit"));
      return;
    }
    if (!canUseNativeBackgroundPhoto()) {
      fileInputRef.current?.click();
      return;
    }
    setAdding(true);
    try {
      const photo = await pickNativeBackgroundPhoto();
      if (photo !== null) await savePhoto(photo, "native");
    } catch {
      showToast(t("profile:photo.unusable"));
    } finally {
      setAdding(false);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 같은 사진을 다시 골라도 change가 오도록 비운다.
    event.target.value = "";
    if (file === undefined) return;
    setAdding(true);
    try {
      await savePhoto(await prepareBackgroundPhoto(file), "file");
    } catch (error) {
      if (error instanceof UnusablePhotoError) showToast(t("profile:photo.unusable"));
      else throw error;
    } finally {
      setAdding(false);
    }
  }

  async function removePhoto(photo: BackgroundPhotoView) {
    const wasSelected = effective.kind === "photo" && effective.photoId === photo.id;
    try {
      await timerBackgroundPhotoStore().remove(photo.id);
    } catch {
      showToast(t("timerBackground.removeFailed"));
      return;
    }
    if (wasSelected) {
      // 선택값을 못 바꿔도 지운 사진을 가리키는 값은 이 화면과 세션 화면 모두 심플로 본다.
      writeTimerBackground(SIMPLE_BACKGROUND);
      setSelection(SIMPLE_BACKGROUND);
    }
    trackTimerBackgroundPhotoRemoved({ count: photoList.length - 1, wasSelected });
    showToast(t("timerBackground.removed"));
    await queryClient.invalidateQueries({ queryKey: TIMER_BACKGROUND_PHOTOS_KEY });
  }

  /**
   * 미리보기의 `적용하기`
   *
   * 사진 조정값을 먼저 저장하고 그다음 선택을 저장하며, 다 저장하면 설정 화면으로 돌아간다.
   * 어느 쪽이든 저장하지 못하면 적용됐다고 알리지 않고 미리보기에 머물러 다시 누를 수 있게 한다.
   * 감독관은 공부 화면이 바로 쓰도록 영상·소리를 기기에 받아 두는데, 최대 `PROCTOR_APPLY_WAIT_MS`만 기다리고
   * 나머지는 화면을 떠난 뒤에도 이어 받는다. 받지 못해도 공부 화면이 그때 받으므로 적용은 그대로 한다.
   */
  async function apply(current: Staged) {
    if (applying) return;
    const { selection: next, fit } = current;
    if (next.kind === "proctor") {
      setApplying(true);
      const saving = saveWatcherAssets(
        watcherAssetUrls({ width: window.innerWidth, height: window.innerHeight }),
      );
      await Promise.race([
        saving,
        new Promise((resolve) => setTimeout(resolve, PROCTOR_APPLY_WAIT_MS)),
      ]);
      setApplying(false);
      if (stagedRef.current !== current) return;
    }
    try {
      if (next.kind === "photo") {
        await timerBackgroundPhotoStore().updateFit(next.photoId, fit);
      }
    } catch {
      showToast(t("timerBackground.applyFailed"));
      return;
    }
    if (!writeTimerBackground(next)) {
      showToast(t("timerBackground.applyFailed"));
      return;
    }
    setSelection(next);
    if (next.kind !== "proctor") void clearWatcherAssets();
    trackTimerBackgroundApplied({ kind: next.kind });
    // 설정 행의 배경 이름이 바로 바뀌도록 사진 목록을 다시 읽은 뒤 설정으로 돌아간다.
    if (next.kind === "photo") {
      await queryClient.invalidateQueries({ queryKey: TIMER_BACKGROUND_PHOTOS_KEY });
    }
    showToast(t("timerBackground.applied"), { persistOnNavigation: true });
    slideBack(navigate);
  }

  const stagedSelection = staged?.selection ?? null;
  const stagedPhoto =
    stagedSelection?.kind === "photo"
      ? (photoList.find((photo) => photo.id === stagedSelection.photoId) ?? null)
      : null;
  const headerTitle =
    stagedSelection === null
      ? t("timerBackground.title")
      : stagedSelection.kind === "photo"
        ? photoName(stagedSelection.photoId)
        : stagedSelection.kind === "proctor"
          ? t("timerBackground.names.proctor")
          : t("timerBackground.simple");

  return (
    <main className="theme-soft-blue bg-soft-blue page-column min-h-dvh pb-10 text-foreground">
      <ScreenBackHeader
        title={headerTitle}
        // 미리보기의 뒤로 가기는 고르지 않고 선택 화면으로 돌아간다.
        onBack={staged === null ? undefined : () => setStaged(null)}
      />

      {/* 화면 맨 위(머리 줄 뒤)부터 칩 아래 끝까지 흐리고, 아래로 갈수록 옅어져 칩 아래 끝에서 사라진다.
          칩 아래 타일은 선명하게 둔다. 블러 층은 가로로 스크롤되는 칩 줄 밖에 둬야 함께 밀리지 않는다. */}
      <div
        inert={staged !== null}
        className="sticky top-[calc(env(safe-area-inset-top)+52px)] z-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-[calc(env(safe-area-inset-top)+52px)] bottom-3.5 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-soft-blue-start)_85%,transparent),color-mix(in_srgb,var(--bg-soft-blue-start)_55%,transparent))] mask-[linear-gradient(180deg,black_80%,transparent)] backdrop-blur-md"
        />
        <div className="relative flex gap-2 overflow-x-auto px-5 pt-2 pb-3.5 scrollbar-none">
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              aria-pressed={activeChip === section}
              onClick={() => jumpTo(section)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-full border pr-4 pl-2.5 text-sm whitespace-nowrap shadow-[0_2px_10px_rgba(15,23,42,0.06)]",
                activeChip === section
                  ? "border-transparent bg-primary font-semibold text-primary-foreground"
                  : "border-border bg-muted font-medium text-foreground",
              )}
            >
              <span aria-hidden="true" className="text-lg leading-6">
                {SECTION_EMOJI[section]}
              </span>
              {t(`timerBackground.sections.${section}`)}
            </button>
          ))}
        </div>
      </div>

      <div inert={staged !== null} className="flex flex-col gap-6 px-5 pt-1">
        <TileSection
          section="mine"
          scrollRow
          sectionRef={(element) => (sectionRefs.current.mine = element)}
        >
          <button
            type="button"
            onClick={() => void addPhoto()}
            disabled={adding}
            aria-busy={adding}
            aria-label={t("timerBackground.addPhoto")}
            className={cn(
              TILE,
              "flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border-strong text-sm font-medium text-foreground",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-muted shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
              <Plus aria-hidden="true" className="size-5" />
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span>{t("timerBackground.addPhoto")}</span>
              <span className="text-xs leading-4 text-muted-foreground tabular-nums">
                {t("timerBackground.photoCount", {
                  count: photoList.length,
                  max: MAX_BACKGROUND_PHOTOS,
                })}
              </span>
            </span>
          </button>
          {photoList.map((photo) => {
            const inUse = effective.kind === "photo" && effective.photoId === photo.id;
            const name = photoName(photo.id);
            return (
              <div key={photo.id} className="relative">
                <button
                  type="button"
                  aria-label={name}
                  aria-pressed={inUse}
                  onClick={() => openPreview({ kind: "photo", photoId: photo.id }, photo.fit)}
                  className={cn(TILE, inUse && SELECTED_RING)}
                >
                  <img
                    src={photo.src}
                    alt=""
                    className={cn("size-full object-cover", REPLAY_BLOCKED)}
                  />
                </button>
                {inUse && (
                  <span className={cn(BADGE, "bottom-2 left-2")}>{t("timerBackground.inUse")}</span>
                )}
                <button
                  type="button"
                  aria-label={t("timerBackground.removePhoto", { name })}
                  onClick={() => void removePhoto(photo)}
                  className="absolute top-0 right-0 flex size-11 items-center justify-center"
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-white",
                      PILL_BG,
                    )}
                  >
                    <X aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              </div>
            );
          })}
        </TileSection>

        <TileSection
          section="watch"
          description={t("timerBackground.watchDescription")}
          sectionRef={(element) => (sectionRefs.current.watch = element)}
        >
          <button
            type="button"
            aria-label={t("timerBackground.names.proctor")}
            aria-pressed={effective.kind === "proctor"}
            onClick={() => openPreview(PROCTOR_BACKGROUND)}
            className={cn(TILE, "bg-bg-layer-2", effective.kind === "proctor" && SELECTED_RING)}
          >
            {/* 미리보기를 연 동안은 그쪽이 같은 영상을 트니 타일은 빈 방으로 쉰다. */}
            {staged === null ? (
              <WatcherDemo />
            ) : (
              <img
                src={PROCTOR_TILE_URL}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/50 to-transparent p-2.5 pt-6 text-left text-xs leading-4 font-medium text-white">
              {t("timerBackground.names.proctor")}
            </span>
            {effective.kind === "proctor" && (
              <span className={cn(BADGE, "top-2 right-2")}>{t("timerBackground.inUse")}</span>
            )}
          </button>
          {WATCH_BACKGROUNDS.map((background) => (
            <UpcomingTile key={background.id} background={background} />
          ))}
        </TileSection>

        <TileSection
          section="nature"
          sectionRef={(element) => (sectionRefs.current.nature = element)}
        >
          {NATURE_BACKGROUNDS.map((background) => (
            <UpcomingTile key={background.id} background={background} />
          ))}
        </TileSection>

        {/* 마지막 묶음도 칩으로 맨 위까지 올라오도록 화면 높이만큼 자리를 둔다. */}
        <TileSection
          section="simple"
          description={t("timerBackground.simpleDescription")}
          sectionRef={(element) => (sectionRefs.current.simple = element)}
          className="min-h-[70dvh]"
        >
          <button
            type="button"
            aria-label={t("timerBackground.simple")}
            aria-pressed={effective.kind === "simple"}
            onClick={() => openPreview(SIMPLE_BACKGROUND)}
            className={cn(TILE, effective.kind === "simple" && SELECTED_RING)}
            style={{ backgroundColor: SIMPLE_BACKGROUND_COLOR }}
          >
            <span className="absolute inset-0 shadow-[inset_0_0_40px_2px_rgba(27,100,218,0.32),inset_0_0_14px_rgba(69,147,252,0.16)]" />
            <span className="absolute inset-x-0 bottom-0 p-2.5 text-left text-xs leading-4 font-medium text-white">
              {t("timerBackground.simple")}
            </span>
            {effective.kind === "simple" && (
              <span className={cn(BADGE, "top-2 right-2")}>{t("timerBackground.inUse")}</span>
            )}
          </button>
        </TileSection>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void onFileChange(event)}
      />

      {staged !== null && (
        <TimerBackgroundPreview
          photo={stagedPhoto}
          proctor={stagedSelection?.kind === "proctor"}
          fit={staged.fit}
          onFitChange={(fit) => setStaged({ ...staged, fit })}
          applying={applying}
          onApply={() => void apply(staged)}
        />
      )}
    </main>
  );
}

function TileSection({
  section,
  description,
  sectionRef,
  className,
  scrollRow = false,
  children,
}: {
  section: Section;
  description?: string;
  sectionRef: (element: HTMLElement | null) => void;
  className?: string;
  /** 한 줄에 두고 좌우로 넘긴다. 타일 너비는 세 칸 격자와 같다. */
  scrollRow?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("settings");
  return (
    <section ref={sectionRef} className={cn(SECTION_SCROLL_MARGIN, className)}>
      <h2
        className={cn(
          "flex items-center gap-2 text-lg leading-6.5 font-bold",
          description === undefined ? "mb-3" : "mb-1",
        )}
      >
        <span aria-hidden="true" className="text-xl">
          {SECTION_EMOJI[section]}
        </span>
        {t(`timerBackground.sections.${section}`)}
      </h2>
      {description !== undefined && (
        <p className="mb-3 text-[13px] leading-5 text-muted-foreground">{description}</p>
      )}
      {scrollRow ? (
        // 줄을 화면 가장자리까지 넓혀 넘길 때 타일이 여백에서 잘리지 않게 하고, 타일 단위로 멈춘다.
        <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 scrollbar-none *:w-[calc((100%-1.5rem)/3)] *:shrink-0 *:snap-start">
          {children}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">{children}</div>
      )}
    </section>
  );
}

/** 출시 전 배경 타일. 흐린 장면 사진 위에 `출시 예정`을 두고 누를 수 없다. */
function UpcomingTile({ background }: { background: UpcomingBackground }) {
  const { t } = useTranslation("settings");
  const name = t(`timerBackground.names.${background.nameKey}`);
  return (
    <div
      role="img"
      aria-label={`${name}, ${t("timerBackground.soon")}`}
      className={cn(TILE, "bg-bg-layer-2")}
    >
      <img
        src={`/images/timer-background/${background.nameKey}.jpg`}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full scale-106 object-cover blur-[3px]"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/22">
        <span
          className={cn(
            "rounded-full px-2.5 py-1.25 text-xs leading-4 font-medium text-white",
            PILL_BG,
          )}
        >
          {t("timerBackground.soon")}
        </span>
      </span>
    </div>
  );
}
