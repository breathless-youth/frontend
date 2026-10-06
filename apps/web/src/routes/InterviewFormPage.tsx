import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { fillNickname, isGoogleFormUrl, readFormParam } from "@/features/interview/interviewForm";
import { profileQuery } from "@/lib/profileQueries";
import { useIdentityPending, useUserId } from "@/lib/userId";

import { GoogleFormPage } from "./GoogleFormPage";

/**
 * 인터뷰 신청 폼
 *
 * 폼 주소는 쿼리로 받고, 닉네임은 이 문서에서 프로필을 조회해 채운다.
 * 신원과 프로필을 기다리는 동안은 iframe을 띄우지 않아 빈 닉네임으로 먼저 열리지 않게 한다.
 */
export function InterviewFormPage() {
  const location = useLocation();
  const userId = useUserId();
  // 앱 셸은 신원을 브리지로 늦게 준다. 그 전의 null을 신원 없음으로 보면 빈 닉네임 폼이 먼저 뜬다.
  const identityPending = useIdentityPending();
  const raw = readFormParam(location.search);
  // 쿼리는 누구나 바꿀 수 있어 구글폼이 아닌 주소를 앱 안 iframe에 띄우지 않는다.
  const formUrl = raw !== null && isGoogleFormUrl(raw) ? raw : null;
  const canFetchProfile = userId !== null && formUrl !== null;
  const profile = useQuery({ ...profileQuery(userId ?? 0), enabled: canFetchProfile });
  const nicknameSettled = !identityPending && (!canFetchProfile || profile.status !== "pending");
  const nickname = profile.data?.nickname ?? null;

  return (
    <GoogleFormPage
      title="인터뷰 신청하기"
      formUrl={formUrl === null ? null : nicknameSettled ? fillNickname(formUrl, nickname) : ""}
      loadingText="신청 폼을 불러오는 중"
      failureTitle="신청 폼을 불러오지 못했어요"
      fallbackPath="/home"
      retryScreen="interview_form"
    />
  );
}
