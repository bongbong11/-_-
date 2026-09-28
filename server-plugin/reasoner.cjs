const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_REQUEST_BYTES = 120_000;
const MAX_RESPONSE_BYTES = 120_000;
const MAX_PROFILES = 12;

function profileFiles(root) {
    return { profiles: path.join(root, 'reasoner-profiles.json'), secrets: path.join(root, 'reasoner-secrets.json') };
}

async function readJson(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
    const body = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(body, 'utf8') > 200_000) throw new Error('Reasoner profile storage is too large.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, file);
}

function safeProfile(input) {
    const value = input && typeof input === 'object' ? input : {};
    const adapter = String(value.adapter || 'openai_compatible');
    if (!['openai_compatible', 'gemini'].includes(adapter)) throw new Error('Unsupported reasoner adapter.');
    const id = String(value.id || '').trim();
    if (!/^[a-zA-Z0-9_-]{4,80}$/.test(id)) throw new Error('Invalid reasoner profile ID.');
    const name = String(value.name || '').trim().slice(0, 80);
    const model = String(value.model || '').trim().slice(0, 120);
    if (!name || !model) throw new Error('Reasoner profile name and model are required.');
    const rawUrl = String(value.baseUrl || (adapter === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : '')).trim();
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error('Invalid reasoner API URL.'); }
    if (url.username || url.password || url.search || url.hash) throw new Error('Reasoner API URL must not contain credentials or query parameters.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Reasoner API URL must use HTTPS (local loopback may use HTTP).');
    return {
        id, name, adapter, baseUrl: url.toString().replace(/\/$/, ''), model,
        timeoutMs: Math.max(3000, Math.min(60000, Number(value.timeoutMs) || 30000)),
        temperature: Math.max(0, Math.min(1, Number(value.temperature) || 0)),
        maxTokens: Math.max(256, Math.min(3000, Number(value.maxTokens) || 1200)),
    };
}

async function readProfiles(root) {
    const files = profileFiles(root);
    const profiles = await readJson(files.profiles, []);
    const secrets = await readJson(files.secrets, {});
    return { files, profiles: Array.isArray(profiles) ? profiles : [], secrets: secrets && typeof secrets === 'object' ? secrets : {} };
}

function publicProfiles(profiles, secrets) {
    return profiles.map((item) => ({ ...item, keyStatus: secrets[item.id] ? `저장됨 ····${String(secrets[item.id]).slice(-4)}` : '저장된 키 없음' }));
}

function apiEndpoint(profile) {
    if (profile.adapter === 'gemini') return `${profile.baseUrl}/models/${encodeURIComponent(profile.model)}:generateContent`;
    return profile.baseUrl.endsWith('/chat/completions') ? profile.baseUrl : `${profile.baseUrl.replace(/\/$/, '')}/chat/completions`;
}

async function invoke(profile, apiKey, system, input) {
    if (!apiKey) throw new Error('Reasoner API key is missing.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), profile.timeoutMs);
    const gemini = profile.adapter === 'gemini';
    const body = gemini ? {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { temperature: profile.temperature, maxOutputTokens: profile.maxTokens, responseMimeType: 'application/json' },
    } : {
        model: profile.model, temperature: profile.temperature, max_tokens: profile.maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
    };
    try {
        const response = await fetch(apiEndpoint(profile), {
            method: 'POST', signal: controller.signal, redirect: 'error',
            headers: { 'Content-Type': 'application/json', ...(gemini ? { 'x-goog-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }) },
            body: JSON.stringify(body),
        });
        const raw = await response.text();
        if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Reasoner response is too large.');
        if (!response.ok) throw new Error(`Reasoner API returned HTTP ${response.status}.`);
        const parsed = JSON.parse(raw);
        const content = gemini
            ? parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
            : parsed.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Reasoner returned no text.');
        return content.trim();
    } finally { clearTimeout(timeout); }
}

function parseStructured(text) {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(clean);
}

function registerReasonerRoutes(router, { rootFor, storageHandler }) {
    router.post('/reasoner/profiles', storageHandler(async (request, response) => {
        const { profiles, secrets } = await readProfiles(rootFor(request));
        response.json({ ok: true, profiles: publicProfiles(profiles, secrets) });
    }));
    router.post('/reasoner/profile/save', storageHandler(async (request, response) => {
        const root = rootFor(request);
        const { files, profiles, secrets } = await readProfiles(root);
        const profile = safeProfile(request.body?.profile);
        const index = profiles.findIndex((item) => item.id === profile.id);
        if (index < 0 && profiles.length >= MAX_PROFILES) throw new Error('Reasoner profile limit reached.');
        if (index < 0) profiles.push(profile); else profiles[index] = profile;
        const key = String(request.body?.apiKey || '').trim();
        if (key.length > 512) throw new Error('Reasoner API key is too long.');
        if (key) secrets[profile.id] = key;
        if (request.body?.clearKey === true) delete secrets[profile.id];
        await writeJson(files.profiles, profiles);
        await writeJson(files.secrets, secrets);
        response.json({ ok: true, profiles: publicProfiles(profiles, secrets) });
    }));
    router.post('/reasoner/profile/delete', storageHandler(async (request, response) => {
        const { files, profiles, secrets } = await readProfiles(rootFor(request));
        const id = String(request.body?.id || '');
        delete secrets[id];
        const next = profiles.filter((item) => item.id !== id);
        await writeJson(files.profiles, next);
        await writeJson(files.secrets, secrets);
        response.json({ ok: true, profiles: publicProfiles(next, secrets) });
    }));
    for (const [route, testing] of [['/reasoner/test', true], ['/reasoner/run', false]]) {
        router.post(route, async (request, response) => {
            try {
                const root = rootFor(request);
                const { profiles, secrets } = await readProfiles(root);
                const profile = profiles.find((item) => item.id === request.body?.profileId);
                if (!profile) return response.status(404).json({ error: 'Reasoner profile not found.' });
                const input = testing ? 'Return exactly {"ok":true} as a JSON object.' : JSON.stringify(request.body?.state || {});
                if (Buffer.byteLength(input, 'utf8') > MAX_REQUEST_BYTES) return response.status(413).json({ error: 'Reasoner request is too large.' });
                const system = testing ? 'Return JSON only.' : String(request.body?.system || 'Return JSON only.').slice(0, 12_000);
                const parsed = parseStructured(await invoke(profile, secrets[profile.id], system, input));
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Reasoner response is not a JSON object.');
                if (testing && parsed.ok !== true) throw new Error('Reasoner structured response test failed.');
                response.json(testing ? { ok: true, profile: { id: profile.id, name: profile.name } } : { ok: true, result: parsed, profile: { id: profile.id, name: profile.name } });
            } catch (error) {
                response.status(error?.name === 'AbortError' ? 504 : 502).json({ error: error?.message || 'Reasoner request failed.' });
            }
        });
    }
}

module.exports = { registerReasonerRoutes, _test: { safeProfile, apiEndpoint, parseStructured } };
