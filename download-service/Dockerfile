FROM node:22-alpine

# yt-dlp needs a JS runtime AND the EJS challenge-solver scripts for modern
# YouTube extraction. Without yt-dlp-ejs, the n/signature challenges fail and
# YouTube answers the media request with HTTP 403 Forbidden.
RUN apk add --no-cache ffmpeg python3 py3-pip deno ca-certificates \
  && python3 -m pip install --no-cache-dir --break-system-packages -U yt-dlp yt-dlp-ejs \
  && yt-dlp --version

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src

ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "start"]
