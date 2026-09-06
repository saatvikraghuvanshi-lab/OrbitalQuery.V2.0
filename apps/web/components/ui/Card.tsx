export function Card({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="oq-card">
      {(title || badge) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {title && (
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              {title}
            </h3>
          )}
          {badge}
        </header>
      )}
      {children}
    </section>
  );
}
