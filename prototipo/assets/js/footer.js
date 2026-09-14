/* ============================
   FOOTER — Injeta o rodapé padrão em todas as páginas internas
   ============================ */
(function () {
  if (document.querySelector('.app')) {
    const main = document.querySelector('.app > div:last-child');
    if (main && !document.querySelector('.footer')) {
      const footer = document.createElement('footer');
      footer.className = 'footer';
      footer.innerHTML = `
        <div class="footer-grid">
          <div>
            <img src="${getPath()}assets/img/logo-branca.svg" alt="Fundação Toque" class="footer-logo" />
            <p>Fundação para o Bem Estar Educacional, Esportivo, Social, Cultural e Ocupacional de Araraquara e Região — FUNBESCO.</p>
            <p style="margin-top: var(--esp-3);">CNPJ: 08.409.109/0001-99</p>
          </div>
          <div>
            <h4>Menu</h4>
            <ul>
              <li><a href="${getPath()}dashboard.html">Dashboard</a></li>
              <li><a href="${getPath()}alunos/listar.html">Alunos</a></li>
              <li><a href="${getPath()}turmas.html">Turmas</a></li>
              <li><a href="${getPath()}oficinas.html">Oficinas</a></li>
            </ul>
          </div>
          <div>
            <h4>Pedagógico</h4>
            <ul>
              <li><a href="${getPath()}frequencia.html">Frequência</a></li>
              <li><a href="${getPath()}atividades.html">Atividades</a></li>
              <li><a href="${getPath()}evolucao.html">Evolução</a></li>
              <li><a href="${getPath()}relatorios.html">Relatórios</a></li>
            </ul>
          </div>
          <div>
            <h4>Contato</h4>
            <ul>
              <li><i class="fa-solid fa-location-dot"></i> Rua Pastor Deolindo Gonçalves de Freitas, 101</li>
              <li><i class="fa-solid fa-city"></i> Jardim Igaçaba — Araraquara/SP</li>
              <li><i class="fa-brands fa-whatsapp"></i> (16) 99702-9696</li>
              <li><i class="fa-solid fa-phone"></i> (16) 3333-2496</li>
              <li><i class="fa-solid fa-envelope"></i> toque2006@gmail.com</li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          © 2026 Fundação Toque — Todos os direitos reservados
        </div>
      `;
      main.appendChild(footer);
    }
  }
  function getPath() {
    // Detecta se estamos dentro de /alunos/ para ajustar paths relativos
    return window.location.pathname.includes('/alunos/') ? '../' : '';
  }
})();
