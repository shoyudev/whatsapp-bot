const express = require('express');
const QRCode = require('qrcode');
const config = require('../config');

const createServer = (whatsappService) => {
  const app = express();

  app.get('/qr', async (req, res) => {
    const qr = whatsappService.getQR();
    if (!qr) {
      return res.send('<html><meta http-equiv="refresh" content="5"><body><h1>Aguardando QR...</h1></body></html>');
    }
    try {
      const url = await QRCode.toDataURL(qr);
      res.send(`<html><meta http-equiv="refresh" content="20"><body><img src="${url}" /></body></html>`);
    } catch (e) {
      res.status(500).send('Erro QR');
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'online', ready: whatsappService.isReady });
  });

  app.listen(config.port, () => {
    console.log(`Servidor HTTP rodando na porta ${config.port}`);
  });
};

module.exports = createServer;
