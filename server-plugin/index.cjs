const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const MAX_BODY_BYTES = 1_000_000;
const MAX_STORAGE_BYTES = 20_000_000;
const TIMEOUT_MS = 35_000;
const STORE_FOLDER = 'scene-reader';

function sendError(response, status, message) { return response.status(status).json({ error: message }); }

function safeRoot(request) {
    const userRoot = String(request.user?.directories?.root || '').trim();
    if (!userRoot) throw new Error('SillyTavern user data directory is unavailable.');
    const root = path.resolve(userRoot, STORE_FOLDER);
    const base = path.resolve(userRoot);
    if (!root.startsWith(`${base}${path.sep}`)) throw new Error('Invalid Scene Reader storage path.');
    return root;
}

function recordId(value) { return crypto.createHash('sha256').update(String(value || 'unsaved')).digest('hex'); }

function pathsFor(request, chatKey = '') {
    const root = safeRoot(request);
    const id = recordId(chatKey);
    return {
        root,
        settings: path.join(root, 'settings.json'),
        secret: path.join(root, 'secrets.json'),
        chat: path.join(root, 'chats', `${id}.json`),
        history: path.join(root, 'history', `${id}.json`),
        characters: path.join(root, 'characters', `${id}.json`),
        backups: path.join(root, 'backups'),
    };
}

async function readJson(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJsonAtomic(file, value) {
    const body = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(body, 'utf8') > MAX_STORAGE_BYTES) throw new Error('Scene Reader storage record is too large.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, file);
}

async function removeFile(file) {
    try { await fs.unlink(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function walkFiles(root, current = root) {
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return []; }
    const files = [];
    for (const entry of entries) {
        if (current === root && entry.name === 'backups') continue;
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) files.push(...await walkFiles(root, absolute));
        else if (entry.isFile()) files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), text: await fs.readFile(absolute, 'utf8') });
    }
    return files;
}

async function createSnapshot(request, reason = 'manual') {
    const { root, backups } = pathsFor(request);
    await fs.mkdir(backups, { recursive: true });
    const createdAt = new Date().toISOString();
    const id = createdAt.replaceAll(':', '-').replace('.', '-');
    const snapshot = { schemaVersion: 1, id, createdAt, reason, files: await walkFiles(root) };
    await writeJsonAtomic(path.join(backups, `${id}.json`), snapshot);
    return snapshot;
}

async function listBackups(request) {
    const { backups } = pathsFor(request);
    let entries = [];
    try { entries = await fs.readdir(backups, { withFileTypes: true }); } catch { return []; }
    const rows = [];
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.json'))) {
        const snapshot = await readJson(path.join(backups, entry.name), null);
        if (snapshot?.id && Array.isArray(snapshot.files)) rows.push({ id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason || 'manual', fileCount: snapshot.files.length });
    }
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.files)) throw new Error('Invalid Scene Reader backup.');
    for (const entry of snapshot.files) {
        if (!entry || typeof entry.path !== 'string' || typeof entry.text !== 'string') throw new Error('Invalid Scene Reader backup entry.');
        const normalized = path.posix.normalize(entry.path);
        if (normalized.startsWith('../') || normalized === '..' || path.isAbsolute(normalized) || normalized.startsWith('backups/')) throw new Error('Unsafe Scene Reader backup path.');
    }
    return snapshot;
}

async function restoreSnapshot(request, snapshot) {
    validateSnapshot(snapshot);
    const { root } = pathsFor(request);
    await createSnapshot(request, 'before_restore');
    // Restore is exact: remove current records while preserving the backup archive.
    let current = [];
    try { current = await fs.readdir(root, { withFileTypes: true }); } catch { current = []; }
    for (const entry of current) {
        if (entry.name === 'backups') continue;
        const target = path.resolve(root, entry.name);
        if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Unsafe Scene Reader cleanup path.');
        await fs.rm(target, { recursive: true, force: true });
    }
    for (const entry of snapshot.files) {
        const target = path.resolve(root, ...entry.path.split('/'));
        if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Unsafe Scene Reader restore path.');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, entry.text, { encoding: 'utf8', mode: 0o600 });
    }
}

function storageHandler(handler) {
    return async (request, response) => {
        try { return await handler(request, response); }
        catch (error) { return sendError(response, 500, error?.message || 'Scene Reader storage failed.'); }
    };
}

async function init(router) {
    router.get('/health', (_request, response) => response.json({ ok: true, service: 'scene-reader-jev', model: MODEL, storage: true }));

    router.post('/storage/bootstrap', storageHandler(async (request, response) => {
        const chatKey = String(request.body?.chatKey || 'unsaved');
        const files = pathsFor(request, chatKey);
        const [settings, chat, history, characters, secret, backups] = await Promise.all([
            readJson(files.settings, {}), readJson(files.chat, null), readJson(files.history, []), readJson(files.characters, null), readJson(files.secret, {}), listBackups(request),
        ]);
        response.json({ ok: true, settings, chat, history: Array.isArray(history) ? history : [], characters, keyStatus: secret.jevKey ? `저장됨 ····${String(secret.jevKey).slice(-4)}` : '저장된 키 없음', backups });
    }));

    router.post('/storage/settings', storageHandler(async (request, response) => {
        await writeJsonAtomic(pathsFor(request).settings, request.body?.settings && typeof request.body.settings === 'object' ? request.body.settings : {});
        response.json({ ok: true });
    }));

    for (const [route, field] of [['chat', 'chat'], ['history', 'history'], ['characters', 'characters']]) {
        router.post(`/storage/${route}`, storageHandler(async (request, response) => {
            const chatKey = String(request.body?.chatKey || 'unsaved');
            const file = pathsFor(request, chatKey)[field];
            const value = request.body?.value;
            if (value === null) await removeFile(file); else await writeJsonAtomic(file, value);
            response.json({ ok: true });
        }));
    }

    router.post('/storage/key', storageHandler(async (request, response) => {
        const key = String(request.body?.key || '').trim();
        const file = pathsFor(request).secret;
        if (key) await writeJsonAtomic(file, { jevKey: key }); else await removeFile(file);
        response.json({ ok: true, keyStatus: key ? `저장됨 ····${key.slice(-4)}` : '저장된 키 없음' });
    }));

    router.post('/storage/backup/create', storageHandler(async (request, response) => {
        const snapshot = await createSnapshot(request, 'manual');
        response.json({ ok: true, backup: { id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason, fileCount: snapshot.files.length }, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/delete', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        await removeFile(path.join(pathsFor(request).backups, `${id}.json`));
        response.json({ ok: true, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/export', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        const snapshot = await readJson(path.join(pathsFor(request).backups, `${id}.json`), null);
        validateSnapshot(snapshot);
        response.json({ ok: true, snapshot });
    }));
    router.post('/storage/backup/restore', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        const snapshot = await readJson(path.join(pathsFor(request).backups, `${id}.json`), null);
        await restoreSnapshot(request, snapshot);
        response.json({ ok: true, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/import', storageHandler(async (request, response) => {
        const snapshot = validateSnapshot(request.body?.snapshot);
        await restoreSnapshot(request, snapshot);
        response.json({ ok: true, backups: await listBackups(request) });
    }));

    router.post('/systemone', async (request, response) => {
        let saved = {};
        try { saved = await readJson(pathsFor(request).secret, {}); } catch { /* compatibility with tests without a user root */ }
        const apiKey = String(request.get('X-Jev-Key') || saved.jevKey || '').trim();
        if (!apiKey) return sendError(response, 401, 'Jev API key is missing.');
        const body = request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(response, 400, 'A JSON request body is required.');
        const payload = JSON.stringify({ ...body, model: MODEL });
        if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) return sendError(response, 413, 'The Jev request is too large.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const upstream = await fetch(UPSTREAM, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: payload, signal: controller.signal });
            const text = await upstream.text();
            response.status(upstream.status).set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8').send(text);
        } catch (error) {
            if (error?.name === 'AbortError') return sendError(response, 504, 'Jev request timed out.');
            return sendError(response, 502, 'Could not connect to the Jev API.');
        } finally { clearTimeout(timeout); }
    });
}

async function exit() {}

module.exports = {
    init,
    exit,
    _test: { recordId, validateSnapshot, restoreSnapshot, createSnapshot, listBackups },
    info: { id: 'scene-reader-jev', name: 'Scene Reader Jev Relay', description: 'Forwards Scene Reader decisions to Jev and stores Scene Reader data under each SillyTavern user data directory.' },
};
