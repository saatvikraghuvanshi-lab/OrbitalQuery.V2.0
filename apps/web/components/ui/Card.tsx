export function Card({
  title,
  badge,
  variant = "section",
  children,
}: {
  title?: string;
  badge?: React.ReactNode;
  /** "section": editorial block under a hairline rule. "boxed": compact bordered card (reserved for emphasized content). */
  variant?: "section" | "boxed";
  children: React.ReactNode;
}) {
  return (
    <section className={variant === "boxed" ? "oq-card--boxed" : "oq-card"}>
      {(title || badge) && (
        <header className="side-label">
          {title && <h3>{title}</h3>}
          {badge}
        </header>
      )}
      {children}
    </section>
  );
}
