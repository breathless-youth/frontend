/**
 * 소셜룸에서 밀려난 사유를 소셜 홈으로 전달
 *
 * 재입장 실패·유예 만료로 방을 떠날 때 사용자에게 이유를 알려야 하는데, 그 문구를 띄울 화면은 도착지인 소셜 홈이다.
 * 1회성 플래그로 넘긴다 — router state로 실으면 웹뷰가 또 리로드될 때 같은 history 항목이 복원되며 토스트가 반복된다.
 *
 * localStorage를 쓰는 이유: 앱은 탭·세션 화면이 각각 별도 웹뷰라 sessionStorage가 공유되지
 * 않는다. 세션 웹뷰가 남긴 안내를 네이티브 전환 후의 진짜 소셜 탭 웹뷰가 띄워야 하므로
 * 웹뷰 간 공유 저장소가 필요하다. 소비가 곧 삭제라 리로드 반복 방지는 그대로 성립한다.
 *
 * kind: 자리비움(grace-end)만 소셜 홈에서 Dialog로 뜨고, 입장/생성 실패(failure)는 기존
 * 대로 토스트로 남는다. 저장 형식은 문자열에서 JSON으로 바뀌었다 — 배포 전환 창에 옛
 * 버전이 남긴 평문 문자열은 JSON.parse가 실패하므로 failure로 처리한다.
 */
export type SocialRoomNoticeKind = "grace-end" | "failure";
export type SocialRoomNotice = { kind: SocialRoomNoticeKind; message: string };

const KEY = "focusmakers:social-room-notice";

export function markSocialRoomNotice(notice: SocialRoomNotice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(notice));
  } catch {
    // 스토리지 불가 환경(프라이빗 모드 등)에서는 안내만 생략된다 — 이동 자체는 된다.
  }
}

/** 문구를 읽고 지운다 — 소셜 홈 재진입·새로고침에 같은 안내가 반복되지 않게 1회성이다. */
export function consumeSocialRoomNotice(): SocialRoomNotice | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SocialRoomNotice>;
      if (
        typeof parsed?.message === "string" &&
        (parsed.kind === "grace-end" || parsed.kind === "failure")
      ) {
        return { kind: parsed.kind, message: parsed.message };
      }
    } catch {
      // 옛 버전이 남긴 평문 문자열 — 배포 전환 창에서만 나온다. 아래에서 실패 토스트로 넘긴다.
    }
    return { kind: "failure", message: raw };
  } catch {
    return null;
  }
}
