import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { formatDuration } from "@/features/records/recordsFormat";

import { AdUnavailableDialog } from "../components/earn/AdUnavailableDialog";
import { ChargeDoneSheet, type ChargeDone } from "../components/earn/ChargeDoneSheet";
import { ChargePackGrid } from "../components/earn/ChargePackGrid";
import { FreeTile, TileButton, TileDone } from "../components/earn/FreeTile";
import { MedalCard } from "../components/earn/MedalCard";
import { openAppStore } from "../components/earn/openAppStore";
import { OpenInAppCard } from "../components/earn/OpenInAppCard";
import { packImage } from "../components/earn/packImage";
import { PaymentFailedSheet } from "../components/earn/PaymentFailedSheet";
import { StudyRow } from "../components/earn/StudyRow";
import { Progress } from "@/components/ui/progress";
import { formatPoints, formatSignedPoints } from "../model/formatPoints";
import { pointsSearch } from "../pointsSearch";
import type { AdResult, ChargePack, ChargeResult, ClaimKind, EarnToday } from "../types";

/**
 * 포인트 받기 탭
 *
 * 받은 직후 칸이 바로 바뀌도록 받은 표시는 화면에 들고 있고, 다시 받아 온 값이 오면 그 값과 합친다.
 * 받기·광고·충전은 잔액을 고친 뒤의 결과를 돌려줘서 완료·실패 창을 여기서 고른다.
 */
export function EarnTab({
  earn,
  packs,
  inApp,
  onClaim,
  onWatchAd,
  onCharge,
}: {
  earn: EarnToday;
  packs: ChargePack[];
  inApp: boolean;
  onClaim: (kind: ClaimKind) => Promise<{ balance: number }>;
  onWatchAd: () => Promise<AdResult>;
  onCharge: (productId: string) => Promise<ChargeResult>;
}) {
  const { t } = useTranslation("points-earn");
  const navigate = useNavigate();
  const location = useLocation();
  const [claimed, setClaimed] = useState<Set<ClaimKind>>(new Set());
  const [watchedAtLeast, setWatchedAtLeast] = useState(0);
  const [adUnavailable, setAdUnavailable] = useState(false);
  const [done, setDone] = useState<ChargeDone | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // 같은 요청이 두 번 나가지 않게 처리 중인 일을 ref로도 막는다(상태는 다음 렌더에야 바뀐다).
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const run = async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await task();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const claim = (kind: ClaimKind) =>
    run(async () => {
      await onClaim(kind);
      setClaimed((prev) => new Set(prev).add(kind));
    });

  const watchAd = () =>
    run(async () => {
      const result = await onWatchAd();
      if (result.status === "rewarded") setWatchedAtLeast(watched + 1);
      if (result.status === "unavailable") setAdUnavailable(true);
    });

  const charge = (productId: string) =>
    run(async () => {
      const result = await onCharge(productId);
      if (result.status === "completed") {
        setFailedFor(null);
        const index = packs.findIndex((pack) => pack.productId === productId);
        setDone({
          granted: result.granted,
          bonus: result.bonus,
          balance: result.balance,
          image: packImage(Math.max(index, 0)),
        });
      } else {
        setFailedFor(productId);
      }
    });

  const watched = Math.max(earn.ad.watched, watchedAtLeast);
  const attendanceClaimed = earn.attendance.claimed || claimed.has("attendance");
  const goalClaimed = earn.dailyGoal.claimed || claimed.has("dailyGoal");
  const medals = claimed.has("medals") ? [] : earn.medals;
  const adDone = watched >= earn.ad.limit;
  const goalTotal = earn.study.focusSec + earn.dailyGoal.remainingSec;
  const goalPercent = goalTotal === 0 ? 0 : Math.round((earn.study.focusSec / goalTotal) * 100);

  return (
    <div className="flex flex-col gap-3.5">
      <section
        aria-label={t("header.title")}
        className="flex flex-col gap-2.5 rounded-xl bg-muted px-3 pt-3.5 pb-3 shadow-sb-card"
      >
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-base font-bold">{t("header.title")}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("header.today", {
              earned: formatPoints(earn.earned),
              max: formatPoints(earn.dailyMax),
            })}
          </span>
        </div>
        <StudyRow study={earn.study} />
        <div className="grid grid-cols-3 gap-2">
          <FreeTile
            icon="attendance"
            label={t("tile.attendance")}
            reward={formatSignedPoints(earn.attendance.reward)}
          >
            {attendanceClaimed ? (
              <TileDone label={t("tile.done")} />
            ) : (
              <TileButton disabled={pending} onClick={() => void claim("attendance")}>
                {t("tile.claim")}
              </TileButton>
            )}
          </FreeTile>
          <FreeTile
            icon="dailyGoal"
            label={t("tile.dailyGoal")}
            reward={formatSignedPoints(earn.dailyGoal.reward)}
          >
            {goalClaimed ? (
              <TileDone label={t("tile.done")} />
            ) : earn.dailyGoal.achieved ? (
              <TileButton disabled={pending} onClick={() => void claim("dailyGoal")}>
                {t("tile.claim")}
              </TileButton>
            ) : (
              <div className="flex min-h-11 flex-col justify-center gap-1 px-1">
                <Progress
                  value={goalPercent}
                  aria-label={t("tile.goalAria", { percent: goalPercent })}
                  className="h-1.5 bg-brand-subtle"
                />
                <span className="text-[11px] break-keep text-muted-foreground">
                  {t("tile.left", { duration: formatDuration(earn.dailyGoal.remainingSec) })}
                </span>
              </div>
            )}
          </FreeTile>
          <FreeTile
            icon="ad"
            label={t("tile.ad")}
            count={`${watched}/${earn.ad.limit}`}
            reward={formatSignedPoints(earn.ad.reward)}
          >
            {!inApp ? (
              <TileButton quiet onClick={openAppStore}>
                {t("tile.openInApp")}
              </TileButton>
            ) : adDone ? (
              <TileDone label={t("tile.done")} />
            ) : (
              <TileButton disabled={pending} onClick={() => void watchAd()}>
                {t("tile.watch")}
              </TileButton>
            )}
          </FreeTile>
        </div>
      </section>

      <MedalCard
        medals={medals}
        rates={earn.medalRates}
        pending={pending}
        onClaim={() => void claim("medals")}
      />

      {inApp ? (
        <section
          aria-label={t("charge.title")}
          className="flex flex-col gap-3.5 rounded-xl bg-muted px-3 pt-3.5 pb-3 shadow-sb-card"
        >
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-base font-bold">{t("charge.title")}</h2>
            <Link
              to="/terms"
              className="flex min-h-11 items-center text-[13px] font-semibold text-muted-foreground"
            >
              {t("charge.guide")}
            </Link>
          </div>
          <ChargePackGrid
            packs={packs}
            pending={pending}
            onCharge={(pack) => void charge(pack.productId)}
          />
        </section>
      ) : (
        <OpenInAppCard />
      )}

      <AdUnavailableDialog open={adUnavailable} onClose={() => setAdUnavailable(false)} />
      <ChargeDoneSheet
        done={done}
        onClose={() => setDone(null)}
        onShop={() => {
          setDone(null);
          navigate(
            { pathname: "/points", search: pointsSearch(location.search, "shop") },
            { replace: true },
          );
        }}
      />
      <PaymentFailedSheet
        open={failedFor !== null}
        onClose={() => setFailedFor(null)}
        onRetry={() => {
          const productId = failedFor;
          setFailedFor(null);
          if (productId !== null) void charge(productId);
        }}
      />
    </div>
  );
}
