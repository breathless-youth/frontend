import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ProfileResponse } from "@focusmakers/types";

import {
  trackProfileImageRemoved,
  trackProfileImageUploaded,
  trackProfileImageUploadFailed,
  type ProfileImageUploadFailure,
} from "@/lib/amplitude";
import {
  deleteProfileImage,
  registerProfileImage,
  requestUploadUrl,
  uploadPhoto,
} from "@/lib/profileApi";
import { profileKeys } from "@/lib/profileQueries";
import { showCtaToast } from "@/lib/toast";

import { prepareProfilePhoto, UnusablePhotoError } from "./prepareProfilePhoto";

async function uploadProfilePhoto(file: File): Promise<ProfileResponse> {
  const blob = await prepareProfilePhoto(file);
  // 서명에 Content-Length가 들어가므로 실제로 올릴 크기를 그대로 보낸다.
  const { uploadUrl, key } = await requestUploadUrl(blob.size);
  await uploadPhoto(uploadUrl, blob);
  return await registerProfileImage(key);
}

/** fetch는 응답을 받지 못했을 때만 TypeError로 거절하고, 받은 응답의 실패는 ApiError로 온다. */
function failureOf(error: unknown): ProfileImageUploadFailure {
  if (error instanceof UnusablePhotoError) {
    return "unusable";
  }
  return error instanceof TypeError ? "network" : "server";
}

/**
 * 프로필 사진 올리기·삭제
 *
 * 성공하면 프로필 캐시의 사진 주소만 바꾼다.
 * 응답 전체로 덮지 않아 입력 중인 폼과 그 비교 기준이 그대로 남는다.
 * 결과는 하단 저장하기 버튼 위 토스트로 알린다.
 */
export function useProfilePhotoMutations(userId: number) {
  const queryClient = useQueryClient();

  const setPhoto = (profileImageUrl: string | null | undefined) => {
    queryClient.setQueryData<ProfileResponse>(profileKeys.detail(userId), (prev) =>
      prev === undefined ? prev : { ...prev, profileImageUrl },
    );
  };

  const uploadMutation = useMutation({
    // react-query가 두 번째 인자로 컨텍스트를 넘기므로 함수를 그대로 물리지 않는다.
    mutationFn: (file: File) => uploadProfilePhoto(file),
    onSuccess: (data) => {
      setPhoto(data.profileImageUrl);
      trackProfileImageUploaded();
    },
    onError: (error) => {
      trackProfileImageUploadFailed(failureOf(error));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => deleteProfileImage(),
    onSuccess: (data) => {
      setPhoto(data.profileImageUrl);
      trackProfileImageRemoved();
    },
  });

  // 화면을 떠난 뒤 끝난 결과의 토스트는 다음에 뜨는 토스트 영역(세션 화면 등)에서 뒤늦게 보인다.
  // 그래서 토스트만 호출별 콜백에 둔다. react-query는 이 콜백을 화면이 남아 있을 때만 부른다.
  return {
    upload: (file: File) =>
      uploadMutation.mutate(file, {
        onSuccess: () => {
          showCtaToast("프로필 사진을 바꿨어요");
        },
        onError: (error) => {
          showCtaToast(
            failureOf(error) === "unusable"
              ? "이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요"
              : "사진을 올리지 못했어요. 다시 시도해 주세요",
          );
        },
      }),
    remove: () =>
      removeMutation.mutate(undefined, {
        onSuccess: () => {
          showCtaToast("프로필 사진을 삭제했어요");
        },
        onError: () => {
          showCtaToast("잠시 후 다시 시도해 주세요");
        },
      }),
    // 올리기와 삭제가 겹치면 응답 순서에 따라 남는 사진이 달라져 하나가 도는 동안은 둘 다 막는다.
    busy: uploadMutation.isPending || removeMutation.isPending,
  };
}
