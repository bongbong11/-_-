const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const MAX_BODY_BYTES = 1_000_000;
const TIMEOUT_MS = 35_000;

function sendError(response, status, message) {
    return response.status(status).json({ error: message });
}

async function init(router) {
    router.get('/health', (_request, response) => {
        response.json({ ok: true, service: 'scene-reader-jev', model: MODEL });
    });

    router.post('/systemone', async (request, response) => {
        const apiKey = String(request.get('X-Jev-Key') || '').trim();
        if (!apiKey) return sendError(response, 401, 'Jev API key is missing.');

        const body = request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return sendError(response, 400, 'A JSON request body is required.');
        }

        const payload = JSON.stringify({ ...body, model: MODEL });
        if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) {
            return sendError(response, 413, 'The Jev request is too large.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const upstream = await fetch(UPSTREAM, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: payload,
                signal: controller.signal,
            });
            const text = await upstream.text();
            const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
            response.status(upstream.status).set('Content-Type', contentType).send(text);
        } catch (error) {
            if (error?.name === 'AbortError') return sendError(response, 504, 'Jev request timed out.');
            return sendError(response, 502, 'Could not connect to the Jev API.');
        } finally {
            clearTimeout(timeout);
        }
    });
}

async function exit() {}

module.exports = {
    init,
    exit,
    info: {
        id: 'scene-reader-jev',
        name: 'Scene Reader Jev Relay',
        description: 'Forwards Scene Reader decisions to the fixed official TypeSafe Jev endpoint without storing API keys.',
    },
};
