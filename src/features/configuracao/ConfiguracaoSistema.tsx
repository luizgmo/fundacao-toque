import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Save, ShieldAlert, User } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { obterLimiteFaltas, salvarLimiteFaltasConsecutivas, LIMITE_FALTAS_PADRAO } from '../../services/configuracaoService'
import { useQuery } from '../../lib/useSubscription'
import { LoadError } from '../../components/LoadError'
import { describePersistenceError } from '../../lib/persistence'

export function ConfiguracaoSistema() {
  const { userProfile } = useAuth()
  const papel = userProfile?.papel
  const isDirecao = papel === 'direcao'

  // Hooks devem ser chamados incondicionalmente, antes de qualquer retorno antecipado.
  const configuracaoQuery = useQuery<{ valor: number; fonte: 'configurado' | 'padrao' }>(
    () => obterLimiteFaltas(),
    { valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' },
  )

  const limite = configuracaoQuery.status === 'ready' ? configuracaoQuery.data.valor : LIMITE_FALTAS_PADRAO
  const fonte = configuracaoQuery.status === 'ready' ? configuracaoQuery.data.fonte : 'padrao'

  const [valor, setValor] = useState<string>(String(limite))
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isDirecao) {
    return (
      <div className="page-container">
        <div className="form-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <ShieldAlert size={32} style={{ color: '#991b1b', marginBottom: '0.5rem' }} />
          <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Acesso Restrito</h3>
          <p style={{ color: '#4b5563', marginBottom: '1rem' }}>
            Esta seção é exclusiva para o perfil de Direção.
          </p>
          <button className="button primary" type="button">Voltar ao Dashboard</button>
        </div>
      </div>
    )
  }

  if (configuracaoQuery.status === 'error') {
    return (
      <div className="page-container">
        <LoadError
          error={configuracaoQuery.error}
          onRetry={configuracaoQuery.retry}
          what="o limite de faltas configurado pela Fundação"
        />
      </div>
    )
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    const numerico = Number(valor)
    if (!Number.isInteger(numerico) || numerico < 0 || numerico > 365) {
      setErrorMsg('Informe um número inteiro entre 0 e 365.')
      return
    }

    if (!userProfile?.uid) {
      setErrorMsg('Perfil do usuário não está disponível.')
      return
    }

    setSubmitting(true)
    try {
      await salvarLimiteFaltasConsecutivas(numerico, userProfile.uid)
      setValor(String(numerico))
      setSuccessMsg('Limite de faltas atualizado. Os alertas passam a usar o novo valor imediatamente.')
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setErrorMsg(`Não foi possível salvar o limite: ${describePersistenceError(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-container">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Configurações do sistema</span>
          <h2>Limite de faltas consecutivas</h2>
          <p>
            Quantas faltas consecutivas acionam o alerta à equipe e ao
            contato com a família. Alterar este valor modifica os alertas
            em todo o sistema sem precisar alterar código.
          </p>
        </div>
      </div>

      <div className="form-card">
        <div className="form-card-heading">
          <User size={20} style={{ marginRight: '0.5rem' }} />
          <h3>Configurar limite</h3>
        </div>

        <label className="field">
          <span>Limite de faltas consecutivas</span>
          <input
            min="0"
            max="365"
            onChange={(e) => setValor(e.target.value.replace(/[^0-9]/g, ''))}
            type="number"
            value={valor}
          />
          <span>
            {fonte === 'configurado' ? 'Valor configurado pela Fundação' : 'Valor padrão (ainda não configurado)'}
          </span>
        </label>

        <p style={{ marginTop: '8px', fontSize: '0.85rem', color: '#4b5563' }}>
          Regra aplicada: apenas o status <strong>ausente</strong> incrementa a
          sequência; <strong>presente</strong> e{' '}
          <strong>justificado</strong> interrompem a sequência. Cada sequência
          é calculada por turma ou por oficina, sem misturar sessões de
          contextos diferentes.
        </p>

        {errorMsg && (
          <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'start', gap: '8px' }}>
            <AlertTriangle size={16} style={{ marginTop: '2px' }} />
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#14532d', fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'start', gap: '8px' }}>
            <CheckCircle2 size={16} style={{ marginTop: '2px' }} />
            {successMsg}
          </div>
        )}

        <button
          className="button primary"
          disabled={submitting || !userProfile}
          onClick={handleSave}
          type="button"
        >
          <Save size={18} /> {submitting ? 'Salvando…' : 'Salvar limite'}
        </button>
      </div>
    </div>
  )
}
