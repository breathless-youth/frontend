import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { ProfileResponse, ProfileUpdateRequest } from "@focusmakers/types";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { CharCount } from "@/components/ui/char-count";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/Skeleton";
import { CtaToaster } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_CHIPS } from "@/features/profile/categoryChips";
import { ProfilePhotoButton } from "@/features/profile/ProfilePhotoButton";
import { makeProfileSchema, type ProfileFormValues } from "@/features/profile/profileSchema";
import {
  NICKNAME_RULE_MESSAGE,
  normalizeGoal,
  normalizeNickname,
} from "@/features/profile/profileValidation";
import { trackProfileSaveResult, trackProfileSaveSubmitted } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { postToNative } from "@/lib/bridge";
import { canSegmentGraphemes, countGraphemes, firstGrapheme } from "@/lib/graphemes";
import { updateProfile } from "@/lib/profileApi";
import { profileKeys, profileQuery } from "@/lib/profileQueries";
import { showCtaToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";

const LABEL_CLASS = "text-[13px] font-medium text-muted-foreground";

/**
 * 프로필 설정
 *
 * 진입은 설정 > 프로필 설정이 유일하다 — 최초 가입 유도·룸 진입 시 확인이 없다(명세).
 */
export function ProfilePage() {
  const userId = useUserId();
  const query = useQuery({ ...profileQuery(userId ?? 0), enabled: userId !== null });

  // 캐시가 있으면 백그라운드 재조회가 실패해도 폼을 그대로 둔다.
  // 오류 화면으로 바꾸면 폼이 언마운트돼 사용자가 고치던 값이 사라진다.
  if (userId === null || (query.isError && !query.data)) {
    return (
      <main className="theme-soft-blue bg-soft-blue page-column min-h-dvh text-foreground">
        <ScreenBackHeader title="프로필 수정" />
        <div className="px-5 pt-4" data-testid="profile-error">
          <ErrorState
            screen="profile"
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
      <main className="theme-soft-blue bg-soft-blue page-column min-h-dvh text-foreground">
        <ScreenBackHeader title="프로필 수정" />
        <div className="flex flex-col gap-4 px-5 pt-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mx-auto size-18 rounded-full" />
          <Skeleton className="h-13 w-full" />
          <Skeleton className="h-13 w-full" />
        </div>
      </main>
    );
  }

  return <ProfileForm profile={query.data} userId={userId} />;
}

/**
 * 저장할 변경분
 *
 * 닉네임은 서버와 같은 정규화(normalizeNickname)를 거친 값으로 비교하고 보낸다.
 * 목표를 지울 때는 null이 아니라 빈 문자열을 보낸다.
 * 서버가 null을 변경 없음으로 처리해서 null을 보내면 기존 문구가 그대로 남기 때문이다.
 */
function buildPatch(values: ProfileFormValues, profile: ProfileResponse): ProfileUpdateRequest {
  const patch: ProfileUpdateRequest = {};
  const nickname = normalizeNickname(values.nickname);
  const goal = normalizeGoal(values.goal);
  if (nickname !== profile.nickname) {
    patch.nickname = nickname;
  }
  if (goal !== normalizeGoal(profile.goal)) {
    patch.goal = goal ?? "";
  }
  if (values.category !== profile.category) {
    patch.category = values.category;
  }
  return patch;
}

// 서버 프로필이 도착하면 폼을 그 값으로 시작한다. 재조회로 참조가 바뀌어도 사용자가 편집 중인
// 값을 덮지 않도록 최초 1회만 반영한다.
function ProfileForm({ profile, userId }: { profile: ProfileResponse; userId: number }) {
  const queryClient = useQueryClient();

  const schema = makeProfileSchema(profile);
  const { control, handleSubmit, setError, trigger, formState } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    // 형식·최소 길이는 칸을 떠날 때 처음 알린다.
    // 타이핑 도중의 미완성 입력까지 매번 알리면 정상 입력 과정이 계속 빨갛게 깜빡인다.
    mode: "onBlur",
    reValidateMode: "onBlur",
    defaultValues: {
      nickname: profile.nickname,
      goal: profile.goal ?? "",
      category: profile.category,
    },
  });
  const [nickname, goal, category] = useWatch({
    control,
    name: ["nickname", "goal", "category"],
  });

  const saveMutation = useMutation({
    mutationFn: (patch: ProfileUpdateRequest) => updateProfile(patch),
    onSuccess: (data) => {
      // PATCH가 전체 프로필을 반환하므로 invalidate 대신 캐시를 바로 갱신한다(profileQueries 주석).
      queryClient.setQueryData(profileKeys.detail(userId), data);
      // 앱이 실행 직후 보여 줄 목표 문구를 네트워크 없이 바로 바꾸게 한다(`ToNativeMessage` 주석).
      postToNative({
        type: "profile-updated",
        goal: data.goal,
        nickname: data.nickname,
        atMs: Date.now(),
      });
      trackProfileSaveResult({ ok: true });
      showCtaToast("프로필이 저장됐어요");
      // 키보드가 떠 있으면 저장 버튼 위 토스트를 가린다.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    onError: (error) => {
      trackProfileSaveResult({
        ok: false,
        // 서버 코드 또는 HTTP 상태만 — 문구는 싣지 않는다(joinErrorReason과 같은 규칙).
        reason:
          error instanceof ApiError ? (error.code ?? `HTTP_${error.status}`) : "NETWORK_OR_UNKNOWN",
      });
      // code가 아니라 HTTP 상태로 가른다 — 서버 공통 코드(CONFLICT·VALIDATION_FAILED)는 어느
      // 필드가 틀렸는지 알려주지 않는다. 프로필 저장의 400은 목표·카테고리를 저장 전에
      // 클라이언트가 이미 막으므로(validateGoal 등) 서버까지 도달하는 400은 닉네임뿐이다.
      if (error instanceof ApiError && error.status === 409) {
        setError("nickname", { message: "이미 사용 중인 닉네임이에요" });
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        setError("nickname", { message: NICKNAME_RULE_MESSAGE });
        return;
      }
      setError("root", { message: "잠시 후 다시 시도해 주세요" });
    },
  });

  const isDirty = Object.keys(buildPatch({ nickname, goal, category }, profile)).length > 0;
  // 스키마처럼 원래 값에서 바뀐 경우만 막는다.
  // 지금 규칙 이전의 긴 값을 둔 채 다른 필드만 저장하는 길은 열어 둔다.
  const nicknameLength = countGraphemes(normalizeNickname(nickname));
  const nicknameOver =
    canSegmentGraphemes && nicknameLength > 12 && normalizeNickname(nickname) !== profile.nickname;
  // 공백뿐인 문구는 빈 문자열로 보내므로 표시와 판정 모두 보낼 값으로 센다.
  const goalLength = (normalizeGoal(goal) ?? "").length;
  const goalOver = goalLength > 20 && normalizeGoal(goal) !== normalizeGoal(profile.goal);

  const onValid = (values: ProfileFormValues) => {
    const patch = buildPatch(values, profile);
    trackProfileSaveSubmitted({
      nickname: patch.nickname !== undefined,
      goal: patch.goal !== undefined,
      category: patch.category !== undefined,
    });
    saveMutation.mutate(patch);
  };

  return (
    <main
      data-testid="profile-page"
      className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground"
    >
      <ScreenBackHeader title="프로필 수정" />

      <form noValidate onSubmit={handleSubmit(onValid)} className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4.5 px-5 pt-2 pb-6">
          <div className="flex justify-center py-1">
            {/* 이니셜은 입력 중 닉네임에서 즉시 파생한다(2026-08-25 피드백) — 저장 후에야
                바뀌면 아바타가 낡은 글자를 들고 있다. 빈 입력은 서버 이니셜로 폴백.
                firstGrapheme은 정규화 후 남은 문자를 그대로 주므로, NBSP·BOM처럼 서버
                String.strip()이 지우지 않는 공백류만 입력했을 때는 그 보이지 않는 문자를
                돌려준다 — trim()을 한 번 더 걸어 그런 공백류뿐이면 서버 이니셜로 폴백시킨다
                (trim()은 NBSP·BOM도 지우므로 여기서는 안전하다). */}
            <ProfilePhotoButton
              userId={userId}
              initial={firstGrapheme(normalizeNickname(nickname)).trim() || profile.initial}
              colorIndex={profile.colorIndex}
              imageUrl={profile.profileImageUrl}
            />
          </div>

          <Controller
            name="nickname"
            control={control}
            render={({ field, fieldState }) => (
              <Field className="gap-2">
                <FieldLabel htmlFor="profile-nickname" className={LABEL_CLASS}>
                  닉네임
                </FieldLabel>
                <Input
                  {...field}
                  id="profile-nickname"
                  type="text"
                  onChange={(event) => {
                    field.onChange(event);
                    // 첫 오류는 blur에서만 띄우지만, 한도를 넘는 순간은 저장이 막히는 이유를 바로 알린다.
                    if (
                      fieldState.invalid ||
                      countGraphemes(normalizeNickname(event.target.value)) > 12
                    ) {
                      void trigger("nickname");
                    }
                  }}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={
                    fieldState.invalid
                      ? "profile-nickname-error profile-nickname-count"
                      : "profile-nickname-count"
                  }
                />
                <div className="flex flex-col gap-1">
                  <FieldError id="profile-nickname-error" errors={[fieldState.error]} />
                  <CharCount id="profile-nickname-count" length={nicknameLength} max={12} />
                </div>
              </Field>
            )}
          />

          <Controller
            name="goal"
            control={control}
            render={({ field, fieldState }) => (
              <Field className="gap-2">
                <FieldLabel htmlFor="profile-goal" className={LABEL_CLASS}>
                  목표 문구
                </FieldLabel>
                <Input
                  {...field}
                  id="profile-goal"
                  type="text"
                  onChange={(event) => {
                    field.onChange(event);
                    if (
                      fieldState.invalid ||
                      (normalizeGoal(event.target.value) ?? "").length > 20
                    ) {
                      void trigger("goal");
                    }
                  }}
                  aria-invalid={fieldState.invalid || undefined}
                  aria-describedby={
                    fieldState.invalid
                      ? "profile-goal-error profile-goal-count"
                      : "profile-goal-count"
                  }
                />
                <div className="flex flex-col gap-1">
                  <FieldError id="profile-goal-error" errors={[fieldState.error]} />
                  <CharCount id="profile-goal-count" length={goalLength} max={20} />
                </div>
              </Field>
            )}
          />

          <div className="flex flex-col gap-2">
            <p className={LABEL_CLASS}>목표 카테고리</p>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  aria-label="목표 카테고리"
                  // Radix single 은 선택 값을 다시 누르면 빈 문자열을 준다
                  // — 카테고리는 선택 항목이라 빈 문자열을 null 로 되돌린다.
                  value={field.value ?? ""}
                  onValueChange={(next) => field.onChange(next === "" ? null : next)}
                >
                  {CATEGORY_CHIPS.map((chip) => (
                    <ToggleGroupItem key={chip.value} value={chip.value}>
                      {chip.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </div>

          <FieldError errors={[formState.errors.root]} />
        </div>

        <div className="relative mt-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <CtaToaster />
          <Button
            type="submit"
            size="xl"
            className="w-full"
            disabled={!isDirty || nicknameOver || goalOver || saveMutation.isPending}
          >
            {saveMutation.isPending ? "저장 중..." : "저장하기"}
          </Button>
        </div>
      </form>
    </main>
  );
}
