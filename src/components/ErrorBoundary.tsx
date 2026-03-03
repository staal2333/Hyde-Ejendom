"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #070b1a 0%, #0f1629 50%, #0a0e1f 100%)" }}
        >
          <div className="absolute inset-0 gradient-mesh-animated opacity-50" style={{ filter: "blur(80px)" }} />
          <div className="relative z-10 max-w-md w-full rounded-2xl p-8 text-center glass-frost animate-scale-in"
            style={{ boxShadow: "0 20px 60px -12px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.1)" }}
          >
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-5 border border-red-500/20">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Noget gik galt</h2>
            <p className="text-sm text-white/50 mb-4 font-light">
              Applikationen stødte på en uventet fejl.
            </p>
            {this.state.error && (
              <pre className="text-[11px] text-red-300/80 bg-red-500/10 rounded-xl p-3 mb-5 text-left overflow-auto max-h-32 border border-red-500/15 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn-primary btn-md"
            >
              Genindlæs siden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
