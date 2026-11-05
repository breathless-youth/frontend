#!/usr/bin/env bash
# 끊김 없는 루프 mp3 만들기.
# 입력의 [X, L+X) 구간을 본체로, [0, X) 구간을 머리로 떼어 본체 끝에 크로스페이드로 붙인다.
# 결과 길이 = L. 루프 지점(끝→시작)이 원본의 X초 지점으로 샘플 연속이 된다.
#
# 음량은 리미터로 순간 최대치를 누른 뒤 고정 게인 하나로만 -18 LUFS 에 맞춘다.
# loudnorm 의 linear 모드는 "원본 최대치 + 키울 양"이 목표 최대치를 넘으면 알리지 않고 dynamic 모드로 넘어간다.
# dynamic 모드는 시간에 따라 게인을 바꿔 소리마다 음량이 어긋나고 크로스페이드로 맞춘 이음매도 깬다.
# 리미터는 루프의 끝과 처음을 앞뒤에 덧댄 고리 상태로 걸어, 이음매 양쪽에서 누르는 양이 같게 한다.
# 고리 루프는 어디서 시작해도 같은 소리라, 가장 조용한 10ms 를 파일 시작점으로 돌려 mp3 디코더 첫 프레임 오차를 줄인다.
#
# 사용: encode-loop.sh <입력> <출력.mp3> [루프길이초=90] [크로스페이드초=3] [채널=1] [비트레이트=96k] [리미터 추가 입력 dB]
# 입력은 쓸 구간만 미리 잘라 넣는다(ffmpeg -ss 시작 -t 길이). 길이는 루프길이 + 크로스페이드 이상이어야 한다.
# 마지막 인자를 비우면 -18 LUFS 에 닿을 때까지 리미터 입력을 0.5dB씩 올린다(최대 12dB).
# 장작 튀는 소리처럼 누를수록 전체 음량도 내려가는 소리는 그 값을 직접 정해 들어 보고 고른다.
set -euo pipefail

in="${1:?입력 파일}"; out="${2:?출력 mp3}"
L="${3:-90}"; X="${4:-3}"; ch="${5:-1}"; br="${6:-96k}"; fixed="${7:-}"
# -18 LUFS 는 합성 노이즈(noiseSynth.ts)를 맞춰 둔 기준과 같은 값이다. 둘이 어긋나면
# 사용자가 소리를 바꿀 때마다 음량이 튄다. 한쪽을 바꾸면 반드시 다른 쪽도 바꾼다.
TARGET_I=-18; TARGET_TP=-1.6; SR=44100; PAD=1
command -v ffmpeg >/dev/null || { echo "ffmpeg 없음: brew install ffmpeg" >&2; exit 1; }

# 고리를 만들 때 루프 끝 PAD초를 떼어 쓰므로 루프가 그보다 짧으면 잘라 낼 구간이 없다.
python3 - "$L" "$X" "$ch" "${fixed:-0}" "$PAD" <<'PY' || exit 1
import sys
def num(name, v):
    try: return float(v)
    except ValueError: sys.exit(f"{name} 값은 숫자여야 함: {v}")
L, X, fixed, pad = num("루프길이", sys.argv[1]), num("크로스페이드", sys.argv[2]), num("리미터 추가 입력", sys.argv[4]), float(sys.argv[5])
if L < pad: sys.exit(f"루프길이는 {pad}초 이상이어야 함: {L}")
if not 0 < X <= L: sys.exit(f"크로스페이드는 0보다 크고 루프길이 이하여야 함: {X}")
if sys.argv[3] not in ("1", "2"): sys.exit(f"채널은 1 또는 2: {sys.argv[3]}")
PY

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
end=$(python3 -c "print($L + $X)")
# 구간을 샘플 단위로 자르면 길이가 1ms 안쪽으로 모자랄 수 있어 그만큼은 봐준다.
if python3 -c "import sys; sys.exit(0 if float('$dur') + 0.001 >= $end else 1)"; then :; else
  echo "입력이 짧음: ${dur}s < 필요 ${end}s (루프 $L + 크로스페이드 $X)" >&2; exit 1
fi

layout=$([ "$ch" = 1 ] && echo mono || echo stereo)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

measure() { # 통합 라우드니스와 true peak
  ffmpeg -nostats -i "$1" -af ebur128=peak=true -f null /dev/null 2>&1 \
    | awk '/Summary/{s=1} s&&/ I:/{i=$2} s&&/Peak:/{p=$2} END{print i, p}'
}

# 1단계: 크로스페이드로 루프 본체를 만든다.
ffmpeg -y -v error -i "$in" -filter_complex "
  [0:a]atrim=start=${X}:end=${end},asetpts=PTS-STARTPTS[body];
  [0:a]atrim=start=0:end=${X},asetpts=PTS-STARTPTS[head];
  [body][head]acrossfade=d=${X}:c1=tri:c2=tri,aformat=channel_layouts=${layout}
" -ar $SR -ac "$ch" -c:a pcm_f32le "$tmp/loop.wav"
N=$(ffprobe -v error -show_entries stream=duration_ts -of csv=p=0 "$tmp/loop.wav")

# 2단계: 끝 PAD초 + 루프 + 처음 PAD초로 고리를 만든다.
ffmpeg -y -v error -i "$tmp/loop.wav" -filter_complex "
  [0:a]asplit=3[a][b][c];
  [a]atrim=start_sample=$((N - PAD * SR)),asetpts=PTS-STARTPTS[tail];
  [c]atrim=end_sample=$((PAD * SR)),asetpts=PTS-STARTPTS[lead];
  [tail][b][lead]concat=n=3:v=0:a=1
" -c:a pcm_f32le "$tmp/ring.wav"

read -r I0 _ <<<"$(measure "$tmp/loop.wav")"

# 3단계: 4배 오버샘플링한 리미터로 샘플 사이 최대치까지 누르고 가운데 루프만 잘라 낸다.
# latency=true 가 없으면 리미터의 미리 보기만큼 소리가 밀려 루프 시작에 무음이 생긴다.
limit() {
  local g; g=$(python3 -c "print($TARGET_I - ($I0) + $1)")
  ffmpeg -y -v error -i "$tmp/ring.wav" -af "
    aresample=$((SR * 4)),volume=${g}dB,
    alimiter=limit=0.75:attack=5:release=100:level=false:latency=true,
    aresample=$SR,atrim=start_sample=$((PAD * SR)):end_sample=$((PAD * SR + N)),asetpts=PTS-STARTPTS
  " -c:a pcm_f32le "$tmp/lim.wav"
  read -r I TP <<<"$(measure "$tmp/lim.wav")"
}
if [ -n "$fixed" ]; then
  pre=$fixed; limit "$pre"
else
  pre=0
  while :; do
    limit "$pre"
    python3 -c "import sys; sys.exit(0 if $I >= $TARGET_I - 0.3 or $pre >= 12 else 1)" && break
    pre=$(python3 -c "print($pre + 0.5)")
  done
fi

# 4단계: 가장 조용한 10ms 를 파일 시작점으로 돌린다.
k=$(ffmpeg -v error -i "$tmp/lim.wav" -ac 1 -f s16le - | python3 -c "
import sys, array
a = array.array('h'); a.frombytes(sys.stdin.buffer.read()); w = 441
print(min(range(0, min(len(a) - w, $SR * 20), 44), key=lambda k: sum(x * x for x in a[k:k + w])))")
ffmpeg -y -v error -i "$tmp/lim.wav" -filter_complex "
  [0:a]asplit=2[x][y];
  [x]atrim=start_sample=$k,asetpts=PTS-STARTPTS[p];
  [y]atrim=end_sample=$k,asetpts=PTS-STARTPTS[q];
  [p][q]concat=n=2:v=0:a=1
" -c:a pcm_f32le "$tmp/rot.wav"

# 5단계: 고정 게인 하나로 -18 LUFS 에 맞추되 최대치가 목표를 넘지 않게 한다.
gain=$(python3 -c "print(round(min($TARGET_I - $I, $TARGET_TP - $TP), 2))")
ffmpeg -y -v error -i "$tmp/rot.wav" -af "volume=${gain}dB" -ac "$ch" -c:a libmp3lame -b:a "$br" "$out"

bytes=$(stat -f %z "$out")
read -r FI FTP <<<"$(measure "$out")"
printf "%s  %.2fMB  %.2fs  %s LUFS  %s dBTP  리미터 입력 +%sdB\n" "$out" "$(python3 -c "print($bytes/1048576)")" \
  "$(python3 -c "print($N/$SR)")" "$FI" "$FTP" "$pre"
if [ "$bytes" -gt 1258291 ]; then echo "경고: 파일당 상한 1.2MB 초과" >&2; fi
if python3 -c "import sys; sys.exit(0 if abs($FI - ($TARGET_I)) > 0.5 else 1)"; then
  echo "경고: 목표 ${TARGET_I} LUFS 에서 0.5 넘게 벗어남. 리미터로 깨끗하게 맞출 수 없는 소리다. 들어 보고 정한다" >&2
fi
