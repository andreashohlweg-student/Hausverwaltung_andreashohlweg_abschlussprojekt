import Link from "next/link";
import type { AppUser } from "@/lib/account";
import {
  damageText,
  type DamageDetail,
  type DamageLanguage,
  type DamageMessage,
  type DamageSummary,
  type MessageChannel,
  type BuildingDamageFilter,
} from "@/lib/damage";
import {
  DamageAdminForm,
  DamageMessageForm,
  DamageOwnerForm,
} from "./damage-forms";
function date(value: string, language: DamageLanguage) {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function DamageMessageHistory({
  messages,
  language,
  role,
}: {
  messages: DamageMessage[];
  language: DamageLanguage;
  role: AppUser["role"];
}) {
  const authorRoles = damageText[language].messageAuthorRoles;
  return (
    <div className="damage-messages" aria-live="polite">
      {messages.map((message) => (
        <article
          className={`damage-message ${message.authorRole === role ? "own-message" : ""}`}
          key={message.id}
        >
          <div>
            <strong>
              {message.authorName} ({authorRoles[message.authorRole]})
            </strong>
            <time dateTime={message.createdAt}>
              {date(message.createdAt, language)}
            </time>
          </div>
          <p dir="auto">{message.body}</p>
        </article>
      ))}
    </div>
  );
}
export function DamageList({
  reports,
  language,
  admin = false,
  buildingContext,
}: {
  reports: DamageSummary[];
  language: DamageLanguage;
  admin?: boolean;
  buildingContext?: { id: string; filter: BuildingDamageFilter };
}) {
  const t = damageText[language];
  return (
    <div className="damage-list">
      {reports.length ? (
        reports.map((report) => {
          const caseHref = `${admin ? "/schaeden" : "/portal/schaeden"}/${report.id}${buildingContext ? `?gebaeude=${encodeURIComponent(buildingContext.id)}&filter=${buildingContext.filter}` : ""}`;
          return (
            <Link className="damage-list-card" key={report.id} href={caseHref}>
              <div className="damage-card-meta">
                <span className={`badge damage-status-${report.status}`}>
                  {t.statuses[report.status]}
                </span>
                <time dateTime={report.createdAt}>
                  {date(report.createdAt, language)}
                </time>
                {!!report.unreadCount && (
                  <span
                    className="damage-unread-count"
                    aria-label={
                      language === "de"
                        ? `${report.unreadCount} ungelesene Nachrichten`
                        : `${report.unreadCount} unread messages`
                    }
                  >
                    {report.unreadCount}
                  </span>
                )}
              </div>
              <h3>{report.location}</h3>
              <p>{report.description}</p>
              {admin && (
                <span className="cell-secondary">
                  {report.reporterName} ·{" "}
                  {report.assigneeName ?? "Nicht übernommen"} ·{" "}
                  {report.ownerName ?? "Ohne Eigentümer"}
                </span>
              )}
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
  owners = [],
}: {
  detail: DamageDetail;
  user: AppUser;
  language: DamageLanguage;
  created?: boolean;
  backHref?: string;
  owners?: { id: string; name: string }[];
}) {
  const t = damageText[language];
  const {
    report,
    messages,
    events,
    ownerAssignmentId,
    writableMessageChannels,
  } = detail;
  const admin = user.role === "admin";
  const owner = user.role === "owner";
  const backLabel = owner
    ? backHref
      ? t.backToBuildingReports
      : t.backToDashboard
    : t.back;
  const invoiceVisible = !!report.invoiceNumber && user.role !== "tenant";
  const channels: MessageChannel[] = ["tenant", "owner"];
  const ownerArchive = admin
    ? messages.filter(
        (message) =>
          message.channel === "owner" &&
          (message.ownerAssignmentId === null ||
            message.ownerAssignmentId !== ownerAssignmentId),
      )
    : [];
  const archivedAssignments = [
    ...detail.ownerAssignments
      .filter((assignment) => assignment.endedAt)
      .map((assignment) => ({ id: assignment.id, name: assignment.ownerName })),
    { id: null, name: "Frühere Nachrichten ohne Zuordnung" },
  ];
  return (
    <>
      <Link
        className="back-link"
        href={backHref ?? (admin ? "/schaeden" : "/portal")}
      >
        {backLabel}
      </Link>
      <div className="page-heading">
        <h1>{language === "de" ? "Schadensmeldung" : "Reported problem"}</h1>
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
          {channels.map((channel) => {
            const assignmentId = channel === "owner" ? ownerAssignmentId : null;
            const currentMessages = messages.filter(
              (message) =>
                message.channel === channel &&
                message.ownerAssignmentId === assignmentId &&
                (channel === "tenant" || assignmentId !== null),
            );
            const canWrite = writableMessageChannels.includes(channel);
            if (!canWrite && currentMessages.length === 0) return null;
            return (
              <section className="damage-panel" key={channel}>
                <h2>
                  {admin
                    ? channel === "tenant"
                      ? "Nachrichten mit dem Mieter"
                      : "Nachrichten mit dem Eigentümer"
                    : t.conversation}
                </h2>
                <DamageMessageHistory
                  messages={currentMessages}
                  language={language}
                  role={user.role}
                />
                {canWrite && (
                  <DamageMessageForm
                    key={assignmentId ?? channel}
                    id={report.id}
                    channel={channel}
                    language={language}
                    ownerAssignmentId={assignmentId ?? undefined}
                  />
                )}
              </section>
            );
          })}
          {ownerArchive.length > 0 &&
            archivedAssignments.map(({ id, name }) => {
              const history = ownerArchive.filter(
                (message) => message.ownerAssignmentId === id,
              );
              if (!history.length) return null;
              return (
                <section className="damage-panel" key={id ?? "legacy"}>
                  <h2>{id ? `Frühere Nachrichten mit ${name}` : name}</h2>
                  <DamageMessageHistory
                    messages={history}
                    language={language}
                    role={user.role}
                  />
                </section>
              );
            })}
        </div>
        <div className="damage-side">
          {admin && (
            <DamageOwnerForm
              key={`owner-${report.version}`}
              report={report}
              owners={owners}
            />
          )}
          {admin && (
            <DamageAdminForm
              key={report.version}
              report={report}
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
                  {admin && event.actorName && (
                    <span className="cell-secondary">{event.actorName}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
          {admin && detail.ownerAssignments.length > 0 && (
            <section className="damage-panel">
              <h2>Eigentümerhistorie</h2>
              <ol className="damage-timeline">
                {detail.ownerAssignments.map((assignment) => (
                  <li key={assignment.id}>
                    <strong>{assignment.ownerName}</strong>
                    <span className="cell-secondary">
                      {assignment.endedAt
                        ? "Ehemaliger Eigentümer des Falls"
                        : "Aktuell zugeordnet"}
                    </span>
                    <time dateTime={assignment.assignedAt}>
                      {date(assignment.assignedAt, language)}
                    </time>
                    {assignment.endedAt && (
                      <>
                        <time dateTime={assignment.endedAt}>
                          {date(assignment.endedAt, language)}
                        </time>
                        <span className="cell-secondary">
                          {
                            (
                              {
                                reassigned: "Neu zugeordnet",
                                unassigned: "Zuordnung aufgehoben",
                                building_owner_changed:
                                  "Gebäudeeigentümer geändert",
                                owner_removed: "Eigentümer entfernt",
                              } as const
                            )[assignment.endReason!]
                          }
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
