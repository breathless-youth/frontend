/**
 * GitHub REST API 읽기 도우미.
 *
 * 알림 스크립트는 조회만 하므로 GET과 페이지 모으기만 둔다.
 */

/** GitHub REST API GET 한 번. */
export async function githubGet(path, { token, fetchImpl = fetch }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${path} ${res.status}`);
  return res.json();
}

/** 여러 페이지에 걸친 목록을 max개까지 모은 배열. */
export async function githubGetAll(path, key, { token, fetchImpl, max = 1000 }) {
  const sep = path.includes("?") ? "&" : "?";
  const all = [];
  for (let page = 1; all.length < max; page++) {
    const res = await githubGet(`${path}${sep}per_page=100&page=${page}`, { token, fetchImpl });
    const items = key ? res[key] : res;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all.slice(0, max);
}

/**
 * GitHub 토큰.
 * Actions는 GITHUB_TOKEN, 로컬 gh는 GH_TOKEN을 쓴다.
 */
export function githubToken(env = process.env) {
  return env.GITHUB_TOKEN ?? env.GH_TOKEN;
}

/** owner/name 형식 저장소 이름. */
export function repo(env = process.env) {
  return env.GITHUB_REPOSITORY ?? "breathless-youth/frontend";
}
