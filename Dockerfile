FROM node:18-slim

# Instala dependências do sistema
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ffmpeg \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copia package.json
COPY package.json ./

# ATENÇÃO: Mudamos de 'npm ci' para 'npm install' porque você editou pelo site
# e o package-lock.json está desatualizado.
RUN npm install --omit=dev

# Copia scripts
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh

# Copia código fonte
COPY src/ ./src

# Expor porta
EXPOSE 3000

# Iniciar
CMD ["node", "src/index.js"]
