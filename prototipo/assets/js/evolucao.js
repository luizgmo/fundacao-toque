/*
 * Acompanhamento de Progresso — integração com o Cloud Firestore.
 *
 * Coleções usadas (conforme modelagem.md):
 *   - alunos                  (leitura: nome_completo, status)
 *   - registros_evolucao      (leitura e gravação das observações)
 *   - relatorios_pedagogicos  (gravação do relatório de um aluno)
 *   - usuarios                (nome do profissional logado)
 */

import { db, auth } from "../../../src/lib/firebase.ts";

import { onAuthStateChanged } from 'firebase/auth';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

const $ = (id) => document.getElementById(id);

/* ---------- estado da tela ---------- */

let usuarioAtual = null;
let alunos = [];
let registros = [];
let relatorioAtual = null; // último relatório gerado (para salvar/imprimir)

const AREAS = {
  cognitiva:   { nome: 'Cognitiva',   badge: 'info' },
  motora:      { nome: 'Motora',      badge: 'warning' },
  social:      { nome: 'Social',      badge: 'success' },
  comunicacao: { nome: 'Comunicação', badge: 'danger' },
  autonomia:   { nome: 'Autonomia',   badge: 'primary' },
  outra:       { nome: 'Outra',       badge: 'primary' },
};

const PERIODICIDADE = { diario: 'Diário', semestral: 'Semestral', anual: 'Anual' };

/* ---------- utilitários ---------- */

function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function hojeISO() {
  const h = new Date();
  const m = String(h.getMonth() + 1).padStart(2, '0');
  const d = String(h.getDate()).padStart(2, '0');
  return `${h.getFullYear()}-${m}-${d}`;
}

function fmtData(iso) {
  if (!iso) return '—';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

function nomeArea(area) {
  return AREAS[area]?.nome || area || 'Não informada';
}

function mostrarMensagem(mensagem, tipo = 'success') {
  if (typeof window.showToast === 'function') {
    window.showToast(mensagem, tipo);
  } else {
    window.alert(mensagem);
  }
}

function nomeAluno(id) {
  return alunos.find((a) => a.id === id)?.nome_completo || 'Aluno não encontrado';
}

/* ---------- carregamento de dados ---------- */

async function carregarUsuario(uid) {
  const resultado = await getDoc(doc(db, 'usuarios', uid));
  const dados = resultado.exists() ? resultado.data() : {};

  const nome =
    dados.nome_completo ||
    auth.currentUser?.displayName ||
    auth.currentUser?.email ||
    'Profissional autenticado';

  $('regProfissional').value = nome;

  if ($('userName')) $('userName').textContent = nome;
  if ($('userRole') && dados.papel) $('userRole').textContent = dados.papel;

  return { uid, nome, papel: dados.papel || null };
}

async function carregarAlunos() {
  const resultado = await getDocs(collection(db, 'alunos'));

  alunos = resultado.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((a) => a.status !== 'inativo')
    .sort((a, b) =>
      String(a.nome_completo || '').localeCompare(String(b.nome_completo || ''), 'pt-BR')
    );

  preencherAlunos();
}

async function carregarRegistros() {
  const resultado = await getDocs(collection(db, 'registros_evolucao'));

  registros = resultado.docs.map((item) => ({ id: item.id, ...item.data() }));

  registros.sort((a, b) =>
    String(b.data_registro || '').localeCompare(String(a.data_registro || ''))
  );
}

function preencherAlunos() {
  const opcoes = alunos
    .map((a) => `<option value="${esc(a.id)}">${esc(a.nome_completo)}</option>`)
    .join('');

  $('regAluno').innerHTML =
    '<option value="">Selecione o aluno...</option>' + opcoes;

  ['fltAluno', 'relAluno'].forEach((id) => {
    const sel = $(id);
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os alunos</option>' + opcoes;
    sel.value = atual;
  });
}

/* ---------- lista (timeline) ---------- */

function renderTimeline() {
  const fAluno = $('fltAluno').value;
  const fArea = $('fltArea').value;
  const dias = parseInt($('fltPeriodo').value, 10);

  let limite = '';
  if (dias > 0) {
    const l = new Date();
    l.setDate(l.getDate() - dias);
    limite = l.toISOString().slice(0, 10);
  }

  const lista = registros
    .filter((r) => !fAluno || r.aluno_id === fAluno)
    .filter((r) => !fArea || r.area === fArea)
    .filter((r) => !limite || String(r.data_registro || '') >= limite);

  const box = $('timeline');

  if (!lista.length) {
    box.innerHTML =
      '<p style="color: var(--cor-texto-secundario);">Nenhum registro encontrado.</p>';
    return;
  }

  box.innerHTML = lista.map((r) => `
    <div class="timeline-item">
      <div class="timeline-date">
        ${fmtData(r.data_registro)} — ${esc(nomeArea(r.area))} —
        ${esc(r.profissional_nome || r.profissional_usuario_id || 'Não informado')}
      </div>
      <div class="card" style="background: var(--cor-fundo);">
        <div style="display:flex; justify-content:space-between; align-items:start; gap: var(--esp-3);">
          <div>
            <h4 style="margin-bottom: var(--esp-1);">${esc(nomeAluno(r.aluno_id))}</h4>
            <p style="font-size: var(--tamanho-label); color: var(--cor-texto-secundario); margin: 0; white-space: pre-wrap;">${esc(r.observacao)}</p>
          </div>
          <span class="badge ${AREAS[r.area]?.badge || 'primary'}">${esc(nomeArea(r.area))}</span>
        </div>
      </div>
    </div>
  `).join('');
}

/* ---------- novo registro ---------- */

function mostrarErro(msg) {
  const p = $('regErro');
  p.textContent = msg;
  p.style.display = msg ? 'block' : 'none';
}

async function salvarRegistro(ev) {
  ev.preventDefault();

  const alunoId = $('regAluno').value;
  const data = $('regData').value;
  const area = $('regArea').value;
  const observacao = $('regDescricao').value.trim();

  if (!usuarioAtual) {
    mostrarErro('Profissional não identificado. Entre no sistema novamente.');
    return;
  }

  if (!alunoId || !data || !area || !observacao) {
    mostrarErro('Preencha aluno, data, área avaliada e descrição.');
    return;
  }
  mostrarErro('');

  const botao = $('btnSalvarRegistro');
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    await addDoc(collection(db, 'registros_evolucao'), {
      aluno_id: alunoId,
      data_registro: data,
      profissional_usuario_id: usuarioAtual.uid,
      profissional_nome: usuarioAtual.nome,
      area,
      observacao,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    });

    $('regDescricao').value = '';
    $('regArea').value = '';
    $('regData').value = hojeISO();

    await carregarRegistros();
    renderTimeline();
    mostrarMensagem('Observação salva com sucesso!', 'success');
  } catch (erro) {
    console.error('Erro ao salvar evolução:', erro);
    mostrarMensagem(
      `Não foi possível salvar. Verifique o login e as regras do Firestore. ${erro.message || ''}`,
      'error'
    );
  } finally {
    botao.disabled = false;
    botao.innerHTML = '<i class="fa-solid fa-save"></i> Salvar registro';
  }
}

function focarFormulario() {
  $('cardRegistro').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('regAluno').focus();
}

/* ---------- relatórios ---------- */

function calcularPeriodo(tipo, ref) {
  const ano = ref.slice(0, 4);
  const mes = parseInt(ref.slice(5, 7), 10);

  if (tipo === 'diario') return { inicio: ref, fim: ref };
  if (tipo === 'anual') return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };

  return mes <= 6
    ? { inicio: `${ano}-01-01`, fim: `${ano}-06-30` }
    : { inicio: `${ano}-07-01`, fim: `${ano}-12-31` };
}

function abrirRelatorio() {
  $('relData').value = hojeISO();
  $('relResultado').innerHTML = '';
  $('btnImprimir').style.display = 'none';
  $('btnSalvarRelatorio').style.display = 'none';
  relatorioAtual = null;
  window.openModal('modalRelatorio');
}

async function gerarRelatorio() {
  const tipo = $('relPeriodicidade').value;
  const ref = $('relData').value;
  const alunoId = $('relAluno').value;
  const saida = $('relResultado');

  $('btnImprimir').style.display = 'none';
  $('btnSalvarRelatorio').style.display = 'none';

  if (!ref) {
    saida.innerHTML = '<p style="color: var(--cor-erro);">Informe a data de referência.</p>';
    return;
  }

  const botao = $('btnGerarRelatorio');
  botao.disabled = true;

  try {
    // Busca os dados mais recentes antes de montar o relatório
    await carregarRegistros();
  } catch (erro) {
    console.error('Erro ao buscar registros:', erro);
    mostrarMensagem('Não foi possível buscar os registros no Firestore.', 'error');
    botao.disabled = false;
    return;
  }
  botao.disabled = false;

  const { inicio, fim } = calcularPeriodo(tipo, ref);

  const lista = registros
    .filter((r) => {
      const d = String(r.data_registro || '');
      return d >= inicio && d <= fim;
    })
    .filter((r) => !alunoId || r.aluno_id === alunoId)
    .sort((a, b) => String(a.data_registro).localeCompare(String(b.data_registro)));

  const contagem = {};
  lista.forEach((r) => { contagem[r.area] = (contagem[r.area] || 0) + 1; });

  const resumo = Object.keys(contagem).length
    ? Object.keys(contagem).map((a) =>
        `<span class="badge ${AREAS[a]?.badge || 'primary'}" style="margin-right:6px;">${esc(nomeArea(a))}: ${contagem[a]}</span>`
      ).join('')
    : '—';

  const linhas = lista.length
    ? lista.map((r) => `
        <tr>
          <td>${fmtData(r.data_registro)}</td>
          <td>${esc(nomeAluno(r.aluno_id))}</td>
          <td>${esc(nomeArea(r.area))}</td>
          <td>${esc(r.observacao)}</td>
          <td>${esc(r.profissional_nome || r.profissional_usuario_id || '—')}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;">Nenhum registro neste período.</td></tr>';

  const periodoTxt = inicio === fim ? fmtData(inicio) : `${fmtData(inicio)} a ${fmtData(fim)}`;

  saida.innerHTML = `
    <div id="relConteudo">
      <h3 style="color: var(--cor-primaria-escura); margin-bottom: var(--esp-2);">
        Relatório de Acompanhamento ${PERIODICIDADE[tipo]}
      </h3>
      <p style="margin: 0 0 4px;"><strong>Período:</strong> ${periodoTxt}</p>
      <p style="margin: 0 0 4px;"><strong>Aluno:</strong> ${alunoId ? esc(nomeAluno(alunoId)) : 'Todos os alunos'}</p>
      <p style="margin: 0 0 4px;"><strong>Total de registros:</strong> ${lista.length}</p>
      <p style="margin: 0 0 var(--esp-3);"><strong>Por área:</strong> ${resumo}</p>
      <div style="overflow-x:auto;">
        <table class="table">
          <thead>
            <tr><th>Data</th><th>Aluno</th><th>Área</th><th>Observação</th><th>Profissional</th></tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>`;

  relatorioAtual = { tipo, inicio, fim, alunoId, lista };

  $('btnImprimir').style.display = 'inline-flex';
  // Salvar no banco só faz sentido para um aluno específico (aluno_id é obrigatório)
  if (alunoId) $('btnSalvarRelatorio').style.display = 'inline-flex';
}

async function salvarRelatorioBanco() {
  if (!relatorioAtual || !relatorioAtual.alunoId || !usuarioAtual) return;

  const { tipo, inicio, fim, alunoId, lista } = relatorioAtual;

  const textoEvolucao = lista.length
    ? lista.map((r) => `${fmtData(r.data_registro)} — ${nomeArea(r.area)}: ${r.observacao}`).join('\n\n')
    : 'Nenhuma observação de evolução foi registrada neste período.';

  const botao = $('btnSalvarRelatorio');
  botao.disabled = true;

  try {
    await addDoc(collection(db, 'relatorios_pedagogicos'), {
      aluno_id: alunoId,
      tipo_relatorio: tipo,
      periodo_inicio: inicio,
      periodo_fim: fim,
      evolucao: textoEvolucao,
      dificuldades: null,
      avancos: null,
      encaminhamentos: null,
      usuario_responsavel_id: usuarioAtual.uid,
      profissional_nome: usuarioAtual.nome,
      quantidade_registros: lista.length,
      status: 'concluido',
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    });

    mostrarMensagem(`Relatório ${PERIODICIDADE[tipo].toLowerCase()} salvo no sistema.`, 'success');
  } catch (erro) {
    console.error('Erro ao salvar relatório:', erro);
    mostrarMensagem(
      `Não foi possível salvar o relatório (apenas Direção e Pedagogia podem). ${erro.message || ''}`,
      'error'
    );
  } finally {
    botao.disabled = false;
  }
}

function imprimirRelatorio() {
  const conteudo = $('relConteudo');
  if (!conteudo) return;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório de Acompanhamento — Fundação Toque</title>
    <style>
      body { font-family: Roboto, Arial, sans-serif; color: #2B2F26; padding: 24px; }
      h3 { color: #336B1B; border-bottom: 3px solid #4C8C2B; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #E6E0D2; padding: 8px; text-align: left; font-size: 13px; vertical-align: top; }
      th { background: #E9F3DF; color: #336B1B; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #E9F3DF; font-size: 12px; }
    </style></head><body>
    <h2>Fundação Toque</h2>${conteudo.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/* ---------- inicialização ---------- */

async function iniciarTela(uid) {
  try {
    usuarioAtual = await carregarUsuario(uid);
    await carregarAlunos();
    await carregarRegistros();

    $('regData').value = hojeISO();
    renderTimeline();
  } catch (erro) {
    console.error('Erro ao iniciar a tela de acompanhamento:', erro);
    $('timeline').innerHTML =
      '<p style="color: var(--cor-erro);">Não foi possível carregar os dados do Firestore.</p>';
    mostrarMensagem(erro.message || 'Erro ao carregar dados.', 'error');
  }
}

// Funções chamadas pelo HTML (onclick / onchange)
Object.assign(window, {
  renderTimeline,
  focarFormulario,
  abrirRelatorio,
  gerarRelatorio,
  salvarRelatorioBanco,
  imprimirRelatorio,
});

$('formRegistro').addEventListener('submit', salvarRegistro);

onAuthStateChanged(auth, (usuario) => {
  if (!usuario) {
    $('timeline').innerHTML =
      '<p style="color: var(--cor-erro);">Entre no sistema com uma conta Firebase para ver os registros.</p>';
    mostrarMensagem(
      'Você precisa entrar no sistema com uma conta Firebase para consultar ou salvar dados.',
      'error'
    );
    return;
  }

  iniciarTela(usuario.uid);
});