import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong. Please try refreshing the page.";
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            errorMessage = `Database Error: ${parsed.error}. This usually happens when permissions are missing or the connection is unstable.`;
          }
        }
      } catch (e) {
        // Not a JSON error message, use default or raw message
        if (this.state.error?.message) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="flex justify-center">
              <div className="p-4 bg-red-500/10 rounded-full">
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Oops! An error occurred</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
            >
              <RefreshCcw className="w-4 h-4" />
              Refresh Application
            </button>
            
            {isFirestoreError && (
              <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">
                Technical details logged to console
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
