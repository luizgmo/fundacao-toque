/* ============================
   INTERAÇÕES — Toggle, stepper, etc.
   ============================ */

/* TOGGLE PRESENÇA (frequência) */
function togglePresenca(btn) {
  if (btn.classList.contains('present')) {
    btn.classList.remove('present');
    btn.classList.add('absent');
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Ausente';
  } else {
    btn.classList.remove('absent');
    btn.classList.add('present');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Presente';
  }
  atualizarContagemFrequencia();
}
function atualizarContagemFrequencia() {
  const presentes = document.querySelectorAll('.attendance-toggle.present').length;
  const ausentes = document.querySelectorAll('.attendance-toggle.absent').length;
  const total = presentes + ausentes;
  const counter = document.getElementById('attendanceCount');
  if (counter) counter.textContent = `${presentes} presentes / ${ausentes} ausentes — Total: ${total}`;
}

/* WIZARD (stepper) */
function nextStep() {
  const active = document.querySelector('.wizard-step.active');
  if (!active) return;
  const next = active.nextElementSibling;
  if (next && next.classList.contains('wizard-step')) {
    active.classList.remove('active');
    active.classList.add('completed');
    next.classList.add('active');
    updateWizardFooter();
  }
}
function prevStep() {
  const active = document.querySelector('.wizard-step.active');
  if (!active) return;
  const prev = active.previousElementSibling;
  if (prev && prev.classList.contains('wizard-step')) {
    active.classList.remove('active');
    prev.classList.remove('completed');
    prev.classList.add('active');
    updateWizardFooter();
  }
}
function updateWizardFooter() {
  const active = document.querySelector('.wizard-step.active');
  if (!active) return;
  const isFirst = !active.previousElementSibling?.classList.contains('wizard-step');
  const isLast = !active.nextElementSibling?.classList.contains('wizard-step');
  const prevBtn = document.getElementById('wizardPrev');
  const nextBtn = document.getElementById('wizardNext');
  const submitBtn = document.getElementById('wizardSubmit');
  if (prevBtn) prevBtn.style.visibility = isFirst ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.style.display = isLast ? 'none' : 'inline-flex';
  if (submitBtn) submitBtn.style.display = isLast ? 'inline-flex' : 'none';
}

/* FILTRO DE TABELA */
function filterTable(inputId, tableId) {
  const filter = document.getElementById(inputId).value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(filter) ? '' : 'none';
  });
}

/* UPLOAD SIMULADO */
function handleUpload(zone, listId) {
  const files = ['ficha_medica.pdf', 'documento_rg.pdf'];
  const list = document.getElementById(listId);
  if (!list) return;
  files.forEach(f => {
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.innerHTML = `<i class="fa-solid fa-file-pdf" style="color:var(--cor-erro)"></i><span>${f}</span>
      <button class="btn-icon" style="margin-left:auto" onclick="this.parentElement.remove()">
        <i class="fa-solid fa-xmark"></i>
      </button>`;
    list.appendChild(item);
  });
  showToast('Arquivos anexados com sucesso!', 'success');
}
