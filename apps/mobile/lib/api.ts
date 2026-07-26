/**
 * 실패 응답(`!res.ok`)에서 서버 에러 계약 `{ message }`를 읽어 Error를 만든다.
 * 본문이 없거나 JSON이 아니면 `` `${fallback} (HTTP ${status})` ``로 대체한다.
 */
export async function parseErrorMessage(
  res: Pick<Response, "status" | "json">,
  fallback: string,
): Promise<Error> {
  const message = await res
    .json()
    .then((body: { message?: string }) => body.message)
    .catch(() => undefined);
  return new Error(message ?? `${fallback} (HTTP ${res.status})`);
}
