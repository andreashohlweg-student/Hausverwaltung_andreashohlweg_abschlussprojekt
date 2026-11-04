import Link from "next/link";
import type { AppUser } from "@/lib/account";
import {
  damageText,
  type DamageDetail,
  type DamageLanguage,
  type DamageSummary,
  type MessageChannel,
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
}: {
  reports: DamageSummary[];
  language: DamageLanguage;
  admin?: boolean;
}) {
  const t = damageText[language];
  return (
    <div className="damage-list">
      {reports.length ? (
        reports.map((report) => (
          <Link
            className="damage-list-card"
            key={report.id}
            href={`${admin ? "/schaeden" : "/portal/schaeden"}/${report.id}`}
          >
            <div className="damage-card-meta">
              <span className={`badge damage-status-${report.status}`}>
                {t.statuses[report.status]}
              </span>
              <time dateTime={report.createdAt}>
                {date(report.createdAt, language)}
              </time>
            </div>
            <h3>{report.location}</h3>
            <p>{report.description}</p>
            {admin && (
              <span className="cell-secondary">
                {report.reporterName} ·{" "}
                {report.assigneeName ?? "Nicht übernommen"}
              </span>
            )}
          </Link>
        ))
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
}: {
  detail: DamageDetail;
  user: AppUser;
  language: DamageLanguage;
  created?: boolean;
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
      <Link className="back-link" href={admin ? "/schaeden" : "/portal"}>
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
            <h2>{report.location}</h2>
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
