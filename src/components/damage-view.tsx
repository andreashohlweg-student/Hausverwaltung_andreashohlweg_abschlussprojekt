import Link from "next/link";
import type { AppUser } from "@/lib/account";
import {
  damageText,
  type DamageDetail,
  type DamageLanguage,
  type DamageSummary,
  type MessageChannel,
  type BuildingDamageFilter,
} from "@/lib/damage";
import { DamageAdminForm, DamageMessageForm } from "./damage-forms";
function date(value: string, language: DamageLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}
export function DamageList({
  reports,
  language,
  admin = false,
  owner = false,
  buildingContext,
}: {
  reports: DamageSummary[];
  language: DamageLanguage;
  admin?: boolean;
  owner?: boolean;
  buildingContext?: { id: string; filter: BuildingDamageFilter };
}) {
  const t = damageText[language];
  return (
    <div className="damage-list">
      {reports.length ? (
        reports.map((report) => {
          const caseHref = `${admin ? "/schaeden" : "/portal/schaeden"}/${report.id}${buildingContext ? `?gebaeude=${encodeURIComponent(buildingContext.id)}&filter=${buildingContext.filter}` : ""}`;
          const buildingHref =
            owner && report.propertyId
              ? `/portal/gebaeude/${encodeURIComponent(report.propertyId)}`
              : undefined;
          const content = (
            <>
              <div className="damage-card-meta">
                <span className={`badge damage-status-${report.status}`}>
                  {t.statuses[report.status]}
                </span>
                <time dateTime={report.createdAt}>
                  {date(report.createdAt, language)}
                </time>
              </div>
              <h3>
                {buildingHref ? (
                  <Link className="damage-building-link" href={buildingHref}>
                    {report.location}
                  </Link>
                ) : (
                  report.location
                )}
              </h3>
              <p>{report.description}</p>
              {admin && (
                <span className="cell-secondary">
                  {report.reporterName} ·{" "}
                  {report.assigneeName ?? "Nicht übernommen"}
                </span>
              )}
            </>
          );
          return buildingHref ? (
            <article
              className="damage-list-card owner-damage-card"
              key={report.id}
            >
              {content}
              <Link className="owner-damage-case-link" href={caseHref}>
                {language === "de" ? "Schadensmeldung öffnen" : "Open report"}
              </Link>
            </article>
          ) : (
            <Link className="damage-list-card" key={report.id} href={caseHref}>
              {content}
            </Link>
          );
        })
      ) : (
        <p className="damage-empty">{t.noReports}</p>
      )}
    </div>
  );
}
export function DamageView({
  detail,
  user,
  language,
  created = false,
  backHref,
}: {
  detail: DamageDetail;
  user: AppUser;
  language: DamageLanguage;
  created?: boolean;
  backHref?: string;
}) {
  const t = damageText[language];
  const { report, messages, events } = detail;
  const admin = user.role === "admin";
  const invoiceVisible = !!report.invoiceNumber && user.role !== "tenant";
  const ownerConversation =
    report.status === "invoiced" || report.status === "paid";
  const channels: MessageChannel[] = admin
    ? ownerConversation
      ? ["tenant", "owner"]
      : ["tenant"]
    : user.role === "tenant"
      ? ["tenant"]
      : ownerConversation
        ? ["owner"]
        : [];
  return (
    <>
      <Link
        className="back-link"
        href={backHref ?? (admin ? "/schaeden" : "/portal")}
      >
        {t.back}
      </Link>
      <div className="page-heading">
        <h1>{admin ? "Schadensmeldung" : t.reports}</h1>
      </div>
      {created && user.role === "tenant" && (
        <p className="success-notice" role="status">
          {t.saved}
        </p>
      )}
      <div className="damage-detail-grid">
        <div className="damage-main">
          <section className="damage-panel">
            <span className={`badge damage-status-${report.status}`}>
              {t.statuses[report.status]}
            </span>
            <h2>
              {user.role === "owner" && report.propertyId ? (
                <Link
                  className="damage-building-link"
                  href={`/portal/gebaeude/${encodeURIComponent(report.propertyId)}`}
                >
                  {report.location}
                </Link>
              ) : (
                report.location
              )}
            </h2>
            <p className="damage-description" dir="auto">
              {report.description}
            </p>
            {invoiceVisible && (
              <a
                className="button primary"
                href={`/api/damages/${report.id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.invoice} · {report.invoiceNumber}
              </a>
            )}
          </section>
          {channels.map((channel) => (
            <section className="damage-panel" key={channel}>
              <h2>
                {admin
                  ? channel === "tenant"
                    ? "Nachrichten mit dem Mieter"
                    : "Rückfragen zur Rechnung"
                  : t.conversation}
              </h2>
              <div className="damage-messages" aria-live="polite">
                {messages
                  .filter((message) => message.channel === channel)
                  .map((message) => (
                    <article
                      className={`damage-message ${message.authorRole === user.role ? "own-message" : ""}`}
                      key={message.id}
                    >
                      <div>
                        <strong>
                          {message.authorRole === "admin"
                            ? t.administration
                            : message.authorName}
                        </strong>
                        <time dateTime={message.createdAt}>
                          {date(message.createdAt, language)}
                        </time>
                      </div>
                      <p dir="auto">{message.body}</p>
                    </article>
                  ))}
              </div>
              <DamageMessageForm
                id={report.id}
                channel={channel}
                language={language}
              />
            </section>
          ))}
        </div>
        <div className="damage-side">
          {admin && (
            <DamageAdminForm
              key={report.version}
              report={report}
              userId={user.id}
              today={new Intl.DateTimeFormat("sv-SE", {
                timeZone: "Europe/Berlin",
              }).format(new Date())}
            />
          )}
          <section className="damage-panel">
            <h2>{t.history}</h2>
            <ol className="damage-timeline">
              {events.map((event, index) => (
                <li key={index}>
                  <strong>{t.statuses[event.status]}</strong>
                  <time dateTime={event.createdAt}>
                    {date(event.createdAt, language)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
