import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { ProfileErrorCode, ProfileUpdateRequest } from "@focusmakers/types";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CATEGORY_CHIPS } from "@/features/profile/categoryChips";
import { ProfileAvatar } from "@/features/profile/ProfileAvatar";
import { markProfileSaved } from "@/features/profile/profileSavedNotice";
import {
  validateGoal,
  validateNickname,
  validateNicknameLength,
} from "@/features/profile/profileValidation";
import { trackProfileSaveResult } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { updateProfile } from "@/lib/profileApi";
import { profileKeys, profileQuery } from "@/lib/profileQueries";
import { parseUserId } from "@/lib/userId";

/**
 * 프로필 설정
 *
 * 진입은 설정 > 프로필 설정이 유일하다 — 최초 가입 유도·룸 진입 시 확인이 없다(명세).
 */
type FieldErrors = { nickname?: string; goal?: string; general?: string };

export function ProfilePage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const userId = parseUserId(searchParams.get("userId"));

  const query = useQuery({ ...profileQuery(userId ?? 0), enabled: userId !== null });

  const [nickname, setNickname] = useState("");
  const [goal, setGoal] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  // 서버 프로필이 도착하면 폼을 그 값으로 시작한다. 재조회로 참조가 바뀌어도 사용자가 편집 중인
  // 값을 덮지 않도록 최초 1회만 반영한다.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && query.data) {
      setNickname(query.data.nickname);
      setGoal(query.data.goal ?? "");
      setCategory(query.data.category);
      setInitialized(true);
    }
  }, [initialized, query.data]);

  const navigate = useNavigate();

  const saveMutation = useMutation({
    mutationFn: (patch: ProfileUpdateRequest) => updateProfile(userId as number, patch),
    onSuccess: (data) => {
      // PATCH가 전체 프로필을 반환하므로 invalidate 대신 캐시를 바로 갱신한다(profileQueries 주석).
      queryClient.setQueryData(profileKeys.detail(userId as number), data);
      trackProfileSaveResult({ ok: true });
      setErrors({});
      // 복귀한 설정 화면이 "프로필이 저장됐어요" 토스트를 띄우게 표식을 남긴다(시안 A).
      markProfileSaved();
      // 저장 성공 시 설정 화면으로 복귀한다(2026-08-25 BY-427 확정 — "저장=완료").
      // ScreenBackHeader와 같은 판단: 스택이 있으면 뒤로, 딥링크 직행이면 설정 탭으로.
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      // 쿼리(userId 등)를 승계하지 않으면 설정이 미저장 모드로 뜬다(BY-327과 같은 함정).
      navigate({ pathname: "/settings", search: searchParams.toString() }, { replace: true });
    },
    onError: (error) => {
      trackProfileSaveResult({
        ok: false,
        // 서버 코드 또는 HTTP 상태만 — 문구는 싣지 않는다(joinErrorReason과 같은 규칙).
        reason:
          error instanceof ApiError ? (error.code ?? `HTTP_${error.status}`) : "NETWORK_OR_UNKNOWN",
      });
      if (
        error instanceof ApiError &&
        (error.code === ("NICKNAME_TAKEN" satisfies ProfileErrorCode) ||
          // 서버가 code를 누락하는 사례 대비(BY-404 규칙의 의도적 예외 — joinErrorCopy.ts와
          // 같은 판단): 409(Conflict)는 닉네임 중복뿐이라 필드 인라인으로 안내한다.
          (error.code === undefined && error.status === 409))
      ) {
        setErrors({ nickname: "이미 사용 중인 닉네임이에요" });
        return;
      }
      setErrors({ general: "잠시 후 다시 시도해 주세요" });
    },
  });

  if (userId === null || query.isError) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <ScreenBackHeader />
        <div className="px-5 pt-4" data-testid="profile-error">
          <ErrorState
            message="프로필을 불러오지 못했어요"
            onRetry={() => {
              void query.refetch();
            }}
          />
        </div>
      </main>
    );
  }

  if (!query.data) {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <ScreenBackHeader />
        <div className="flex flex-col gap-4 px-5 pt-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mx-auto size-[72px] rounded-full" />
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      </main>
    );
  }

  const profile = query.data;

  // 변경된 필드만 담는다 — 목표는 빈 문자열을 null(미설정)로 정규화해 비교한다.
  const normalizedGoal = goal === "" ? null : goal;
  const patch: ProfileUpdateRequest = {};
  if (nickname !== profile.nickname) {
    patch.nickname = nickname;
  }
  if (normalizedGoal !== profile.goal) {
    patch.goal = normalizedGoal;
  }
  if (category !== profile.category) {
    patch.category = category;
  }
  const isDirty = Object.keys(patch).length > 0;

  const handleSave = () => {
    const nextErrors: FieldErrors = {};
    if (patch.nickname !== undefined) {
      const nicknameError = validateNickname(nickname);
      if (nicknameError !== null) {
        nextErrors.nickname = nicknameError;
      }
    }
    if (patch.goal !== undefined && patch.goal !== null) {
      const goalError = validateGoal(patch.goal);
      if (goalError !== null) {
        nextErrors.goal = goalError;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    saveMutation.mutate(patch);
  };

  return (
    <main
      data-testid="profile-page"
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      <ScreenBackHeader />

      <div className="flex flex-col gap-[18px] px-5 pt-2 pb-6">
        <h1 className="text-[22px] leading-[27px] font-bold text-foreground">프로필 설정</h1>

        <div className="flex justify-center py-1">
          {/* 이니셜은 입력 중 닉네임에서 즉시 파생한다(2026-08-25 피드백) — 저장 후에야
              바뀌면 아바타가 낡은 글자를 들고 있다. 빈 입력은 서버 이니셜로 폴백. */}
          <ProfileAvatar
            initial={nickname.charAt(0) || profile.initial}
            colorIndex={profile.colorIndex}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="profile-nickname"
            className="text-[13px] font-medium text-muted-foreground"
          >
            닉네임
          </label>
          <input
            id="profile-nickname"
            type="text"
            value={nickname}
            // 목표 문구와 같은 규칙 — maxLength로 조용히 막지 않고, 12자 초과는 입력 중에
            // 바로 안내한다. 형식·최소 길이 검증은 저장 시점(validateNickname)에만 한다.
            onChange={(event) => {
              const value = event.target.value;
              setNickname(value);
              setErrors((prev) => ({
                ...prev,
                nickname: validateNicknameLength(value) ?? undefined,
              }));
            }}
            aria-invalid={errors.nickname !== undefined || undefined}
            aria-describedby={errors.nickname !== undefined ? "profile-nickname-error" : undefined}
            className="h-[52px] rounded-xl border border-border bg-muted px-4 text-[15px] text-foreground"
          />
          {errors.nickname !== undefined && (
            <p
              id="profile-nickname-error"
              role="alert"
              className="text-sm text-state-distract-text"
            >
              {errors.nickname}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="profile-goal" className="text-[13px] font-medium text-muted-foreground">
            목표 문구
          </label>
          <input
            id="profile-goal"
            type="text"
            value={goal}
            // maxLength를 걸지 않는다 — 20자에서 입력이 조용히 막히면 왜 안 쳐지는지 알 수
            // 없다(2026-08-25 피드백). 초과 입력을 허용하고 아래에서 바로 안내하며, 저장은
            // handleSave의 validateGoal이 막는다.
            onChange={(event) => {
              const value = event.target.value;
              setGoal(value);
              setErrors((prev) => ({ ...prev, goal: validateGoal(value) ?? undefined }));
            }}
            aria-invalid={errors.goal !== undefined || undefined}
            aria-describedby={errors.goal !== undefined ? "profile-goal-error" : undefined}
            className="h-[52px] rounded-xl border border-border bg-muted px-4 text-[15px] text-foreground"
          />
          {errors.goal !== undefined && (
            <p id="profile-goal-error" role="alert" className="text-sm text-state-distract-text">
              {errors.goal}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">목표 카테고리</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="목표 카테고리">
            {CATEGORY_CHIPS.map((chip) => {
              const selected = category === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    // 같은 칩을 다시 누르면 해제한다 — 카테고리는 선택 항목(null 허용).
                    setCategory(selected ? null : chip.value);
                  }}
                  className="flex min-h-11 items-center"
                >
                  <span
                    className={
                      selected
                        ? "rounded-full bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground"
                        : "rounded-full border border-border bg-muted px-3.5 py-2 text-[13px] font-medium text-muted-foreground"
                    }
                  >
                    {chip.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {errors.general !== undefined && (
          <p role="alert" className="text-sm text-state-distract-text">
            {errors.general}
          </p>
        )}
      </div>

      <div className="mt-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          type="button"
          // 길이 초과(목표 20자·닉네임 12자)는 입력 중 인라인 안내와 함께 저장 버튼도
          // 잠근다(2026-08-25 피드백) — 눌러도 거부될 버튼을 활성으로 두지 않는다.
          disabled={
            !isDirty ||
            saveMutation.isPending ||
            validateGoal(goal) !== null ||
            validateNicknameLength(nickname) !== null
          }
          onClick={handleSave}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saveMutation.isPending ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </main>
  );
}
