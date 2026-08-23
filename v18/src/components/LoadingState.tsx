export function LoadingState({ message = "Loading field data…" }: { message?: string }) {
  return <div className="loading-state" role="status"><span className="loading-ring"/><strong>{message}</strong></div>;
}
