require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  isRender: process.env.RENDER === 'true',
  sessionPath: process.env.SESSION_PATH || './.wwebjs_auth',
  chromiumPath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  
  sticker: {
    author: 'PieBot',
    pack: 'Sticker',
    quality: {
      static: 90,
      animated: 50
    },
    videoLimitSeconds: 10
  },
  
  puppeteer: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],
    timeout: 60000
  }
};
