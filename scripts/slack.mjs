/**
 * Slack Web API 호출과 알림 문구에 쓰는 시간 표기.
 *
 * Slack은 실패해도 HTTP 200에 ok: false로 답하므로 본문을 보고 실패를 가른다.
 * DRY_RUN에서는 보낼 내용을 출력만 해서 로컬에서 실제 기록으로 문구를 확인할 수 있게 한다.
 */

/** DRY_RUN 여부. */
export function isDryRun(env = process.env) {
  return env.DRY_RUN === "1";
}

/** 걸린 시간의 사람용 표기. */
export function formatDuration(sec) {
  const s = Math.round(sec);
  if (s >= 3600) return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  if (s >= 60) return `${Math.floor(s / 60)}분 ${s % 60}초`;
  return `${s}초`;
}

// 러너 시간대가 UTC라도 팀이 읽는 시각은 한국 시간이어야 한다.
const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kstParts(date) {
  return Object.fromEntries(KST.formatToParts(date).map((p) => [p.type, p.value]));
}

/** KST 월/일 시:분 표기. */
export function formatKst(date) {
  const p = kstParts(date);
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** KST 월/일 표기. */
export function formatKstDate(date) {
  const p = kstParts(date);
  return `${p.month}/${p.day}`;
}

/** Slack Web API 한 번 호출. */
export async function slackCall(method, body, { token, dryRun, fetchImpl = fetch }) {
  if (dryRun) {
    console.log(JSON.stringify({ method, body }, null, 2));
    return { ok: true, ts: "dry-run" };
  }
  const res = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} 실패: ${json.error}`);
  return json;
}

/** 채널이나 스레드에 메시지를 올리고 ts를 돌려준다. */
export async function postMessage({ token, channel, text, threadTs, dryRun, fetchImpl }) {
  // 링크 미리보기가 붙으면 알림 하나가 화면을 다 차지한다.
  const body = { channel, text, unfurl_links: false, unfurl_media: false };
  if (threadTs) body.thread_ts = threadTs;
  const res = await slackCall("chat.postMessage", body, { token, dryRun, fetchImpl });
  return res.ts;
}

/** 이미 올린 메시지의 본문 교체. */
export async function updateMessage({ token, channel, ts, text, dryRun, fetchImpl }) {
  await slackCall("chat.update", { channel, ts, text }, { token, dryRun, fetchImpl });
}
