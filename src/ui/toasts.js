const poseUrl = name => new URL(`../../assets/toasts/${name}.webp`, import.meta.url).href;
const POSES = Object.freeze({
    info: poseUrl('director'), working: poseUrl('reading'), success: poseUrl('success'),
    warning: poseUrl('warning'), error: poseUrl('error'), paused: poseUrl('cover'), resumed: poseUrl('wave'),
});
const PEEK = poseUrl('peek');
const DURATIONS = Object.freeze({ info: 4000, success: 4000, warning: 7000, error: 8000, paused: 6000, resumed: 5000 });

function toastNode(toast) { return toast?.[0] || (toast?.nodeType === 1 ? toast : null); }

function decorate(toast, message, { level = 'info', title = '씬판독기', sceneState } = {}) {
    const node = toastNode(toast);
    if (!node || node.dataset.srDismissed === 'true') return;
    const state = Object.hasOwn(POSES, sceneState) ? sceneState : Object.hasOwn(POSES, level) ? level : 'info';
    node.classList.add('sr-scene-toast');
    node.dataset.srState = state;
    for (const type of ['info', 'success', 'warning', 'error']) node.classList.toggle(`toast-${type}`, type === level);
    const document = node.ownerDocument;
    let mascot = node.querySelector('.sr-toast-mascot');
    if (!mascot) {
        mascot = document.createElement('span');
        mascot.className = 'sr-toast-mascot';
        mascot.setAttribute('aria-hidden', 'true');
        for (const className of ['sr-toast-pose', 'sr-toast-peek']) {
            const image = document.createElement('img');
            image.className = className; image.alt = ''; image.width = 75; image.height = 75;
            mascot.append(image);
        }
        node.prepend(mascot);
    }
    mascot.querySelector('.sr-toast-pose').src = POSES[state];
    const peek = mascot.querySelector('.sr-toast-peek');
    peek.src = PEEK; peek.hidden = state !== 'paused';
    let titleNode = node.querySelector('.toast-title');
    if (!titleNode) { titleNode = document.createElement('div'); titleNode.className = 'toast-title'; node.append(titleNode); }
    titleNode.textContent = String(title || '씬판독기');
    let messageNode = node.querySelector('.toast-message');
    if (!messageNode) { messageNode = document.createElement('div'); messageNode.className = 'toast-message'; node.append(messageNode); }
    messageNode.textContent = String(message ?? '');
    let rating = node.querySelector('.sr-toast-rating');
    if (state === 'paused') {
        if (!rating) { rating = document.createElement('span'); rating.className = 'sr-toast-rating'; rating.textContent = '🔞'; rating.setAttribute('aria-hidden', 'true'); }
        titleNode.prepend(rating);
    } else rating?.remove();
    let detail = node.querySelector('.sr-toast-detail');
    if (state === 'paused') {
        if (!detail) { detail = document.createElement('div'); detail.className = 'sr-toast-detail'; node.append(detail); }
        detail.textContent = 'Ⅱ 동적 주입 쉬는 중';
    } else detail?.remove();
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `${titleNode.textContent}. ${messageNode.textContent}${detail ? `. ${detail.textContent}` : ''}. 알림 닫기`);
    if (!node.dataset.srDismissBound) {
        node.dataset.srDismissBound = 'true';
        const dismiss = () => { node.dataset.srDismissed = 'true'; toast.remove?.(); if (node.isConnected) node.remove(); };
        node.addEventListener('click', dismiss);
        node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(); } });
    }
}

// Decorate only this extension's notifications; leave the host's toastr object intact.
export function notifySceneReaderToast(host, level, message, title = '씬판독기', options = {}) {
    const { sceneState, ...nativeOptions } = options;
    const duration = DURATIONS[sceneState] || DURATIONS[level] || DURATIONS.info;
    const timeOut = sceneState === 'working' || nativeOptions.timeOut === 0 ? nativeOptions.timeOut ?? duration : Math.max(Number(nativeOptions.timeOut) || 0, duration);
    const toast = host?.toastr?.[level]?.(message, title, { ...nativeOptions, timeOut, closeButton: false, tapToDismiss: true, escapeHtml: true });
    decorate(toast, message, { level, title, sceneState });
    return toast;
}

export function updateSceneReaderToast(toast, message, options) {
    decorate(toast, message, options);
}
