import { z } from "zod";

import { CATEGORY_CHIPS } from "@/features/profile/categoryChips";
import {
  normalizeNickname,
  validateGoal,
  validateNickname,
} from "@/features/profile/profileValidation";

export type ProfileFormValues = { nickname: string; goal: string; category: string | null };

const CATEGORY_VALUES: ReadonlySet<string> = new Set(CATEGORY_CHIPS.map((chip) => chip.value));

/**
 * 프로필 폼 스키마
 *
 * 규칙은 profileValidation의 함수를 그대로 불러 한 곳에만 둔다.
 * 닉네임·목표·카테고리는 원래 값에서 바뀌었을 때만 검사한다.
 * 지금 규칙 이전에 만든 값을 그대로 둔 채 다른 필드만 고치는 저장까지 막으면 안 되기 때문이다.
 */
export function makeProfileSchema(original: {
  nickname: string;
  goal: string | null;
  category: string | null;
}) {
  return z
    .object({
      nickname: z.string(),
      goal: z.string(),
      category: z.string().nullable(),
    })
    .superRefine((values, ctx) => {
      if (normalizeNickname(values.nickname) !== original.nickname) {
        const message = validateNickname(values.nickname);
        if (message !== null) {
          ctx.addIssue({ code: "custom", path: ["nickname"], message });
        }
      }
      if ((values.goal === "" ? null : values.goal) !== original.goal) {
        const goalMessage = validateGoal(values.goal);
        if (goalMessage !== null) {
          ctx.addIssue({ code: "custom", path: ["goal"], message: goalMessage });
        }
      }
      if (
        values.category !== original.category &&
        values.category !== null &&
        !CATEGORY_VALUES.has(values.category)
      ) {
        // 칩으로만 고르므로 화면에서는 나올 수 없다.
        // 스키마가 목록 밖 값을 흘려보내지 않게 막는다.
        ctx.addIssue({ code: "custom", path: ["category"], message: "목록에 없는 카테고리예요" });
      }
    });
}
