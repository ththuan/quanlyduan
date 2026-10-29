# QLDA - Quan ly Du an Dau tu Xay dung
# Single image: Express backend (server/) + static frontend (index.html/app.js/style.css)
FROM node:22-alpine

WORKDIR /app

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# Install backend deps first for better layer caching
COPY server/package.json server/package-lock.json ./server/
COPY server/vendor ./server/vendor
RUN cd server && npm install --omit=dev --no-audit --no-fund

# Copy the rest of the app (frontend files + backend source)
COPY index.html style.css app.js motion.js motion-ui.js legal-ui.js wiki-ui.js workflow-catalog.js workflow-ui.js login.html login.js logoCTEC.png manifest.json sw.js ./
COPY assets ./assets
COPY templates ./templates
COPY server/*.js ./server/
COPY server/knowledge ./server/knowledge

# Runtime-only dirs (actual data lives in mounted volumes, see docker-compose.yml)
RUN mkdir -p /app/server/data /app/server/uploads \
    && addgroup -S qlda && adduser -S qlda -G qlda \
    && chown -R qlda:qlda /app

USER qlda

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health > /dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
