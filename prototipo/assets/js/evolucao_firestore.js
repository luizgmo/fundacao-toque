/*
 * Integração da tela de detalhe do aluno com o Cloud Firestore.
 */

import { db, auth } from "../../../src/lib/firebase.ts";

import { onAuthStateChanged } from 'firebase/auth';

import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

const $ = (id) => document.getElementById(id);

let usuarioAtual = null;
let alunoAtual = null;
let registrosEvolucao = [];
let relatorios = [];

// Evita inserir HTML não confiável nos registros.
function escaparTexto(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dataHojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

function dataParaExibicao(data) {
  if (!data) return '—';

  const partes = String(data).split('-');

  return partes.length === 3
    ? `${partes[2]}/${partes[1]}/${partes[0]}`
    : data;
}

function nomeArea(area) {
  const nomes = {
    cognitiva: 'Cognitiva',
    motora: 'Motora',
    social: 'Social',
    comunicacao: 'Comunicação',
    autonomia: 'Autonomia',
    outra: 'Outra',
  };

  return nomes[area] || area || 'Não informada';
}

function mostrarMensagem(mensagem, tipo = 'success') {
  if (typeof window.showToast === 'function') {
    window.showToast(mensagem, tipo);
  } else {
    window.alert(mensagem);
  }
}

function obterNomeAlunoNaTela() {
  return document
    .querySelector('.student-header-info h1')
    ?.textContent?.trim() || '';
}

// Localiza o aluno usando o ID da URL ou o nome exibido.
async function localizarAluno() {
  const parametros = new URLSearchParams(window.location.search);

  const idInformado =
    parametros.get('id') || document.body.dataset.alunoId;

  if (idInformado) {
    const referencia = doc(db, 'alunos', idInformado);
    const resultado = await getDoc(referencia);

    if (resultado.exists()) {
      return {
        id: resultado.id,
        ...resultado.data(),
      };
    }

    throw new Error(
      `Não encontrei o aluno com ID ${idInformado} na coleção alunos.`
    );
  }

  const nome = obterNomeAlunoNaTela();

  if (!nome) {
    throw new Error(
      'Não foi possível identificar o aluno nesta página.'
    );
  }

  const consulta = query(
    collection(db, 'alunos'),
    where('nome_completo', '==', nome)
  );

  const resultado = await getDocs(consulta);

  if (resultado.empty) {
    throw new Error(
      `O aluno "${nome}" não foi encontrado no Firestore. ` +
      'Abra esta página com ?id=ID_DO_ALUNO ou confira o nome do cadastro.'
    );
  }

  const primeiro = resultado.docs[0];

  return {
    id: primeiro.id,
    ...primeiro.data(),
  };
}

// Carrega o profissional autenticado.
async function carregarUsuario(uid) {
  const resultado = await getDoc(doc(db, 'usuarios', uid));

  const dados = resultado.exists()
    ? resultado.data()
    : {};

  const nome =
    dados.nome_completo ||
    auth.currentUser?.displayName ||
    auth.currentUser?.email ||
    'Profissional autenticado';

  const campoEvolucao = $('profissionalEvolucao');
  const campoRelatorio = $('profissionalRelatorio');

  if (campoEvolucao) campoEvolucao.value = nome;
  if (campoRelatorio) campoRelatorio.value = nome;

  const nomeTopo = $('userName');
  const papelTopo = $('userRole');

  if (nomeTopo) nomeTopo.textContent = nome;
  if (papelTopo && dados.papel) {
    papelTopo.textContent = dados.papel;
  }

  return {
    uid,
    nome,
    papel: dados.papel || null,
  };
}

// Busca as evoluções que pertencem ao aluno.
async function carregarEvolucoes() {
  if (!alunoAtual) return;

  const consulta = query(
    collection(db, 'registros_evolucao'),
    where('aluno_id', '==', alunoAtual.id)
  );

  const resultado = await getDocs(consulta);

  registrosEvolucao = resultado.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));

  registrosEvolucao.sort((a, b) =>
    String(b.data_registro || '').localeCompare(
      String(a.data_registro || '')
    )
  );

  renderizarEvolucoes();
}

// Exibe o histórico de evoluções na página.
function renderizarEvolucoes() {
  const lista = $('listaEvolucoes');

  if (!lista) return;

  if (!registrosEvolucao.length) {
    lista.innerHTML =
      '<p class="text-muted">' +
      'Nenhuma observação registrada para este aluno.' +
      '</p>';

    return;
  }

  lista.innerHTML = registrosEvolucao.map((registro) => `
    <article class="card"
      style="background: var(--cor-fundo); margin-bottom: var(--esp-3);">

      <h4 style="margin-bottom: var(--esp-2);">
        ${escaparTexto(nomeArea(registro.area))}
      </h4>

      <p style="font-size: var(--tamanho-label); margin: 4px 0;">
        <strong>
          ${escaparTexto(dataParaExibicao(registro.data_registro))}
        </strong>
        —
        ${escaparTexto(
          registro.profissional_nome ||
          registro.profissional_usuario_id ||
          'Profissional não informado'
        )}
      </p>

      <p style="white-space: pre-wrap;">
        ${escaparTexto(registro.observacao)}
      </p>

    </article>
  `).join('');
}

// Salva uma nova observação no Firestore.
async function salvarEvolucao() {
  const data = $('dataEvolucao')?.value;
  const area = $('areaEvolucao')?.value;
  const observacao = $('descricaoEvolucao')?.value?.trim();

  if (!alunoAtual || !usuarioAtual) {
    return mostrarMensagem(
      'Aluno ou profissional não identificado.',
      'error'
    );
  }

  if (!data || !area || !observacao) {
    return mostrarMensagem(
      'Preencha data, área avaliada e descrição.',
      'error'
    );
  }

  const botao = $('btnSalvarEvolucao');

  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Salvando...';
  }

  try {
    await addDoc(collection(db, 'registros_evolucao'), {
      aluno_id: alunoAtual.id,
      data_registro: data,
      profissional_usuario_id: usuarioAtual.uid,
      profissional_nome: usuarioAtual.nome,
      area,
      observacao,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    });

    if ($('descricaoEvolucao')) {
      $('descricaoEvolucao').value = '';
    }

    if ($('dataEvolucao')) {
      $('dataEvolucao').value = dataHojeISO();
    }

    if (typeof window.closeModal === 'function') {
      window.closeModal('modalEvolucao');
    }

    await carregarEvolucoes();

    mostrarMensagem(
      'Observação salva no Firestore.',
      'success'
    );
  } catch (erro) {
    console.error('Erro ao salvar evolução:', erro);

    mostrarMensagem(
      'Não foi possível salvar. Verifique o login e as regras ' +
      `do Firestore. ${erro.message || ''}`,
      'error'
    );
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = 'Salvar';
    }
  }
}

// Calcula o intervalo de datas de cada relatório.
function calcularPeriodo(tipo, dataReferencia) {
  const [ano, mes] = dataReferencia.split('-').map(Number);

  if (tipo === 'diario') {
    return {
      inicio: dataReferencia,
      fim: dataReferencia,
    };
  }

  if (tipo === 'semestral') {
    return mes <= 6
      ? {
          inicio: `${ano}-01-01`,
          fim: `${ano}-06-30`,
        }
      : {
          inicio: `${ano}-07-01`,
          fim: `${ano}-12-31`,
        };
  }

  return {
    inicio: `${ano}-01-01`,
    fim: `${ano}-12-31`,
  };
}

function textoTipoRelatorio(tipo) {
  return {
    diario: 'Diário',
    semestral: 'Semestral',
    anual: 'Anual',
  }[tipo] || tipo;
}

// Gera e salva o relatório pedagógico.
async function salvarRelatorio() {
  const tipo = $('tipoRelatorio')?.value;
  const dataReferencia = $('dataReferenciaRelatorio')?.value;

  if (!alunoAtual || !usuarioAtual) {
    return mostrarMensagem(
      'Aluno ou profissional não identificado.',
      'error'
    );
  }

  if (!tipo || !dataReferencia) {
    return mostrarMensagem(
      'Selecione o tipo e a data de referência do relatório.',
      'error'
    );
  }

  const { inicio, fim } = calcularPeriodo(
    tipo,
    dataReferencia
  );

  const observacoes = registrosEvolucao.filter((registro) => {
    const data = String(registro.data_registro || '');

    return data >= inicio && data <= fim;
  });

  const textoEvolucao = observacoes.length
    ? observacoes.map((registro) =>
        `${dataParaExibicao(registro.data_registro)} — ` +
        `${nomeArea(registro.area)}: ${registro.observacao}`
      ).join('\n\n')
    : 'Nenhuma observação de evolução foi registrada neste período.';

  const dificuldades =
    $('dificuldadesRelatorio')?.value?.trim() || null;

  const avancos =
    $('avancosRelatorio')?.value?.trim() || null;

  const encaminhamentos =
    $('encaminhamentosRelatorio')?.value?.trim() || null;

  const botao = $('btnGerarRelatorio');

  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Gerando...';
  }

  try {
    await addDoc(collection(db, 'relatorios_pedagogicos'), {
      aluno_id: alunoAtual.id,
      tipo_relatorio: tipo,
      periodo_inicio: inicio,
      periodo_fim: fim,
      evolucao: textoEvolucao,
      dificuldades,
      avancos,
      encaminhamentos,
      usuario_responsavel_id: usuarioAtual.uid,
      profissional_nome: usuarioAtual.nome,
      quantidade_registros: observacoes.length,
      status: 'concluido',
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    });

    if (typeof window.closeModal === 'function') {
      window.closeModal('modalRelatorio');
    }

    await carregarRelatorios();

    mostrarMensagem(
      `${textoTipoRelatorio(tipo)} gerado e salvo no Firestore.`,
      'success'
    );
  } catch (erro) {
    console.error('Erro ao gerar relatório:', erro);

    mostrarMensagem(
      'Não foi possível gerar o relatório. Verifique o login e ' +
      `as regras do Firestore. ${erro.message || ''}`,
      'error'
    );
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = 'Gerar relatório';
    }
  }
}

// Carrega os relatórios que já foram salvos para o aluno.
async function carregarRelatorios() {
  if (!alunoAtual) return;

  const consulta = query(
    collection(db, 'relatorios_pedagogicos'),
    where('aluno_id', '==', alunoAtual.id)
  );

  const resultado = await getDocs(consulta);

  relatorios = resultado.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));

  relatorios.sort((a, b) =>
    String(b.periodo_fim || '').localeCompare(
      String(a.periodo_fim || '')
    )
  );

  renderizarRelatorios();
}

// Mostra os relatórios na página.
function renderizarRelatorios() {
  const lista = $('listaRelatorios');

  if (!lista) return;

  if (!relatorios.length) {
    lista.innerHTML =
      '<p class="text-muted">' +
      'Nenhum relatório salvo para este aluno.' +
      '</p>';

    return;
  }

  lista.innerHTML = relatorios.map((relatorio) => `
    <article class="timeline-item">

      <div class="timeline-date">
        ${escaparTexto(textoTipoRelatorio(relatorio.tipo_relatorio))}
        —
        ${escaparTexto(dataParaExibicao(relatorio.periodo_inicio))}
        a
        ${escaparTexto(dataParaExibicao(relatorio.periodo_fim))}
      </div>

      <div class="card" style="background: var(--cor-fundo);">

        <p>
          <strong>Profissional:</strong>
          ${escaparTexto(
            relatorio.profissional_nome ||
            relatorio.usuario_responsavel_id ||
            'Não informado'
          )}
        </p>

        <p>
          <strong>Registros incluídos:</strong>
          ${Number(relatorio.quantidade_registros || 0)}
        </p>

        <p><strong>Evolução:</strong></p>

        <p style="white-space: pre-wrap;">
          ${escaparTexto(relatorio.evolucao || 'Sem descrição.')}
        </p>

        ${relatorio.dificuldades ? `
          <p>
            <strong>Dificuldades:</strong>
            ${escaparTexto(relatorio.dificuldades)}
          </p>
        ` : ''}

        ${relatorio.avancos ? `
          <p>
            <strong>Avanços:</strong>
            ${escaparTexto(relatorio.avancos)}
          </p>
        ` : ''}

        ${relatorio.encaminhamentos ? `
          <p>
            <strong>Encaminhamentos:</strong>
            ${escaparTexto(relatorio.encaminhamentos)}
          </p>
        ` : ''}

        <button
          class="btn btn-outline btn-sm"
          type="button"
          onclick="window.print()">
          <i class="fa-solid fa-print"></i>
          Imprimir relatório
        </button>

      </div>
    </article>
  `).join('');
}

// Inicializa a tela depois do login.
async function iniciarTela(uid) {
  try {
    usuarioAtual = await carregarUsuario(uid);
    alunoAtual = await localizarAluno();

    const dataHoje = dataHojeISO();

    if ($('dataEvolucao') && !$('dataEvolucao').value) {
      $('dataEvolucao').value = dataHoje;
    }

    if (
      $('dataReferenciaRelatorio') &&
      !$('dataReferenciaRelatorio').value
    ) {
      $('dataReferenciaRelatorio').value = dataHoje;
    }

    await Promise.all([
      carregarEvolucoes(),
      carregarRelatorios(),
    ]);
  } catch (erro) {
    console.error('Erro ao iniciar tela de evolução:', erro);

    mostrarMensagem(
      erro.message || 'Erro ao carregar dados do aluno.',
      'error'
    );
  }
}

// Liga os botões às funções.
const botaoSalvarEvolucao = $('btnSalvarEvolucao');

if (botaoSalvarEvolucao) {
  botaoSalvarEvolucao.addEventListener('click', salvarEvolucao);
}

const botaoGerarRelatorio = $('btnGerarRelatorio');

if (botaoGerarRelatorio) {
  botaoGerarRelatorio.addEventListener('click', salvarRelatorio);
}

// Observa o estado de autenticação do Firebase.
onAuthStateChanged(auth, (usuario) => {
  if (!usuario) {
    mostrarMensagem(
      'Você precisa entrar no sistema com uma conta Firebase ' +
      'para consultar ou salvar dados.',
      'error'
    );

    return;
  }

  iniciarTela(usuario.uid);
});