export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state-box" role="status">
      <span className="oq-spinner" style={{ marginRight: 8, verticalAlign: "-2px" }} />
      {label}
    </div>
  );
}

export function ErrorState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="state-box error">
      <strong>Something went wrong.</strong>
      <div style={{ marginTop: 4 }}>{message}</div>
      {hint && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{hint}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-box">{message}</div>;
}

export function WarningState({ message }: { message: string }) {
  return <div className="state-box warning">{message}</div>;
}
