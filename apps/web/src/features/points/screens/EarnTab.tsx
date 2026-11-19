import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { formatDuration } from "@/features/records/recordsFormat";
import { showToast } from "@/lib/toast";

import { isMemberOnlyError } from "../gateway/memberOnly";
import { isRewardNotOpenError } from "../gateway/rewardNotOpen";

import { AdUnavailableDialog } from "../components/earn/AdUnavailableDialog";
import { ChargeDoneSheet, type ChargeDone } from "../components/earn/ChargeDoneSheet";
import { ChargePackGrid } from "../components/earn/ChargePackGrid";
import { EarnIcon } from "../components/earn/EarnIcon";
import { FreeTile, TileButton, TileDone } from "../components/earn/FreeTile";
import { MedalCard } from "../components/earn/MedalCard";
import { openAppStore } from "../components/earn/openAppStore";
import { OpenInAppCard } from "../components/earn/OpenInAppCard";
import { packImage } from "../components/earn/packImage";
import { ChargingDialog } from "../components/earn/ChargingDialog";
import { LatePointsDialog } from "../components/earn/LatePointsDialog";
import { PaymentFailedSheet } from "../components/earn/PaymentFailedSheet";
import { StudyRow } from "../components/earn/StudyRow";
import { PaymentGuideLink } from "../components/shared/PaymentGuide";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Progress } from "@/components/ui/progress";
import { formatPoints, formatSignedPoints } from "../model/formatPoints";
import { pointsSearch } from "../pointsSearch";
import type {
  AdResult,
  ChargePack,
  ChargeResult,
  ClaimKind,
  ClaimResult,
  EarnToday,
} from "../types";

/**
 * 포인트 받기 탭
 *
 * 받은 직후 칸이 바로 바뀌도록 받은 표시는 화면에 들고 있고, 다시 받아 온 값이 오면 그 값과 합친다.
 * 받기·광고·충전은 잔액을 고친 뒤의 결과를 돌려줘서 완료·실패 창을 여기서 고른다.
 * 요청이 아예 실패하면 알림만 띄우고 버튼을 다시 누를 수 있게 둔다.
 * 서버가 아직 포인트를 쌓지 않는다고 거절하면 일반 실패 대신 출시 뒤에 받을 수 있다는 알림을 띄운다.
 * 이 거절을 한 번 받은 뒤에는 광고를 다 봐도 포인트가 들어오지 않으므로, 이 화면에서는 광고를 띄우지 않고 같은 알림만 띄운다.
 * 광고와 충전 처리기는 앱 안에서만 넘어오고, 없으면 앱에서 열기 안내를 그린다.
 * 앱 안인데 그 기능을 맡지 못하는 예전 앱에서는 안내 대신 칸을 그리지 않는다.
 * 받기와 광고는 비회원도 하므로 바로 요청을 보낸다.
 * 충전은 회원만 하므로 누르는 순간 `allowCharge`에 묻고, 비회원이면 결제 창을 열지 않는다.
 * 서버가 회원 전용이라고 거절하면 부른 쪽이 로그인 화면으로 보내므로 여기서는 다시 시도하라고 알리지 않는다.
 */
export function EarnTab({
  earn,
  packs,
  onClaim,
  onWatchAd,
  onCharge,
  chargeAvailable = true,
  adAvailable = true,
  member = true,
  allowCharge = () => true,
}: {
  earn: EarnToday;
  packs: ChargePack[];
  onClaim: (kind: ClaimKind) => Promise<ClaimResult>;
  onWatchAd?: () => Promise<AdResult>;
  onCharge?: (productId: string, onPaid?: () => void) => Promise<ChargeResult>;
  /** 충전을 맡지 못하는 앱에서는 충전 칸과 앱에서 열기 안내를 그리지 않는다. */
  chargeAvailable?: boolean;
  /** 광고를 맡지 못하는 앱에서는 서버가 광고 상태를 줘도 광고 타일을 그리지 않는다. */
  adAvailable?: boolean;
  /** 비회원이면 충전 묶음의 가격 자리에 로그인 안내를 그린다. */
  member?: boolean;
  /** 충전해도 되는지이며 비회원이면 로그인 화면을 열고 false를 준다. */
  allowCharge?: () => boolean;
}) {
  const { t } = useTranslation(["points-earn", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [claimed, setClaimed] = useState<Set<ClaimKind>>(new Set());
  const [watchedAtLeast, setWatchedAtLeast] = useState(0);
  const [adUnavailable, setAdUnavailable] = useState(false);
  const [done, setDone] = useState<ChargeDone | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [late, setLate] = useState(false);
  // 같은 요청이 두 번 나가지 않게 처리 중인 일을 ref로도 막는다(상태는 다음 렌더에야 바뀐다).
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  // 버튼 모양은 그대로라 다시 그릴 필요가 없어 ref에 둔다.
  const rewardNotOpen = useRef(false);

  const run = async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await task();
    } catch (error) {
      if (isRewardNotOpenError(error)) {
        rewardNotOpen.current = true;
        showToast(t("rewardNotOpen"));
      } else if (!isMemberOnlyError(error)) {
        // 서버의 회원 전용 거절은 로그인 화면으로 보내므로 다시 시도하라고 알리지 않는다.
        showToast(t("common:errors.retryLater"));
      }
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

  const watchAd = (handler: () => Promise<AdResult>) =>
    run(async () => {
      if (rewardNotOpen.current) {
        showToast(t("rewardNotOpen"));
        return;
      }
      const result = await handler();
      // 확인이 늦으면 따로 알리지 않고, 뒤에서 다시 읽은 값으로 횟수와 잔액이 바뀐다.
      if (result.status === "rewarded") setWatchedAtLeast(watched + 1);
      if (result.status === "unavailable") setAdUnavailable(true);
    });

  const charge = async (
    handler: (productId: string, onPaid?: () => void) => Promise<ChargeResult>,
    productId: string,
  ) => {
    if (busy.current || !allowCharge()) return;
    await run(async () => {
      let result: ChargeResult;
      try {
        result = await handler(productId, () => setCharging(true));
      } finally {
        setCharging(false);
      }
      if (result.status === "completed") {
        setFailedFor(null);
        const index = packs.findIndex((pack) => pack.productId === productId);
        setDone({
          granted: result.granted,
          bonus: result.bonus,
          balance: result.balance,
          image: packImage(Math.max(index, 0)),
        });
      } else if (result.status === "late") {
        setLate(true);
      } else if (result.status !== "cancelled") {
        // 취소는 사용자가 고른 일이라 실패로 알리지 않는다.
        setFailedFor(productId);
      }
    });
  };

  const ad = adAvailable ? earn.ad : undefined;
  const watched = Math.max(ad?.watched ?? 0, watchedAtLeast);
  const attendanceClaimed = earn.attendance.claimed || claimed.has("attendance");
  const goalClaimed = earn.dailyGoal.claimed || claimed.has("dailyGoal");
  const medals = claimed.has("medals") ? [] : earn.medals;
  const adDone = ad !== undefined && watched >= ad.limit;
  const goalDone = goalClaimed || earn.dailyGoal.achieved;
  const { goalSec, remainingSec, unitSec, pointsPerUnit } = earn.dailyGoal;
  const goalPercent =
    goalSec === null || remainingSec === null || goalSec === 0
      ? 0
      : Math.round(((goalSec - remainingSec) / goalSec) * 100);

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
        <div className="flex flex-col gap-2">
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
          {goalSec === null || remainingSec === null ? (
            <FreeTile icon="dailyGoal" label={t("tile.dailyGoalTitle")}>
              <p className="max-w-32 text-right text-[11px] break-keep text-muted-foreground">
                {t("tile.noGoal")}
              </p>
            </FreeTile>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-bg-layer-2 p-3">
              <EarnIcon name="dailyGoal" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-bold break-keep">
                  <span>
                    <span>{t("tile.goalTitle", { duration: formatDuration(goalSec) })}</span>{" "}
                    <span className="text-primary tabular-nums">
                      {formatSignedPoints(earn.dailyGoal.reward)}
                    </span>
                  </span>
                  {unitSec !== undefined && pointsPerUnit !== undefined && (
                    <InfoTooltip label={t("tile.goalGuide")} iconSize={14}>
                      {t("tile.goalRule", {
                        duration: formatDuration(unitSec),
                        points: formatPoints(pointsPerUnit),
                      })}
                    </InfoTooltip>
                  )}
                </span>
                <Progress
                  value={goalDone ? 100 : goalPercent}
                  aria-label={t("tile.goalAria", { percent: goalDone ? 100 : goalPercent })}
                  className="h-1.5 bg-brand-subtle"
                />
                {!goalDone && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("tile.left", { duration: formatDuration(remainingSec) })}
                  </span>
                )}
              </div>
              {goalClaimed ? (
                <TileDone label={t("tile.done")} />
              ) : earn.dailyGoal.achieved ? (
                <TileButton disabled={pending} onClick={() => void claim("dailyGoal")}>
                  {t("tile.claim")}
                </TileButton>
              ) : null}
            </div>
          )}
          {ad !== undefined && (
            <FreeTile icon="ad" label={t("tile.ad")} reward={formatSignedPoints(ad.reward)}>
              {onWatchAd === undefined ? (
                <TileButton quiet onClick={openAppStore}>
                  {t("tile.openInApp")}
                </TileButton>
              ) : adDone ? (
                <TileDone label={t("tile.done")} />
              ) : (
                <TileButton disabled={pending} onClick={() => void watchAd(onWatchAd)}>
                  {t("tile.watch")}{" "}
                  <span className="tabular-nums">
                    {watched}/{ad.limit}
                  </span>
                </TileButton>
              )}
            </FreeTile>
          )}
        </div>
      </section>

      <MedalCard
        medals={medals}
        rates={earn.medalRates}
        pending={pending}
        onClaim={() => void claim("medals")}
      />

      {!chargeAvailable ? null : onCharge !== undefined ? (
        <section
          aria-label={t("charge.title")}
          className="flex flex-col gap-2.5 rounded-xl bg-muted px-3 pt-3.5 pb-3 shadow-sb-card"
        >
          <h2 className="px-1 text-base font-bold">{t("charge.title")}</h2>
          <ChargePackGrid
            packs={packs}
            pending={pending}
            member={member}
            onCharge={(pack) => void charge(onCharge, pack.productId)}
          />
          <PaymentGuideLink />
        </section>
      ) : (
        <OpenInAppCard />
      )}

      <AdUnavailableDialog open={adUnavailable} onClose={() => setAdUnavailable(false)} />
      <ChargingDialog open={charging} />
      <LatePointsDialog open={late} onClose={() => setLate(false)} />
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
          if (productId !== null && onCharge !== undefined) void charge(onCharge, productId);
        }}
      />
    </div>
  );
}
