# QLDA - Quan ly Du an Dau tu Xay dung
# Single image: Express backend (server/) + static frontend (index.html/app.js/style.css) + Autonomous Office
FROM node:22-alpine

WORKDIR /app

# Install git for autonomous office auto-commit
RUN apk add --no-cache git

# Install backend deps first for better layer caching
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Install VAN-PHONG-AI dependencies
COPY VAN-PHONG-AI/package.json VAN-PHONG-AI/package-lock.json ./VAN-PHONG-AI/
RUN cd VAN-PHONG-AI && npm ci --omit=dev || npm install --production

# Copy the rest of the app (frontend files + backend source)
COPY index.html style.css app.js legal-ui.js wiki-ui.js login.html login.js logoCTEC.png manifest.json sw.js ./
COPY assets ./assets
COPY server/*.js ./server/
COPY server/knowledge ./server/knowledge

# Copy VAN-PHONG-AI modules and HTML
COPY VAN-PHONG-AI/*.js ./VAN-PHONG-AI/
COPY VAN-PHONG-AI/*.html ./VAN-PHONG-AI/
COPY VAN-PHONG-AI/*.json ./VAN-PHONG-AI/
COPY VAN-PHONG-AI/*.sh ./VAN-PHONG-AI/
COPY VAN-PHONG-AI/*.md ./VAN-PHONG-AI/

# Runtime-only dirs (actual data lives in mounted volumes, see docker-compose.yml)
RUN mkdir -p /app/server/data /app/server/uploads \
             /app/VAN-PHONG-AI/HO-SO-AI \
             /app/VAN-PHONG-AI/HO-SO-AI/ARCHIVE \
             /app/VAN-PHONG-AI/logs \
             /app/VAN-PHONG-AI/MAU \
    && addgroup -S qlda && adduser -S qlda -G qlda \
    && chown -R qlda:qlda /app
    
# Configure git for auto-commit
RUN git config --global user.name "Autonomous Office AI" \
    && git config --global user.email "ai@autonomous-office.local" \
    && git config --global init.defaultBranch main

USER qlda

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health > /dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
