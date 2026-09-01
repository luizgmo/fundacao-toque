/* ============================
   MENU — Toggle da sidebar no mobile
   ============================ */
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    });
    document.body.appendChild(backdrop);
  }
  backdrop.classList.toggle('show', sidebar.classList.contains('open'));
}
document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.btn-menu-toggle');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (sidebar && sidebar.classList.contains('open')
      && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
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
