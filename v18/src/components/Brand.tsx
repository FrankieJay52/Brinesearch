export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="BrineSearch">
      <span className="brand-mark" aria-hidden="true"><span>B</span></span>
      {!compact && <span className="brand-copy"><strong>BrineSearch</strong><small>FIELD INTELLIGENCE</small></span>}
    </div>
  );
}
