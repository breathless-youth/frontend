/**
 * Amplitude Release 생성.
 *
 * Release를 만들면 프로젝트의 모든 차트에 배포 시점이 표시되어 지표 담당이 일정을 손으로 적지 않아도 된다.
 * API에는 수정 기능이 없어서 한 번 만들면 고칠 수 없다.
 */

/** Amplitude가 받는 UTC yyyy-MM-dd HH:mm:ss 표기. */
export function formatReleaseStart(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Release 요청 본문.
 * 문서의 JSON 예시는 값을 문자열로 적지만 필드 설명과 응답은 platforms를 목록, chart_visibility를 boolean으로 둔다.
 */
export function buildReleaseBody({ version, title, description, releaseStart, platforms }) {
  const body = {
    version,
    release_start: formatReleaseStart(releaseStart),
    title,
    description,
    chart_visibility: true,
    created_by: "GitHub Actions",
  };
  if (platforms) body.platforms = platforms;
  return body;
}

/** Amplitude Release 한 건 생성. */
export async function createRelease({ apiKey, secretKey, dryRun, fetchImpl = fetch, ...release }) {
  // 공식 문서는 JSON 본문과 쿼리 문자열만 안내한다.
  // 설명에 릴리즈 노트 전문이 들어가 URL 길이 제한을 피하려고 JSON 본문으로 보낸다.
  const body = buildReleaseBody(release);
  if (dryRun) {
    console.log(JSON.stringify({ amplitudeRelease: body }, null, 2));
    return;
  }
  const res = await fetchImpl("https://amplitude.com/api/2/release", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amplitude release ${res.status}: ${text.slice(0, 200)}`);
  }
}
