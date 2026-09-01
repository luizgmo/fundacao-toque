/* ============================
   MODAIS — Abrir/fechar
   ============================ */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

/* ============================
   TOAST
   ============================ */
function showToast(msg, tipo = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = 'toast show ' + tipo;
  t.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${msg}</span>`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
