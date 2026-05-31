#!/bin/bash
# 서버 전체 시작 스크립트 (Gemma 2 27B)
# 사용법: bash start_server.sh

echo "=== 기존 프로세스 종료 ==="
pkill -f "vllm serve" 2>/dev/null
pkill -f uvicorn 2>/dev/null
pkill -f cloudflared 2>/dev/null
sleep 2

echo "=== vLLM 시작 (Gemma 2 27B, GPU 0,1) ==="
CUDA_VISIBLE_DEVICES=0,1 nohup vllm serve /data/urp_sjl/gemma-27b \
  --tensor-parallel-size 2 \
  --port 8001 \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.85 \
  --enable-auto-tool-choice \
  --tool-call-parser functiongemma \
  >> ~/vllm.log 2>&1 &

echo "vLLM 로딩 중 (2~3분 소요)..."
for i in {1..36}; do
  sleep 5
  if curl -s http://localhost:8001/v1/models > /dev/null 2>&1; then
    echo "vLLM 준비 완료!"
    break
  fi
  echo "  대기 중... ($((i*5))초)"
done

echo "=== uvicorn 시작 ==="
cd ~/backend && source venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8000 >> ~/backend.log 2>&1 &
sleep 3
echo "uvicorn 시작됨"

echo "=== Cloudflare 터널 시작 ==="
nohup ~/cloudflared tunnel --url http://localhost:8000 > ~/cloudflared.log 2>&1 &
sleep 10
URL=$(grep "trycloudflare.com" ~/cloudflared.log | tail -1 | grep -o 'https://[^ ]*')
echo ""
echo "=============================="
echo "서버 준비 완료!"
echo "Cloudflare URL: $URL"
echo "이 URL을 frontend/src/api/client.ts에 넣으세요"
echo "=============================="
