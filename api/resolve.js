const RENDER_ORIGIN = 'https://hpy-chry-go-lucki.onrender.com';

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const input = String(request.query.url || request.query.viewkey || '').trim();
  if (!input) return response.status(400).json({ error: 'Enter a video URL or viewkey.' });

  try {
    const upstream = await fetch(`${RENDER_ORIGIN}/resolve.php?url=${encodeURIComponent(input)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = await upstream.json();
    return response.status(upstream.status).json(payload);
  } catch (error) {
    return response.status(502).json({ error: error.message || 'Could not contact the Render resolver.' });
  }
};
