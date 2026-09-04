# QLDA - Quan ly Du an Dau tu Xay dung
# Single image: Express backend (server/) + static frontend (index.html/app.js/style.css)
FROM node:22-alpine

WORKDIR /app

# Install backend deps first for better layer caching
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy the rest of the app (frontend files + backend source)
COPY index.html style.css app.js login.html login.js logoCTEC.png manifest.json sw.js ./
COPY assets ./assets
COPY server/*.js ./server/

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
