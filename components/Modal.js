// نافذة منبثقة عامة قابلة لإعادة الاستخدام — تُبنى محتوياتها من الصفحة المستدعية
export function openModal({ title, bodyHtml, onMount }) {
  let overlay = document.getElementById('app-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'app-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" id="app-modal"></div>';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  const modal = document.getElementById('app-modal');
  modal.innerHTML =
    '<div class="modal-header">' +
      '<div class="modal-title">' + title + '</div>' +
      '<button class="modal-close" data-close-modal type="button">✕</button>' +
    '</div>' +
    '<div class="modal-body">' + bodyHtml + '</div>';
  modal.querySelector('[data-close-modal]').addEventListener('click', closeModal);
  overlay.classList.add('open');
  if (onMount) onMount(modal);
  return modal;
}

export function closeModal() {
  const overlay = document.getElementById('app-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}
