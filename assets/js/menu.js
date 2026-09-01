/* ============================
   MENU — Toggle da sidebar no mobile
   ============================ */
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}
document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.btn-menu-toggle');
  if (sidebar && sidebar.classList.contains('open')
      && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

/* ============================
   TABS
   ============================ */
function openTab(tabId, btn) {
  const container = btn.closest('.tabs-container') || document;
  container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}
