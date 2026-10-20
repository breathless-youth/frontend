import { expect, it } from "vitest";

import {
  formatAppLockRowValue,
  formatLockedAppsSummary,
  formatLockStartedToast,
} from "../appLockSummary";

it.each([
  [0, 0, "선택 안 함"],
  [3, 0, "앱 3개"],
  [0, 1, "카테고리 1개"],
  [3, 1, "앱 3개 · 카테고리 1개"],
])("앱 %i개·카테고리 %i개 요약은 %s다", (apps, categories, expected) => {
  expect(formatLockedAppsSummary(apps, categories)).toBe(expected);
});

it.each([
  [3, 0, "방해 앱 3개를 잠갔어요"],
  [0, 1, "방해 앱을 잠갔어요"],
  [3, 1, "방해 앱을 잠갔어요"],
])("앱 %i개·카테고리 %i개 시작 토스트는 %s다", (apps, categories, expected) => {
  expect(formatLockStartedToast(apps, categories)).toBe(expected);
});

it.each([
  [false, 3, 1, "꺼짐"],
  [true, 0, 0, "켜짐"],
  [true, 3, 0, "앱 3개"],
])("켜짐 %s·앱 %i개·카테고리 %i개의 설정 행 값은 %s다", (enabled, apps, categories, expected) => {
  expect(formatAppLockRowValue(enabled, apps, categories)).toBe(expected);
});
