import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Rótulo exibido na tela de erro (ajuda a saber qual parte caiu). */
  label?: string;
  /** Chamado quando um erro é capturado — útil para log/telemetria. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Fronteira de erro.
 *
 * Sem isto, qualquer exceção em um componente (uma foto com `undefined`, um
 * timestamp malformado do Firestore) derruba a loja INTEIRA e o cliente vê
 * uma tela branca — perde a venda e não sabe o que aconteceu.
 *
 * Com isto, a falha fica contida, a pessoa recebe uma explicação em
 * português e um botão para tentar de novo sem recarregar o aparelho.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nunca jogamos o erro na cara do usuário; só no console, para diagnóstico.
    try {
      this.props.onError?.(error, info);
    } catch {
      /* o próprio handler falhou — não podemos falhar de novo aqui */
    }
    if (import.meta.env.DEV) {
      console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
    }
  }

  private handleReload = (): void => {
    // Limpa o estado e tenta de novo; se falhar outra vez, recarrega a página.
    if (this.state.error) {
      const attempts = Number(sessionStorage.getItem('chelly:boundary-retries') || '0');
      if (attempts >= 2) {
        window.location.reload();
        return;
      }
      sessionStorage.setItem('chelly:boundary-retries', String(attempts + 1));
    }
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-light text-4xl"
          aria-hidden="true"
        >
          💔
        </div>
        <h1 className="text-2xl font-black italic text-slate md:text-3xl">Algo saiu do brilho</h1>
        <p className="max-w-sm text-sm leading-relaxed text-slate-soft">
          {this.props.label
            ? `Não conseguimos exibir "${this.props.label}" agora.`
            : 'Não conseguimos exibir esta parte da loja agora.'}{' '}
          Sua sacola e seus favoritos continuam salvos.
        </p>
        <button type="button" onClick={this.handleReload} className="btn-primary mt-2">
          Tentar novamente
        </button>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-full overflow-auto rounded-xl bg-slate-pale p-4 text-left text-[0.65rem] text-slate-mid">
            {this.state.error.message}
          </pre>
        )}
      </div>
    );
  }
}
