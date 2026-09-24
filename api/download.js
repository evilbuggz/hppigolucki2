const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');

const RENDER_ORIGIN = 'https://hpy-chry-go-lucki.onrender.com';
const WATERMARK_URL = `${RENDER_ORIGIN}/img/watermark.png`;

function allowMainSite(response, request) {
  const origin = request.headers.origin;
  if (origin === 'https://hpy-chry-go-lucki.onrender.com' || origin === 'http://localhost') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');
  }
}

function getViewkey(input) {
  try {
    const url = new URL(input);
    return url.searchParams.get('viewkey') || url.pathname.split('/').filter(Boolean).pop() || 'video';
  } catch {
    return input;
  }
}

function safePart(value, fallback) {
  return String(value || '').replace(/[^0-9A-Za-z_-]/g, '') || fallback;
}

module.exports = async function handler(request, response) {
  allowMainSite(response, request);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).send('Method not allowed.');
  }

  const input = String(request.query.url || request.query.viewkey || '').trim();
  const requestedQuality = String(request.query.quality || '');
  if (!input) return response.status(400).send('Enter a video URL or viewkey.');

  let watermarkPath;
  try {
    const sourceResponse = await fetch(`${RENDER_ORIGIN}/resolve.php?url=${encodeURIComponent(input)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const sourcePayload = await sourceResponse.json();
    if (!sourceResponse.ok || !Array.isArray(sourcePayload.sources)) {
      throw new Error(sourcePayload.error || `Render resolver returned HTTP ${sourceResponse.status}.`);
    }

    const source = sourcePayload.sources.find((item) => String(item.quality) === requestedQuality) || sourcePayload.sources[0];
    const mediaUrl = new URL(source.videoUrl);
    if (mediaUrl.protocol !== 'https:' || !mediaUrl.hostname.endsWith('.phncdn.com')) {
      throw new Error('The resolved media host is not allowed.');
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        referer: 'https://www.pornhub.com/',
        'user-agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
    });
    if (!mediaResponse.ok || !mediaResponse.body) {
      throw new Error(`Media server returned HTTP ${mediaResponse.status}.`);
    }

    const watermarkResponse = await fetch(WATERMARK_URL, { cache: 'no-store' });
    if (!watermarkResponse.ok) throw new Error('The watermark image could not be loaded.');
    watermarkPath = path.join('/tmp', `watermark-${Date.now()}.png`);
    await fs.writeFile(watermarkPath, Buffer.from(await watermarkResponse.arrayBuffer()));

    const quality = safePart(source.quality || source.height, 'source');
    const viewkey = safePart(getViewkey(input), 'video');
    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-threads', '0',
      '-filter_threads', '2',
      '-filter_complex_threads', '2',
      '-i', 'pipe:0',
      '-i', watermarkPath,
      '-filter_complex', '[0:v]scale=min(1280\\,iw):-2[video];[1:v]scale=iw*0.15:-1[watermark];[video][watermark]overlay=W-w-18:18:format=auto[outv]',
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-x264-params', 'rc-lookahead=0:ref=1:bframes=0:threads=0',
      '-crf', '30',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ]);

    response.statusCode = 200;
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Disposition', `attachment; filename="${quality}ph-${viewkey}.mp4"`);
    response.setHeader('Cache-Control', 'no-store');

    Readable.fromWeb(mediaResponse.body).pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(response);

    await new Promise((resolve, reject) => {
      ffmpeg.once('error', reject);
      ffmpeg.once('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}.`)));
    });
  } catch (error) {
    if (!response.headersSent) {
      return response.status(502).send(`Download failed: ${error.message || 'unknown error'}`);
    }
    response.destroy(error);
  } finally {
    if (watermarkPath) await fs.rm(watermarkPath, { force: true }).catch(() => {});
  }
};
