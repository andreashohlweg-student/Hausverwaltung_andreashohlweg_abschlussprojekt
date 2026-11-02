import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <span className="eyebrow">404</span>
      <h1>Seite nicht gefunden</h1>
      <p>Diese Ansicht gibt es im Hausportal nicht.</p>
      <Link className="button primary" href="/dashboard">
        Zum Dashboard
      </Link>
    </div>
  );
}
