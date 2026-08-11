# Deploy en Render con Docker: instala Chromium y sus dependencias del sistema.
# Necesario porque Render no permite "su root" (el --with-deps de Playwright falla).
FROM node:20-slim

WORKDIR /opt/render/project/src

# Dependencias del sistema requeridas por Chromium headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install

# Descarga el Chromium que corresponde a la versión de Playwright del lockfile
RUN npx playwright install chromium

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
