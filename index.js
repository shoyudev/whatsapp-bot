'use strict';
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── Pacotes Express e qrcode (para web QR) ─────────────────
const express = require('express');
const QRCode = require('qrcode');
const app = express();

let latestQR = null; // Armazena último QR recebido

// Rota para exibir QR code (HTML com auto-refresh)
app.get('/qr', async (req, res) => {
  if (!latestQR) {
    return res.send(`
      <html>
        <head>
          <title>QR Code - WhatsApp Bot</title>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="text-align: center; padding: 50px;">
          <h1>Aguardando QR Code...</h1>
          <p>Esta página atualiza automaticamente a cada 5 segundos</p>
        </body>
      </html>
    `);
  }
  
  try {
    const qrImage = await QRCode.toDataURL(latestQR);
    res.send(`
      <html>
        <head>
          <title>QR Code - WhatsApp Bot</title>
          <meta http-equiv="refresh" content="30">
        </head>
        <body style="text-align: center; padding: 50px;">
          <h1>Escaneie o QR Code</h1>
          <img src="${qrImage}" style="border: 2px solid #333;">
          <p>Página atualiza a cada 30 segundos</p>
        </body>
      </html>
    `);
  } catch (e) {
    res.status(500).send('Erro ao gerar QR.');
  }
});

// Health check endpoint (importante para o Render)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    ready: isReady,
    timestamp: new Date().toISOString()
  });
});

// Home simples
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>WhatsApp Bot</title></head>
      <body style="padding: 50px;">
        <h1>WhatsApp Sticker Bot 🤖</h1>
        <p>Status: ${isReady ? '✅ Online' : '⏳ Iniciando...'}</p>
        <ul>
          <li><a href="/qr">Ver QR Code</a></li>
          <li><a href="/health">Health Check</a></li>
        </ul>
      </body>
    </html>
  `);
});

// Porta dinâmica para Render
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ─── Puppeteer opções otimizadas para Render ────────────────
const puppeteerOptions = {
  headless: 'new', // Use o novo headless mode
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // Importante para containers
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
    // Reduz uso de memória
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--max-old-space-size=512' // Limita memória do V8
  ],
  // Aumenta timeout para ambientes lentos
  timeout: 60000
};

// Se estiver no Render, use o Chromium do sistema
if (process.env.RENDER) {
  puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
}

// ─── Flags de estado e fila de envios ───────────────────────
let isReady = false;
const pendingSends = [];
let keepAliveInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ─── Inicialização do client WhatsApp ───────────────────────
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.SESSION_PATH || './.wwebjs_auth',
    clientId: 'bot-session'
  }),
  puppeteer: puppeteerOptions,
  // Configurações adicionais para estabilidade
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  }
});

// Safe send respeitando isReady e enfileirando se necessário
async function safeSend(to, content, opts = {}) {
  if (!isReady) {
    console.warn('Client não está pronto, enfileirando mensagem');
    pendingSends.push({ to, content, opts });
    return;
  }
  try {
    await client.sendMessage(to, content, opts);
    console.log(`Mensagem enviada para ${to}`);
  } catch (e) {
    console.error('Erro ao enviar mensagem:', e.message);
  }
}

// ─── Função de reinicialização robusta ──────────────────────
async function restartClient() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Máximo de tentativas de reconexão atingido');
    process.exit(1); // Render vai reiniciar o container
  }
  
  reconnectAttempts++;
  console.log(`Tentativa de reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
  
  isReady = false;
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  try { 
    await client.destroy(); 
  } catch (e) {
    console.error('Erro ao destruir client:', e.message);
  }
  
  // Aguarda antes de reinicializar
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  client.initialize();
}

// ─── Handlers de eventos do client ──────────────────────────
client.on('qr', qr => {
  latestQR = qr; // Atualiza QR para servir via web
  reconnectAttempts = 0; // Reset contador ao receber QR
  
  console.log('\n' + '='.repeat(50));
  console.log('QR Code disponível em: /qr');
  console.log('='.repeat(50) + '\n');
  
  // Exibe QR no terminal também
  try {
    qrcodeTerminal.generate(qr, { small: true });
  } catch (e) {
    console.error('Erro ao gerar QR no terminal:', e.message);
  }
});

client.on('authenticated', () => {
  console.log('✅ Autenticado com sucesso');
  reconnectAttempts = 0;
});

client.on('auth_failure', async msg => {
  console.error('❌ Falha na autenticação:', msg);
  await restartClient();
});

client.on('ready', async () => {
  console.log('✅ WhatsApp Web está pronto!');
  isReady = true;
  latestQR = null; // Limpa QR após conectar
  
  // Obtém informações do cliente
  try {
    const info = client.info;
    console.log('📱 Conectado como:', info.pushname || 'N/A');
  } catch (e) {
    console.log('Não foi possível obter informações do cliente');
  }
  
  // Despacha fila de mensagens pendentes
  while (pendingSends.length > 0) {
    const msg = pendingSends.shift();
    await safeSend(msg.to, msg.content, msg.opts);
  }
  
  // KEEP-ALIVE: envia presença a cada 5 minutos
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    if (isReady) {
      console.log('Keep-alive: enviando presença');
      client.sendPresenceAvailable().catch(e => 
        console.error('Erro no keep-alive:', e.message)
      );
    }
  }, 5 * 60 * 1000);
});

client.on('disconnected', async reason => {
  console.warn('⚠️ Cliente desconectado:', reason);
  isReady = false;
  await restartClient();
});

// Captura erros não tratados
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
  // Não feche o processo imediatamente
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  // Tenta reiniciar o client
  if (isReady) {
    restartClient().catch(console.error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, encerrando...');
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  try {
    await client.destroy();
  } catch (e) {
    console.error('Erro ao destruir client no shutdown:', e);
  }
  server.close(() => {
    console.log('Servidor HTTP fechado');
    process.exit(0);
  });
});

// ─── Lógica de processamento de mensagens ───────────────────
const greeted = new Set();

client.on('message', async msg => {
  try {
    if (msg.fromMe) return;
    const chatId = msg.from;
    const cmd = (msg.body || '').trim().toLowerCase();
    
    console.log(`Mensagem recebida de ${chatId}: ${cmd}`);
    
    if (!greeted.has(chatId)) {
      greeted.add(chatId);
      await safeSend(
        chatId,
        '👋 Olá! Sou o PieBot\n\nComandos disponíveis:\n• !ping - testar conexão\n• !s - criar figurinha estática\n• !sa - criar figurinha animada\n\nEnvie uma imagem/vídeo junto com o comando ou responda a uma mídia!'
      );
    }
    
    if (cmd === '!ping') {
      await safeSend(chatId, '🏓 Pong!');
      return;
    }
    
    if (cmd !== '!s' && cmd !== '!sa') return;
    
    const animated = cmd === '!sa';
    let target = msg;
    
    // Verifica se é uma resposta a outra mensagem
    if (!['image', 'video', 'document'].includes(msg.type) && msg.hasQuotedMsg) {
      try {
        const quoted = await msg.getQuotedMessage();
        if (quoted) target = quoted;
      } catch (e) {
        console.error('Erro ao obter mensagem citada:', e.message);
      }
    }
    
    if (!['image', 'video', 'document'].includes(target.type)) {
      await safeSend(
        chatId,
        animated ? 
          '❌ Envie um GIF ou vídeo MP4 com o comando !sa' : 
          '❌ Envie uma imagem com o comando !s'
      );
      return;
    }
    
    // Envia reação de processamento
    try {
      await msg.react('⏳');
    } catch (e) {
      console.log('Não foi possível adicionar reação');
    }
    
    // Download da mídia
    let media;
    try {
      media = await target.downloadMedia();
      if (!media || !media.data) throw new Error('Dados de mídia vazios');
    } catch (e) {
      console.error('Erro ao baixar mídia:', e.message);
      await safeSend(chatId, '❌ Falha ao baixar mídia');
      await msg.react('❌').catch(() => {});
      return;
    }
    
    const buf = Buffer.from(media.data, 'base64');
    const tmpDir = os.tmpdir();
    const ext = (media.mimetype || '').split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const inFile = path.join(tmpDir, `in_${randomUUID()}.${ext}`);
    const outFile = path.join(tmpDir, `out_${randomUUID()}.webp`);
    
    try {
      await fs.writeFile(inFile, buf);
      
      if (!animated) {
        // Figurinha estática
        console.log('Criando figurinha estática...');
        let webpBuf = await sharp(inFile)
          .resize(512, 512, { 
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .webp({ quality: 90 })
          .toBuffer();
          
        // Se ainda for muito grande, reduz qualidade
        if (webpBuf.length > 1024 * 1024) {
          console.log('Reduzindo tamanho da figurinha...');
          webpBuf = await sharp(inFile)
            .resize(512, 512, { 
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 60 })
            .toBuffer();
        }
        
        await safeSend(
          chatId,
          new MessageMedia('image/webp', webpBuf.toString('base64')),
          { sendMediaAsSticker: true, stickerAuthor: 'PieBot', stickerName: 'Sticker' }
        );
        await msg.react('✅').catch(() => {});
        
      } else {
        // Figurinha animada
        console.log('Criando figurinha animada...');
        await new Promise((resolve, reject) => {
          ffmpeg(inFile)
            .inputOptions(['-t', '10']) // Máximo 10 segundos
            .outputOptions([
              '-vcodec', 'libwebp',
              '-loop', '0',
              '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
              '-preset', 'default',
              '-an', // Remove áudio
              '-vsync', '0',
              '-qscale', '50'
            ])
            .on('end', resolve)
            .on('error', reject)
            .on('stderr', line => console.log('FFmpeg:', line))
            .save(outFile);
        });
        
        const stats = await fs.stat(outFile);
        console.log(`Tamanho da figurinha: ${(stats.size / 1024).toFixed(2)} KB`);
        
        // Se ainda for muito grande, reprocessa com qualidade menor
        if (stats.size > 1024 * 1024) {
          console.log('Reduzindo tamanho da figurinha animada...');
          await fs.unlink(outFile).catch(() => {});
          
          await new Promise((resolve, reject) => {
            ffmpeg(inFile)
              .inputOptions(['-t', '8']) // Reduz para 8 segundos
              .outputOptions([
                '-vcodec', 'libwebp',
                '-loop', '0',
                '-vf', 'fps=10,scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-qscale', '60'
              ])
              .on('end', resolve)
              .on('error', reject)
              .save(outFile);
          });
        }
        
        const outBuf = await fs.readFile(outFile);
        await safeSend(
          chatId,
          new MessageMedia('image/webp', outBuf.toString('base64')),
          { sendMediaAsSticker: true, stickerAuthor: 'PieBot', stickerName: 'Animated' }
        );
        await msg.react('✅').catch(() => {});
      }
      
    } catch (e) {
      console.error('Erro ao criar figurinha:', e);
      await safeSend(
        chatId,
        animated ? 
          '❌ Erro ao criar figurinha animada. Verifique se o arquivo é um GIF ou vídeo válido.' : 
          '❌ Erro ao criar figurinha estática. Verifique se o arquivo é uma imagem válida.'
      );
      await msg.react('❌').catch(() => {});
      
    } finally {
      // Limpa arquivos temporários
      await Promise.all([
        fs.unlink(inFile).catch(() => {}),
        fs.unlink(outFile).catch(() => {})
      ]);
    }
    
  } catch (e) {
    console.error('Erro no processamento da mensagem:', e);
  }
});

// Inicializa o cliente com retry em caso de falha
console.log('🚀 Iniciando WhatsApp Web Client...');
console.log('⏳ Primeira inicialização pode demorar 1-2 minutos no Render...');

// Função para inicializar com timeout
async function initializeWithTimeout() {
  const initTimeout = setTimeout(() => {
    console.error('⚠️ Timeout na inicialização (2 min). Tentando novamente...');
    client.destroy().then(() => {
      setTimeout(() => initializeWithTimeout(), 5000);
    });
  }, 120000); // 2 minutos timeout

  try {
    await client.initialize();
    clearTimeout(initTimeout);
  } catch (error) {
    clearTimeout(initTimeout);
    console.error('❌ Erro na inicialização:', error.message);
    console.log('🔄 Tentando novamente em 10 segundos...');
    setTimeout(() => initializeWithTimeout(), 10000);
  }
}

// Inicia o processo
initializeWithTimeout();
