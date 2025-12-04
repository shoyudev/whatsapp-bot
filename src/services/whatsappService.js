const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const config = require('../config');
const stickerService = require('./stickerService');

class WhatsappService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: config.sessionPath,
        clientId: 'bot-session'
      }),
      puppeteer: {
        ...config.puppeteer,
        executablePath: config.isRender ? config.chromiumPath : undefined
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      }
    });

    this.latestQR = null;
    this.isReady = false;
    this._initializeEvents();
  }

  _initializeEvents() {
    this.client.on('qr', (qr) => {
      this.latestQR = qr;
      console.log('QR Code recebido!');
      qrcodeTerminal.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.latestQR = null;
      console.log('✅ Cliente WhatsApp Pronto!');
    });

    this.client.on('message', this._handleMessage.bind(this));
    
    this.client.on('disconnected', async (reason) => {
      console.log('Cliente desconectado:', reason);
      this.isReady = false;
      // Lógica de reconexão poderia ser expandida aqui
      this.client.initialize();
    });
  }

  async _handleMessage(msg) {
    if (msg.fromMe) return;

    const body = (msg.body || '').trim().toLowerCase();
    
    if (body === '!ping') {
      await msg.reply('🏓 Pong!');
    }

    if (body === '!s' || body === '!sa') {
      await this._handleStickerCommand(msg, body === '!sa');
    }
  }

  async _handleStickerCommand(msg, isAnimated) {
    let targetMsg = msg;
    if (msg.hasQuotedMsg) {
      targetMsg = await msg.getQuotedMessage();
    }

    if (!targetMsg.hasMedia) {
      return msg.reply('❌ Por favor, envie uma imagem/vídeo ou responda a uma mídia.');
    }

    try {
      await msg.react('⏳');
      const media = await targetMsg.downloadMedia();
      
      if (!media) throw new Error('Falha no download da mídia');

      const stickerBase64 = await stickerService.createSticker(
        media.data, 
        media.mimetype, 
        isAnimated
      );

      const stickerMedia = new MessageMedia('image/webp', stickerBase64);
      
      await msg.reply(stickerMedia, null, {
        sendMediaAsSticker: true,
        stickerAuthor: config.sticker.author,
        stickerName: isAnimated ? 'Animated' : config.sticker.pack
      });
      
      await msg.react('✅');
    } catch (error) {
      console.error('Erro ao gerar sticker:', error);
      await msg.reply('❌ Erro ao gerar figurinha. Verifique o arquivo.');
      await msg.react('❌');
    }
  }

  initialize() {
    this.client.initialize();
  }

  getQR() {
    return this.latestQR;
  }
}

module.exports = new WhatsappService();
