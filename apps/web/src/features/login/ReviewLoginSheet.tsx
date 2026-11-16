import {
  REVIEW_LOGIN_ID_MAX_LENGTH,
  REVIEW_LOGIN_PASSWORD_MAX_LENGTH,
  type ReviewLoginFailureCode,
} from "@focusmakers/types";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { requestNativeReviewLogin } from "@/lib/nativeReviewLogin";

/** 자동 완성과 자동 대문자가 아이디·비밀번호를 바꾸거나 기기에 남기지 않게 끈다. */
const PLAIN_INPUT = {
  autoComplete: "off",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;

/**
 * 심사용 로그인 창
 *
 * 앱 심사자가 소셜 계정 없이 심사 계정으로 들어오는 길이다.
 * 로그인은 앱에 맡기고, 실패하면 까닭을 비밀번호 칸 아래에 한 문장으로 보인다.
 * 비밀번호는 이 창의 상태와 앱으로 가는 메시지에만 두고 로그나 분석 이벤트에 넘기지 않는다.
 * 요청이 도는 동안에는 창을 닫지 않는다.
 */
export function ReviewLoginSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}) {
  const { t } = useTranslation("login");
  const loginIdField = useId();
  const passwordField = useId();
  const errorField = useId();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReviewLoginFailureCode | null>(null);
  const ready = loginId.trim() !== "" && password !== "" && !pending;

  async function submit() {
    if (!ready) return;
    setPending(true);
    setError(null);
    const result = await requestNativeReviewLogin(loginId.trim(), password);
    if (result.status === "success") {
      await onSuccess();
      setPassword("");
      setPending(false);
      onOpenChange(false);
      return;
    }
    setPending(false);
    setError(result.code);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (pending) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="theme-soft-blue" initialFocus={false} finalFocus={false}>
        <form
          className="flex flex-col gap-3.5 pt-5.5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DrawerTitle className="text-lg font-extrabold">{t("reviewLogin.title")}</DrawerTitle>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={loginIdField}
              className="text-[13px] font-semibold text-muted-foreground"
            >
              {t("reviewLogin.loginId")}
            </label>
            <Input
              id={loginIdField}
              data-base-ui-swipe-ignore=""
              value={loginId}
              disabled={pending}
              maxLength={REVIEW_LOGIN_ID_MAX_LENGTH}
              onChange={(event) => {
                setLoginId(event.target.value);
                setError(null);
              }}
              {...PLAIN_INPUT}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={passwordField}
              className="text-[13px] font-semibold text-muted-foreground"
            >
              {t("reviewLogin.password")}
            </label>
            <Input
              id={passwordField}
              type="password"
              data-base-ui-swipe-ignore=""
              value={password}
              disabled={pending}
              maxLength={REVIEW_LOGIN_PASSWORD_MAX_LENGTH}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              aria-invalid={error !== null || undefined}
              aria-describedby={error === null ? undefined : errorField}
              {...PLAIN_INPUT}
            />
            {error !== null && (
              <p id={errorField} role="alert" className="text-sm text-state-distract-text">
                {t(`reviewLogin.errors.${error}`)}
              </p>
            )}
          </div>
          <Button
            type="submit"
            size="xl"
            data-base-ui-swipe-ignore=""
            disabled={!ready}
            aria-busy={pending}
            className="w-full"
          >
            {t("reviewLogin.submit")}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
