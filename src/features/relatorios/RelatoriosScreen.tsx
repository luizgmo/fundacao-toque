import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { FileBarChart, FileText } from 'lucide-react'
import './RelatoriosScreen.css'

const PrestacaoContas = lazy(() =>
  import('./PrestacaoContas').then((module) => ({ default: module.PrestacaoContas }))
)

type RelatoriosTab = 'pedagogico' | 'prestacao'

const TAB_PARAM = 'aba'

function resolveInitialTab(isDirection: boolean): RelatoriosTab {
  const param = new URLSearchParams(window.location.search).get(TAB_PARAM)
  if (param === 'pedagogico') return 'pedagogico'
  if (param === 'prestacao' && isDirection) return 'prestacao'
  return isDirection ? 'prestacao' : 'pedagogico'
}

export function RelatoriosScreen({
  isDirection,
  pedagogicalContent,
}: {
  isDirection: boolean
  pedagogicalContent: ReactNode
}) {
  const [tab, setTab] = useState<RelatoriosTab>(() => resolveInitialTab(isDirection))
  const activeTab = isDirection ? tab : 'pedagogico'

  const selecionarTab = (next: RelatoriosTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'reports')
    url.searchParams.set(TAB_PARAM, next)
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="relatorios-screen">
      {isDirection && (
        <div className="relatorios-tabs-bar">
          <div
            aria-label="Tipos de relatório"
            className="relatorios-tabs"
            role="tablist"
          >
            <button
              aria-controls="relatorios-painel-prestacao"
              aria-selected={activeTab === 'prestacao'}
              className={'relatorios-tab' + (activeTab === 'prestacao' ? ' active' : '')}
              id="relatorios-tab-prestacao"
              onClick={() => selecionarTab('prestacao')}
              role="tab"
              type="button"
            >
              <span className="relatorios-tab-icon">
                <FileBarChart size={18} />
              </span>
              <span>
                <strong>Prestação de contas</strong>
                <small>Consolidado para financiadores</small>
              </span>
            </button>

            <button
              aria-controls="relatorios-painel-pedagogico"
              aria-selected={activeTab === 'pedagogico'}
              className={'relatorios-tab' + (activeTab === 'pedagogico' ? ' active' : '')}
              id="relatorios-tab-pedagogico"
              onClick={() => selecionarTab('pedagogico')}
              role="tab"
              type="button"
            >
              <span className="relatorios-tab-icon">
                <FileText size={18} />
              </span>
              <span>
                <strong>Pedagógico</strong>
                <small>Acompanhamento individual do aluno</small>
              </span>
            </button>
          </div>
        </div>
      )}

      <div
        aria-labelledby={
          isDirection ? `relatorios-tab-${activeTab}` : undefined
        }
        id={activeTab === 'prestacao' ? 'relatorios-painel-prestacao' : 'relatorios-painel-pedagogico'}
        role={isDirection ? 'tabpanel' : undefined}
      >
        {activeTab === 'prestacao' ? (
          <Suspense
            fallback={
              <div className="relatorios-loading page-container" role="status">
                Carregando prestação de contas...
              </div>
            }
          >
            <PrestacaoContas />
          </Suspense>
        ) : (
          pedagogicalContent
        )}
      </div>
    </div>
  )
}
