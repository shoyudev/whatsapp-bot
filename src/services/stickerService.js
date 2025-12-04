const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { randomUUID } = require('crypto');
const config = require('../config');
const { cleanupFiles } = require('../utils/fileUtils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class StickerService {
  async createSticker(mediaData, mimeType, isAnimated) {
    const tmpDir = os.tmpdir();
    const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const inputFile = path.join(tmpDir, `in_${randomUUID()}.${ext}`);
    const outputFile = path.join(tmpDir, `out_${randomUUID()}.webp`);

    try {
      await fs.writeFile(inputFile, Buffer.from(mediaData, 'base64'));

      if (isAnimated) {
        return await this._processAnimated(inputFile, outputFile);
      } else {
        return await this._processStatic(inputFile);
      }
    } finally {
      await cleanupFiles([inputFile, outputFile]);
    }
  }

  async _processStatic(inputFile) {
    // Tenta primeiro com alta qualidade, se ficar grande, reduz
    let buffer = await sharp(inputFile)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: config.sticker.quality.static })
      .toBuffer();

    if (buffer.length > 1024 * 1024) {
      buffer = await sharp(inputFile)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 60 }) // Reduz qualidade drasticamente
        .toBuffer();
    }
    return buffer.toString('base64');
  }

  async _processAnimated(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .inputOptions([`-t ${config.sticker.videoLimitSeconds}`])
        .outputOptions([
          '-vcodec', 'libwebp',
          '-loop', '0',
          '-vf', 'fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
          '-preset', 'default',
          '-an',
          '-vsync', '0',
          `-qscale ${config.sticker.quality.animated}`
        ])
        .on('end', async () => {
          try {
            const buffer = await fs.readFile(outputFile);
            resolve(buffer.toString('base64'));
          } catch (e) {
            reject(e);
          }
        })
        .on('error', reject)
        .save(outputFile);
    });
  }
}

module.exports = new StickerService();
