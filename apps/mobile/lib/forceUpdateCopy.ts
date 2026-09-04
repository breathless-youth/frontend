import { getRemoteConfigString } from "./remoteConfig";

/**
 * 강제 업데이트 알림창 문구 (BY-586).
 *
 * 콘솔에서 바꿀 수 있게 Remote Config 키 세 개로 뺐다(2026-09-04 사용자 결정 — 09-03의 "문구는 빼지
 * 않는다"를 뒤집음). 키가 없거나 값이 비어 있거나 읽기에 실패하면 아래 앱 기본 문구를 쓴다. 기본 문구는
 * BY-533 확정 카피로 웹 `features/force-update/copy.ts`와 같다(의역·줄임·문장부호 변경 금지).
 *
 * 기본값은 `lib/forceUpdate.ts`가 `min_supported_version`과 **한 번의 `setDefaults`로 함께** 등록한다 —
 * RNFB는 기본값 맵을 통째로 바꾸므로 따로 등록하면 서로 지운다.
 */
export const FORCE_UPDATE_TITLE_KEY = "force_update_title";
export const FORCE_UPDATE_MESSAGE_KEY = "force_update_message";
export const FORCE_UPDATE_BUTTON_KEY = "force_update_button";

export const FORCE_UPDATE_TITLE = "업데이트가 필요해요";
export const FORCE_UPDATE_DESCRIPTION = "원활한 이용을 위해 최신 버전으로 업데이트해 주세요.";
export const FORCE_UPDATE_CONFIRM_LABEL = "지금 업데이트";

export const FORCE_UPDATE_COPY_DEFAULTS = {
  [FORCE_UPDATE_TITLE_KEY]: FORCE_UPDATE_TITLE,
  [FORCE_UPDATE_MESSAGE_KEY]: FORCE_UPDATE_DESCRIPTION,
  [FORCE_UPDATE_BUTTON_KEY]: FORCE_UPDATE_CONFIRM_LABEL,
};

export type ForceUpdateCopy = {
  title: string;
  message: string;
  confirmLabel: string;
};

/**
 * activate가 끝난 뒤에 부른다(`resolveForceUpdate` 이후). 값을 읽어 다듬은 결과가 비어 있으면 기본 문구다 —
 * 콘솔에서 실수로 빈 값을 게시해도 빈 알림창이 뜨지 않는다.
 */
export function readForceUpdateCopy(): ForceUpdateCopy {
  return {
    title: readOr(FORCE_UPDATE_TITLE_KEY, FORCE_UPDATE_TITLE),
    message: readOr(FORCE_UPDATE_MESSAGE_KEY, FORCE_UPDATE_DESCRIPTION),
    confirmLabel: readOr(FORCE_UPDATE_BUTTON_KEY, FORCE_UPDATE_CONFIRM_LABEL),
  };
}

function readOr(key: string, fallback: string): string {
  try {
    const value = getRemoteConfigString(key).trim();
    return value === "" ? fallback : value;
  } catch {
    return fallback;
  }
}
