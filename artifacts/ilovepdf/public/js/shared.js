// Shared helpers: modals, sidebar toggle, cookies, signup-required flow, processing overlay.

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

function handleModalBackdropClick(e) { if (e.target === e.currentTarget) closeComingSoonModal(); }
function closeComingSoonModal() {
  const m = document.getElementById('coming-soon-modal');
  if (m) m.classList.add('hidden');
  document.body.style.overflow = '';
}

function handleSignupBackdrop(e) { /* auth modal removed */ }
function showSignupModal(file) {
  const mb = file ? (file.size / (1024 * 1024)).toFixed(1) : '?';
  const name = file ? file.name : 'This file';
  // Show a non-blocking banner — auth modal removed, just inform user of size limit
  let banner = document.getElementById('size-limit-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'size-limit-banner';
    banner.style.cssText = [
      'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:9999',
      'background:#fff;border:1.5px solid #fecaca;border-left:4px solid #ef4444',
      'border-radius:10px;padding:14px 18px;max-width:430px;width:calc(100% - 32px)',
      'box-shadow:0 4px 20px rgba(0,0,0,.12);font-size:.88rem;color:#0f172a',
      'display:flex;gap:12px;align-items:flex-start'
    ].join(';');
    banner.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           style="flex-shrink:0;margin-top:1px">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <div style="font-weight:700;margin-bottom:3px">${window.t ? window.t('modal.file_too_large') : 'File too large'}</div>
        <div id="size-limit-msg"></div>
      </div>`;
    document.body.appendChild(banner);
  }
  const msgEl = banner.querySelector('#size-limit-msg');
  if (msgEl) msgEl.textContent = `"${name}" is ${mb} MB — the 100 MB limit applies. Please use a smaller file.`;
  banner.style.display = 'flex';
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => { banner.style.display = 'none'; }, 7000);
}
function closeSignupModal() { /* auth modal removed */ }

let _processingMessageTimer = null;
let _processingMessageIndex = 0;
const _processingMessages = [
  'Handling your files with care…',
  'Applying your settings locally…',
  'Keeping your documents on this device…',
  'Finishing the selected operation…',
];

function showProcessing(title, msg) {
  const root = document.getElementById('result-area') ||
    document.getElementById('tool-content');
  if (!root) return;

  let card = document.getElementById('processing-inline-status');
  if (!card) {
    card = document.createElement('section');
    card.id = 'processing-inline-status';
    card.className = 'status-card status-loading processing-inline';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-atomic', 'true');
    card.innerHTML = `
      <div class="spinner" aria-hidden="true"></div>
      <div class="processing-inline-copy">
        <div class="status-card-title" id="processing-title"></div>
        <div class="status-card-msg" id="processing-msg"></div>
        <div class="processing-bar" role="progressbar" aria-label="Processing locally" aria-valuemin="0" aria-valuemax="100">
          <div class="processing-bar-fill"></div>
        </div>
      </div>`;
    root.appendChild(card);
    if (!document.getElementById('processing-inline-style')) {
      const style = document.createElement('style');
      style.id = 'processing-inline-style';
      style.textContent = `
        .processing-inline{display:flex;gap:14px;align-items:flex-start;padding:18px}
        .processing-inline-copy{flex:1;min-width:0}
        .processing-inline .processing-bar{height:6px;overflow:hidden;border-radius:99px;margin-top:12px;background:#e9edf5}
        .processing-inline .processing-bar-fill{height:100%;width:38%;border-radius:inherit;background:currentColor;animation:iplv-processing-sweep 1.25s ease-in-out infinite alternate}
        @keyframes iplv-processing-sweep{from{transform:translateX(-35%)}to{transform:translateX(170%)}}
      `;
      document.head.appendChild(style);
    }
  }

  const titleNode = document.getElementById('processing-title');
  const messageNode = document.getElementById('processing-msg');
  if (titleNode) titleNode.textContent = title || 'Processing your file…';
  if (messageNode) messageNode.textContent = msg || _processingMessages[0];
  clearInterval(_processingMessageTimer);
  _processingMessageIndex = 0;
  _processingMessageTimer = setInterval(function () {
    if (!document.getElementById('processing-inline-status')) {
      clearInterval(_processingMessageTimer);
      _processingMessageTimer = null;
      return;
    }
    _processingMessageIndex = (_processingMessageIndex + 1) % _processingMessages.length;
    const currentMessage = document.getElementById('processing-msg');
    if (currentMessage) currentMessage.textContent = _processingMessages[_processingMessageIndex];
  }, 1600);
  // The legacy modal stays hidden; processing status is always inline.
  const overlay = document.getElementById('processing-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (window.lucide) lucide.createIcons();
  try { performance.mark('iplv-process-start'); } catch (_) {}
}
function hideProcessing() {
  clearInterval(_processingMessageTimer);
  _processingMessageTimer = null;
  const inlineStatus = document.getElementById('processing-inline-status');
  if (inlineStatus) inlineStatus.remove();
  const o = document.getElementById('processing-overlay');
  if (o) o.classList.add('hidden');
  // Measure total processing wall-time and emit to analytics
  try {
    performance.mark('iplv-process-end');
    const m = performance.measure('iplv-process-duration', 'iplv-process-start', 'iplv-process-end');
    if (window.RuntimeAnalytics && typeof window.RuntimeAnalytics.track === 'function') {
      window.RuntimeAnalytics.track('processing:duration', { ms: Math.round(m.duration) });
    }
  } catch (_) {}
}

function acceptCookies() {
  localStorage.setItem('ilovepdf_cookies', '1');
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.classList.add('hidden');
}
window.acceptCookies = acceptCookies;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeComingSoonModal();
    closeSignupModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ilovepdf_cookies')) {
    const b = document.getElementById('cookie-banner');
    if (b) b.classList.add('hidden');
  }

  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('hidden');
    });
  }
  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }
});
