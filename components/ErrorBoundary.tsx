import React, { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-xl max-w-lg text-center border border-red-200 dark:border-red-900">
                <div className="text-5xl mb-4 text-red-500">
                    <i className="fas fa-bug"></i>
                </div>
                <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                <p className="mb-4 text-gray-600 dark:text-gray-400">
                    The application encountered an unexpected error and had to stop.
                </p>
                <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-left text-xs font-mono overflow-auto max-h-32 mb-6 border border-gray-300 dark:border-gray-700 select-all">
                    {this.state.error?.toString()}
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-indigo-500/30"
                >
                    <i className="fas fa-redo mr-2"></i> Reload Application
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}