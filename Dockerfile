FROM node:18-slim

# Variáveis de ambiente
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    render=true

WORKDIR /app

# Instalação de dependências do sistema (Chrome e FFmpeg)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ffmpeg \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copia arquivos de configuração primeiro
COPY package*.json ./

# Instala dependências do Node
RUN npm install --omit=dev

# Copia o restante dos arquivos (incluindo index.js e scripts)
COPY . .

# Garanta permissão de execução nos scripts
RUN chmod +x *.sh || true

# Expõe a porta
EXPOSE 3000

# Comando de início
CMD ["node", "src/index.js"]
