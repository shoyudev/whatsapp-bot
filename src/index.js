const whatsappService = require('./services/whatsappService');
const createServer = require('./server/http');

// Inicia o serviço do WhatsApp
whatsappService.initialize();

// Inicia o servidor Web (passando o serviço para acessar o QR)
createServer(whatsappService);

// Tratamento de Encerramento
process.on('SIGTERM', async () => {
  console.log('Encerrando...');
  await whatsappService.client.destroy();
  process.exit(0);
});
