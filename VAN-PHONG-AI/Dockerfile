# VAN-PHONG-AI — văn phòng AI agent (local, chạy trong Docker)
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Source: server + frontend (HTML) + forms + runtime modules + seed legal docs
COPY van-phong-ai-local-server.js ai-agent-skills.js ai-agent-skills.json openwork-capabilities.js ./
COPY office-narrative-catalog.js office-life-simulator.js pixel-world-engine.js pixel-office-engine.js reminder-core.js ./
COPY quy-trinh-thanh-toan.html ./
COPY MAU ./MAU
COPY seed-legal ./seed-legal
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Dữ liệu runtime (volume): HO-SO-AI, KHO-TRI-THUC, ai-config.local.json
RUN mkdir -p /app/HO-SO-AI /app/KHO-TRI-THUC/TAI-LIEU-GOC

ENV NODE_ENV=production
ENV AI_OFFICE_PORT=8765
ENV AI_OFFICE_HOST=0.0.0.0
ENV AI_OFFICE_NO_OPEN=1
EXPOSE 8765

ENTRYPOINT ["./entrypoint.sh"]
