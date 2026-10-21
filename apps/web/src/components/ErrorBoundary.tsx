import { Component, type ErrorInfo, type ReactNode } from "react";

/** Shows what went wrong instead of a blank screen if any part of the UI throws while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Open EFB UI error", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center p-8">
        <div className="max-w-2xl">
          <h1 className="font-instrument text-3xl font-semibold">404 Going Around!</h1>
          <p className="mt-2 text-lg text-muted">The screen could not be drawn. Reload the page. If it keeps happening, report this message:</p>
          <pre className="mt-4 overflow-auto rounded-lg border border-line bg-panel p-4 text-sm">{this.state.error.message}</pre>
          <button onClick={() => location.reload()} className="mt-4 min-h-12 rounded-lg bg-teal px-6 text-lg font-semibold text-on-teal">Reload</button>
        </div>
      </div>
    );
  }
}