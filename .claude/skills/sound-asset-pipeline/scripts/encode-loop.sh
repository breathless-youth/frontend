#!/usr/bin/env bash
# 끊김 없는 루프 mp3 만들기.
# 입력의 [X, L+X) 구간을 본체로, [0, X) 구간을 머리로 떼어 본체 끝에 크로스페이드로 붙인다.
# 결과 길이 = L. 루프 지점(끝→시작)이 원본의 X초 지점으로 샘플 연속이 된다.
#
# 라우드노멀라이즈는 2패스로 한다. 1패스로 돌리면 loudnorm 이 동적 모드로 동작해
# 목표값을 3~4dB 빗나가고 구간마다 게인이 달라진다. 소리를 여러 개 겹쳐 듣는
# 기능에서는 그 편차가 그대로 음량 차이로 들리고, 시간에 따라 변하는 게인은
# 크로스페이드로 맞춰 둔 이음매의 연속성도 깬다. linear=true 로 정적 게인만 건다.
#
# 사용: encode-loop.sh <입력> <출력.mp3> [루프길이초=90] [크로스페이드초=3] [채널=1] [비트레이트=96k]
set -euo pipefail

in="${1:?입력 파일}"; out="${2:?출력 mp3}"
L="${3:-90}"; X="${4:-3}"; ch="${5:-1}"; br="${6:-96k}"
# -18 LUFS 는 합성 노이즈(noiseSynth.ts)를 맞춰 둔 기준과 같은 값이다. 둘이 어긋나면
# 사용자가 소리를 바꿀 때마다 음량이 튄다. 한쪽을 바꾸면 반드시 다른 쪽도 바꾼다.
TARGET_I=-18; TARGET_TP=-1.5; TARGET_LRA=11
command -v ffmpeg >/dev/null || { echo "ffmpeg 없음: brew install ffmpeg" >&2; exit 1; }

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
need=$(python3 -c "print($L + $X)")
if python3 -c "import sys; sys.exit(0 if float('$dur') >= $need else 1)"; then :; else
  echo "입력이 짧음: ${dur}s < 필요 ${need}s (루프 $L + 크로스페이드 $X)" >&2; exit 1
fi

layout=$([ "$ch" = 1 ] && echo mono || echo stereo)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
loop="$tmp/loop.wav"
end=$(python3 -c "print($L + $X)")

# 1단계 — 크로스페이드로 루프 본체를 만든다. 게인은 아직 건드리지 않는다.
ffmpeg -y -v error -i "$in" -filter_complex "
  [0:a]atrim=start=$X:end=$end,asetpts=PTS-STARTPTS[body];
  [0:a]atrim=start=0:end=$X,asetpts=PTS-STARTPTS[head];
  [body][head]acrossfade=d=$X:c1=tri:c2=tri,aformat=channel_layouts=$layout[out]
" -map "[out]" -ar 44100 -ac "$ch" -c:a pcm_s16le "$loop"

# 2단계 — 만들어진 루프를 측정한다. 측정 JSON 은 info 레벨에서만 나오므로 -v error 로 죽이면 안 된다.
measured=$(ffmpeg -v info -nostats -i "$loop" \
  -af "loudnorm=I=$TARGET_I:TP=$TARGET_TP:LRA=$TARGET_LRA:print_format=json" \
  -f null /dev/null 2>&1 | sed -n '/^{/,/^}/p')
[ -n "$measured" ] || { echo "라우드니스 측정 실패" >&2; exit 1; }
read -r m_i m_tp m_lra m_thresh offset <<EOF
$(python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
print(d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset'])
" <<<"$measured")
EOF

# 3단계 — 측정값을 넣어 정적 게인으로만 맞춘다(linear=true).
ffmpeg -y -v error -i "$loop" -af "
  loudnorm=I=$TARGET_I:TP=$TARGET_TP:LRA=$TARGET_LRA:measured_I=$m_i:measured_TP=$m_tp:measured_LRA=$m_lra:measured_thresh=$m_thresh:offset=$offset:linear=true:print_format=summary,
  aformat=channel_layouts=$layout
" -ar 44100 -ac "$ch" -c:a libmp3lame -b:a "$br" "$out"

bytes=$(stat -f %z "$out")
final=$(ffmpeg -nostats -i "$out" -af ebur128 -f null /dev/null 2>&1 \
  | awk '/Integrated loudness/{g=1} g&&/^ +I:/{print $2; exit}')
printf "%s  %.2fMB  %ss  %s LUFS\n" "$out" "$(python3 -c "print($bytes/1048576)")" \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | cut -d. -f1)" "$final"
if [ "$bytes" -gt 1258291 ]; then echo "경고: 파일당 상한 1.2MB 초과" >&2; fi
