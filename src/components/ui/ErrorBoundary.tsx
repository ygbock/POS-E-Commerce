import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

const isDev = typeof window !== 'undefined' && ((import.meta as any).env?.DEV || (window as any).location?.hostname === 'localhost' || (window as any).location?.hostname === '127.0.0.1');

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public props: Props;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled SPA error caught by global boundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Application Exception Encountered
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Something went wrong while loading the application. Your work has not been intentionally discarded. Please reload the application and try again.
              </p>
            </div>

            {isDev && this.state.error && (
              <pre className="w-full bg-slate-50 dark:bg-slate-950 text-left p-4 rounded-xl text-xs font-mono overflow-auto max-h-40 border border-slate-200 dark:border-slate-800 text-rose-700 dark:text-rose-400 leading-normal select-text">
                {this.state.error.name}: {this.state.error.message}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            )}

            <Button
              variant="primary"
              onClick={this.handleReload}
              className="w-full"
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    // Access child components using this.props.children per framework rules
    return this.props.children;
  }
}
