import { readCopyOr } from "./remoteConfigCopy";

/**
 * 권장 업데이트 알림창 문구 (BY-608).
 *
 * 강제 업데이트(`lib/forceUpdateCopy.ts`)와 같은 방식으로 Remote Config 키 네 개에서 읽고, 키가 없거나 비어
 * 있거나 읽기에 실패하면 아래 앱 기본 문구를 쓴다. 기본 문구는 확정 카피가 없어 초안이다.
 * 기본값은 `lib/forceUpdate.ts`의 `UPDATE_CONFIG_DEFAULTS`에 함께 등록한다.
 */
export const RECOMMENDED_UPDATE_TITLE_KEY = "recommended_update_title";
export const RECOMMENDED_UPDATE_MESSAGE_KEY = "recommended_update_message";
export const RECOMMENDED_UPDATE_LATER_BUTTON_KEY = "recommended_update_later_button";
export const RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY = "recommended_update_confirm_button";

export const RECOMMENDED_UPDATE_TITLE = "새 버전이 나왔어요";
export const RECOMMENDED_UPDATE_DESCRIPTION =
  "최신 버전으로 업데이트하면 더 나아진 포메를 쓸 수 있어요.";
export const RECOMMENDED_UPDATE_LATER_LABEL = "나중에";
export const RECOMMENDED_UPDATE_CONFIRM_LABEL = "지금 업데이트";

export const RECOMMENDED_UPDATE_COPY_DEFAULTS = {
  [RECOMMENDED_UPDATE_TITLE_KEY]: RECOMMENDED_UPDATE_TITLE,
  [RECOMMENDED_UPDATE_MESSAGE_KEY]: RECOMMENDED_UPDATE_DESCRIPTION,
  [RECOMMENDED_UPDATE_LATER_BUTTON_KEY]: RECOMMENDED_UPDATE_LATER_LABEL,
  [RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY]: RECOMMENDED_UPDATE_CONFIRM_LABEL,
};

export type RecommendedUpdateCopy = {
  title: string;
  message: string;
  laterLabel: string;
  confirmLabel: string;
};

/** activate가 끝난 뒤에 부른다. 항목별로 비어 있으면 기본 문구. */
export function readRecommendedUpdateCopy(): RecommendedUpdateCopy {
  return {
    title: readCopyOr(RECOMMENDED_UPDATE_TITLE_KEY, RECOMMENDED_UPDATE_TITLE),
    message: readCopyOr(RECOMMENDED_UPDATE_MESSAGE_KEY, RECOMMENDED_UPDATE_DESCRIPTION),
    laterLabel: readCopyOr(RECOMMENDED_UPDATE_LATER_BUTTON_KEY, RECOMMENDED_UPDATE_LATER_LABEL),
    confirmLabel: readCopyOr(
      RECOMMENDED_UPDATE_CONFIRM_BUTTON_KEY,
      RECOMMENDED_UPDATE_CONFIRM_LABEL,
    ),
  };
}
