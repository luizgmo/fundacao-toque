import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import type { UserProfile } from '../../types/auth'
import type { PrestacaoContasFiltros } from '../../types/relatorios'
import type {
  RelatorioGerado,
  StatusRelatorioGerado,
} from '../../types/relatoriosGerados'
import { formatDateBR } from '../../lib/reportBuilder'
import { isDemoModeEnabled } from '../../lib/demoMode'
import { gerarEBaixarPdfPrestacaoContas } from '../../lib/prestacaoContasExport'
import type { ExportadorRelatorio } from '../../lib/prestacaoContasExport'
import { loadPrestacaoContasData } from '../../services/prestacaoContasService'
import { listarRelatoriosGerados } from '../../services/relatoriosGeradosService'
import { subscribeToUsuarios } from '../../services/usuariosService'

type Props = {
  exportador: ExportadorRelatorio
  refreshKey: number
  onRegerarPrevia: (filtros: PrestacaoContasFiltros) => Promise<boolean>
}

type Acao = {
  id: string
  tipo: 'previa' | 'pdf'
}

const STATUS_INFO: Record<StatusRelatorioGerado, { label: string; className: string }> = {
  processando: { label: 'Processando', className: 'is-processando' },
  concluido: { label: 'Concluído', className: 'is-concluido' },
  falhou: { label: 'Falhou', className: 'is-falhou' },
}

function formatarDataHora(value: string | null): string {
  if (!value) return 'Data não registrada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não registrada'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function HistoricoRelatoriosGerados({
  exportador,
  refreshKey,
  onRegerarPrevia,
}: Props) {
  const demo = isDemoModeEnabled()
  const [registros, setRegistros] = useState<RelatorioGerado[]>([])
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [progresso, setProgresso] = useState('')
  const [acao, setAcao] = useState<Acao | null>(null)
  const [versaoLocal, setVersaoLocal] = useState(0)

  useEffect(() => {
    if (demo) return
    return subscribeToUsuarios(setUsuarios, () => setUsuarios([]))
  }, [demo])

  useEffect(() => {
    let vivo = true
    listarRelatoriosGerados()
      .then((lista) => {
        if (!vivo) return
        setRegistros(lista)
        setErro('')
      })
      .catch((error: unknown) => {
        if (!vivo) return
        setErro(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o histórico de relatórios.'
        )
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [refreshKey, versaoLocal])

  const atualizar = () => {
    setCarregando(true)
    setErroAcao('')
    setMensagem('')
    setVersaoLocal((atual) => atual + 1)
  }

  const nomeGerador = (uid: string): string => {
    if (!uid) return 'Não identificado'
    if (demo) return 'Modo demonstração'
    if (uid === exportador.id && exportador.nome) return exportador.nome
    return (
      usuarios.find((usuario) => usuario.uid === uid)?.nome_completo ||
      `Usuário ${uid.slice(0, 6)}`
    )
  }

  const regenerarPrevia = async (registro: RelatorioGerado) => {
    if (!registro.filtros) return
    setAcao({ id: registro.id, tipo: 'previa' })
    setErroAcao('')
    setMensagem('')
    try {
      const ok = await onRegerarPrevia(registro.filtros)
      if (ok) {
        setMensagem(
          'Prévia regerada com os filtros registrados. Confira os dados atuais e exporte novamente.'
        )
      } else {
        setErroAcao('Não foi possível regerar a prévia com os filtros deste registro.')
      }
    } finally {
      setAcao(null)
    }
  }

  const baixarPdf = async (registro: RelatorioGerado) => {
    if (!registro.filtros) return
    setAcao({ id: registro.id, tipo: 'pdf' })
    setErroAcao('')
    setMensagem('')
    setProgresso('')
    try {
      const dados = await loadPrestacaoContasData(registro.filtros)
      const pdf = await gerarEBaixarPdfPrestacaoContas(dados, exportador, {
        onProgress: (item) => setProgresso(item.mensagem),
      })
      setMensagem(
        pdf.fotosComErro > 0
          ? `PDF regerado e baixado. ${pdf.fotosComErro} foto(s) não puderam ser incorporadas. O novo download foi registrado.`
          : 'PDF regerado e baixado. O arquivo não é armazenado; o novo download foi registrado.'
      )
      setVersaoLocal((atual) => atual + 1)
    } catch (error) {
      setErroAcao(
        error instanceof Error
          ? error.message
          : 'Não foi possível regerar o PDF deste registro.'
      )
      setVersaoLocal((atual) => atual + 1)
    } finally {
      setAcao(null)
      setProgresso('')
    }
  }

  const ocupado = Boolean(acao)

  return (
    <section className="prestacao-historico section-card">
      <div className="prestacao-historico-head">
        <div>
          <span className="prestacao-historico-icon">
            <History size={20} />
          </span>
          <div>
            <h3>Histórico de exportações</h3>
            <p>
              Registra filtros, período, estado, usuário e data de cada geração. O PDF não é
              armazenado: use a regeneração para baixar novamente com os dados atuais.
            </p>
          </div>
        </div>
        <button
          className="button secondary"
          disabled={carregando || ocupado}
          onClick={atualizar}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {erro && (
        <div className="prestacao-historico-alerta" role="alert">
          <AlertTriangle size={17} /> <span>{erro}</span>
        </div>
      )}
      {erroAcao && (
        <div className="prestacao-historico-alerta" role="alert">
          <AlertTriangle size={17} /> <span>{erroAcao}</span>
        </div>
      )}
      {mensagem && (
        <p className="prestacao-historico-mensagem" role="status">
          {mensagem}
        </p>
      )}
      {progresso && (
        <p className="prestacao-historico-progresso" role="status">
          <Loader2 className="spin" size={15} /> {progresso}
        </p>
      )}

      {carregando ? (
        <p className="prestacao-historico-vazio">
          <Loader2 className="spin" size={17} /> Carregando histórico...
        </p>
      ) : registros.length === 0 ? (
        <p className="prestacao-historico-vazio">
          Nenhuma exportação registrada. Ao baixar o PDF ou imprimir, o registro aparece aqui.
        </p>
      ) : (
        <ul className="prestacao-historico-lista">
          {registros.map((registro) => {
            const status = STATUS_INFO[registro.status]
            const acaoAtual = acao?.id === registro.id ? acao.tipo : null
            return (
              <li className="prestacao-historico-item" key={registro.id}>
                <div className="prestacao-historico-dados">
                  <strong>
                    {formatDateBR(registro.periodoInicio)} a{' '}
                    {formatDateBR(registro.periodoFim)}
                  </strong>
                  <span>
                    {registro.filtros
                      ? `Tipo: ${registro.filtros.tipo} · Turmas: ${
                          registro.filtros.turmaIds.length || 'todas'
                        } · Fotos: ${registro.filtros.incluirFotos ? 'sim' : 'não'}`
                      : 'Filtros não disponíveis neste registro.'}
                  </span>
                  <small>
                    Gerado por {nomeGerador(registro.geradoPor)} em{' '}
                    {formatarDataHora(registro.geradoEm)}
                  </small>
                </div>
                <span className={`prestacao-historico-status ${status.className}`}>
                  {registro.status === 'concluido' ? (
                    <CheckCircle2 size={14} />
                  ) : registro.status === 'falhou' ? (
                    <AlertTriangle size={14} />
                  ) : (
                    <Clock size={14} />
                  )}
                  {status.label}
                </span>
                <div className="prestacao-historico-acoes">
                  <button
                    className="button secondary"
                    disabled={!registro.filtros || ocupado}
                    onClick={() => void regenerarPrevia(registro)}
                    type="button"
                  >
                    {acaoAtual === 'previa' ? (
                      <Loader2 className="spin" size={15} />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                    Regerar prévia
                  </button>
                  {registro.status !== 'processando' && (
                    <button
                      className="button primary"
                      disabled={!registro.filtros || ocupado}
                      onClick={() => void baixarPdf(registro)}
                      type="button"
                    >
                      {acaoAtual === 'pdf' ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Download size={15} />
                      )}
                      Baixar PDF
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
