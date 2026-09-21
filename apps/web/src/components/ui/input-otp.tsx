import { OTPInput, OTPInputContext } from "input-otp";
import { useContext } from "react";

import { cn } from "@/lib/utils";

export function InputOTP({
  className,
  containerClassName,
  // 기본값 "none" — 기본값(increase-width)의 비밀번호관리자 배지 감지가
  // document.elementFromPoint를 폴링하는데 jsdom(vitest)에 없어 테스트가
  // unhandled exception으로 죽는다. 셀이 고정 60px라 배지 폭 확장도 의미 없다.
  pushPasswordManagerStrategy = "none",
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      pushPasswordManagerStrategy={pushPasswordManagerStrategy}
      containerClassName={cn("flex items-center gap-2.5", containerClassName)}
      // 화면 밖으로 빼는 우회 대신 input-otp 기본(칸 위 투명 input)을 쓰되
      // caret은 아래 셀이 그린다. 안드로이드 웹뷰 핸들 노출은 실기기로 확인한다.
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

export function InputOTPSlot({ index, className }: { index: number; className?: string }) {
  const ctx = useContext(OTPInputContext);
  const slot = ctx.slots[index];
  return (
    <div aria-hidden="true" className={cn(className, slot.isActive && "border-2 border-primary")}>
      {slot.char}
      {slot.hasFakeCaret && (
        <div className="pointer-events-none absolute h-7 w-px animate-caret-blink bg-primary motion-reduce:animate-none" />
      )}
    </div>
  );
}
