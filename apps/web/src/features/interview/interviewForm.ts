import { hardNavigate } from "@/lib/hardNavigation";

/**
 * 인터뷰 신청 구글폼 링크
 *
 * 서버가 내려준 미리 채움 링크의 NICKNAME 자리에 닉네임을 넣는다.
 */

const NICKNAME_TOKEN = "NICKNAME";
const FORM_PARAM = "form";

export function fillNickname(formUrl: string, nickname: string | null): string {
  return formUrl.replace(NICKNAME_TOKEN, encodeURIComponent(nickname ?? ""));
}

/** 쿼리로 받은 주소를 iframe에 넣기 전에 구글폼인지 확인한다. */
export function isGoogleFormUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "docs.google.com" &&
      parsed.pathname.startsWith("/forms/")
    );
  } catch {
    return false;
  }
}

/** 구 앱 신원(userId)과 appVersion 쿼리를 잃지 않도록 현재 쿼리에 form만 더한다. */
export function interviewFormPath(formUrl: string, search: string): string {
  const params = new URLSearchParams(search);
  params.set(FORM_PARAM, formUrl);
  return `/interview?${params.toString()}`;
}

export function readFormParam(search: string): string | null {
  return new URLSearchParams(search).get(FORM_PARAM);
}

/** 구글폼 iframe은 COEP 예외 문서에서만 뜨므로 문서 단위로 이동한다. */
export function openInterviewForm(formUrl: string, search: string): void {
  hardNavigate(interviewFormPath(formUrl, search));
}
