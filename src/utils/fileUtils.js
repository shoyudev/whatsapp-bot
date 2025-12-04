const fs = require('fs').promises;

const cleanupFiles = async (files = []) => {
  for (const file of files) {
    try {
      if (file) await fs.unlink(file);
    } catch (error) {
      console.warn(`Erro ao deletar arquivo ${file}:`, error.message);
    }
  }
};

module.exports = { cleanupFiles };
