FROM node:18-slim

# Define variável de ambiente para o Render
ENV RENDER=true
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Instala Chromium, FFmpeg e dependências necessárias
COPY install_chromium.sh /usr/local/bin/install_chromium.sh
RUN chmod +x /usr/local/bin/install_chromium.sh && /usr/local/bin/install_chromium.sh && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Cria usuário não-root para segurança
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências do npm
RUN npm ci --production --omit=dev

# Copia o código da aplicação
COPY . .

# Cria diretório para sessão do WhatsApp com permissões corretas
RUN mkdir -p .wwebjs_auth && chown -R pptruser:pptruser /app

# Muda para usuário não-root
USER pptruser

# Expõe a porta (Render define dinamicamente via PORT)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Comando de inicialização
COPY check_chromium_path.sh /usr/local/bin/check_chromium_path.sh
RUN chmod +x /usr/local/bin/check_chromium_path.sh
RUN /usr/local/bin/check_chromium_path.sh

CMD ["npm", "start"]
