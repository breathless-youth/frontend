/**
 * 포인트 충전 상품과 받기 탭 API 응답
 *
 * 2026-11-16 개발 서버 Swagger(`PointProductsResponse`, `EarnOverviewResponse`)와 필드를 대조했다.
 * 이름은 웹이 먼저 쓰던 이름을 유지한다.
 * 새로 생긴 필드는 그 필드가 생기기 전의 서버도 받을 수 있게 선택으로 둔다.
 */

export type PointProductResponse = {
  id: number;
  storeProductId: string;
  points: number;
  bonusPoints: number;
  totalPoints: number;
};

export type PointProductsResponse = {
  items: PointProductResponse[];
  /** 결제 SDK에 로그인할 때 쓰는 결제용 ID이며 회원번호와 다르다. 비회원은 null이고 이 필드가 생기기 전의 서버는 주지 않는다. */
  revenueCatAppUserId?: string | null;
};

/** 공부 포인트의 구간 하나이며 unitSec마다 혼자면 soloPoints, 같이면 togetherPoints를 준다. */
export type StudyPointTierResponse = {
  fromSec: number;
  toSec: number;
  soloPoints: number;
  togetherPoints: number;
};

/** 하루 목표 포인트의 구간 하나이며 목표 시간의 unitSec마다 points를 준다. */
export type GoalPointTierResponse = { fromSec: number; toSec: number; points: number };

export type PointsEarnResponse = {
  date: string;
  todayEarned: number;
  dailyMax: number;
  study: {
    recognizedFocusSec: number;
    dailyCapFocusSec: number;
    unitSec: number;
    /** 첫 구간의 혼자 값이며 구간을 그리는 화면은 tiers를 쓴다. */
    pointsPerUnit: number;
    earnedPoints: number;
    /** 상한까지 모두 같이 한 경우의 최대다. */
    maxPoints: number;
    /** 오늘 순공 가운데 방에 나 말고 한 명 이상 있던 시간이며 아래 두 필드는 구간이 생기기 전의 서버가 주지 않는다. */
    togetherFocusSec?: number;
    tiers?: StudyPointTierResponse[];
  };
  attendance: { points: number; claimed: boolean };
  /** 목표가 없으면 goalSec와 remainingSec이 null이고 points는 0이다. */
  dailyGoal: {
    points: number;
    /** 목표 시간의 이만큼마다 구간 값을 준다. 이 기준이 생기기 전의 서버는 주지 않는다. */
    unitSec?: number;
    /** 첫 구간의 값이며 구간을 그리는 화면은 tiers를 쓴다. */
    pointsPerUnit?: number;
    /** 이보다 긴 목표 시간은 세지 않으며 아래 두 필드는 구간이 생기기 전의 서버가 주지 않는다. */
    capSec?: number;
    tiers?: GoalPointTierResponse[];
    goalSec: number | null;
    focusSec: number;
    remainingSec: number | null;
    achieved: boolean;
    claimed: boolean;
  };
  /** 광고 보상이 생기기 전의 서버는 주지 않는다. available이 false면 서버에 광고 단위가 설정되지 않은 것이다. */
  ad?: { available: boolean; points: number; watchedToday: number; dailyLimit: number };
  medals: {
    recordId: number;
    boardKey: string;
    period: string;
    periodStart: string;
    rank: number;
    points: number;
  }[];
  /** 1·2·3위 순서다. */
  medalPoints: { daily: number[]; weekly: number[]; monthly: number[] };
};
