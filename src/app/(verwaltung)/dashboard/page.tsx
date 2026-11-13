import Link from "next/link";
import { Dashboard } from "@/components/dashboard";
import { DamageRefresh } from "@/components/damage-forms";
import { Icon } from "@/components/icon";
import { damageText } from "@/lib/damage";
import { requireAdmin } from "@/lib/server/access";
import { listDamages } from "@/lib/server/damages";

export const metadata = { title: "Dashboard" };
export default async function Page() {
  const user = await requireAdmin();
  const reports = await listDamages(user, {
    statuses: ["created", "in_progress"],
  });
  reports.sort(
    (a, b) => Number(b.status === "created") - Number(a.status === "created"),
  );

  return (
    <>
      <DamageRefresh />
      <Dashboard
        damageCard={
          <div className="assignment-card assignment-card-damages">
            <Link className="assignment-card-header" href="/schaeden">
              <span className="assignment-icon">
                <Icon name="info" size={22} />
              </span>
              <div className="assignment-content">
                <h3>Schadensmeldungen</h3>
              </div>
              <span
                className={`assignment-count ${reports.length === 0 ? "complete" : ""}`}
              >
                {reports.length}
              </span>
              <Icon className="assignment-arrow" name="arrow" size={19} />
            </Link>
            {reports.length > 0 ? (
              <ul className="assignment-damage-list">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      className="assignment-damage-link"
                      href={`/schaeden/${report.id}`}
                    >
                      <strong>{report.location}</strong>
                      <span className="assignment-damage-description">
                        {report.description}
                      </span>
                      <span className={`badge damage-status-${report.status}`}>
                        {damageText.de.statuses[report.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cell-secondary">Keine offenen Schadensmeldungen.</p>
            )}
          </div>
        }
      />
    </>
  );
}
