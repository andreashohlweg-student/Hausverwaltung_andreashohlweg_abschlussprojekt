"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  damageText,
  invoiceTotals,
  nextDamageStatus,
  parseEuroCents,
  type DamageLanguage,
  type DamageStatus,
  type DamageSummary,
  type MessageChannel,
} from "@/lib/damage";

export function DamageLanguageSwitch({
  language,
}: {
  language: DamageLanguage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="language-switch" aria-label="Sprache / Language">
      {(["de", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          disabled={pending}
          aria-pressed={value === language}
          onClick={() => {
            document.cookie = `hausportal-language=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
            startTransition(() => router.refresh());
          }}
        >
          {value === "de" ? "Deutsch" : "English"}
        </button>
      ))}
    </div>
  );
}
async function sendRequest(
  path: string,
  method: string,
  body: unknown,
  fallback: string,
) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || fallback);
  return result;
}
export function NewDamageForm({ language }: { language: DamageLanguage }) {
  const t = damageText[language];
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const submittedBody = useRef<string | null>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const description = String(
      new FormData(event.currentTarget).get("description") ?? "",
    ).trim();
    if (!description) return;
    if (submittedBody.current !== description) {
      requestId.current = crypto.randomUUID();
      submittedBody.current = description;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await sendRequest(
        "/api/damages",
        "POST",
        { id: requestId.current, description, language },
        t.error,
      );
      router.push(`/portal/schaeden/${result.id}?created=1`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : t.error);
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <form className="damage-compose" onSubmit={submit}>
      <label className="field">
        <span>{t.description}</span>
        <textarea
          name="description"
          required
          maxLength={6000}
          rows={5}
          placeholder={t.placeholder}
          autoFocus
          disabled={saving}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={saving} type="submit">
        {saving ? t.sending : t.send}
      </button>
    </form>
  );
}
export function DamageMessageForm({
  id,
  channel,
  language,
}: {
  id: string;
  channel: MessageChannel;
  language: DamageLanguage;
}) {
  const t = damageText[language];
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const request = useRef<{ id: string; body: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    if (request.current?.body !== body)
      request.current = { id: crypto.randomUUID(), body };
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await sendRequest(
        `/api/damages/${id}/messages`,
        "POST",
        { ...request.current, channel },
        t.error,
      );
      form.reset();
      request.current = null;
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : t.error);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <form className="damage-compose" onSubmit={submit}>
      <label className="field">
        <span>{t.reply}</span>
        <textarea
          name="body"
          rows={3}
          required
          maxLength={6000}
          disabled={saving}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary" type="submit" disabled={saving}>
        {saving ? t.sending : t.sendMessage}
      </button>
    </form>
  );
}
export function DamageAdminForm({
  report,
  userId,
  today,
}: {
  report: DamageSummary;
  userId: string;
  today: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DamageStatus>(report.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [net, setNet] = useState("");
  const [tax, setTax] = useState(1900);
  const busy = useRef(false);
  const totals = invoiceTotals(parseEuroCents(net) ?? 0, tax);
  const next = nextDamageStatus(report.status);
  const isAssignee = report.assigneeId === userId;
  async function save(body: unknown) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await sendRequest(
        `/api/damages/${report.id}`,
        "PATCH",
        body,
        "Speichern fehlgeschlagen.",
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      action: "update",
      version: report.version,
      status,
      serviceOrdered: fields.get("serviceOrdered") === "on",
    };
    if (status === "invoiced" && report.status !== "invoiced") {
      const netCents = parseEuroCents(net);
      if (!netCents) {
        setError(
          "Bitte gib einen gültigen Nettobetrag ein, zum Beispiel 120,50.",
        );
        return;
      }
      body.invoice = {
        issuer: fields.get("issuer"),
        taxId: fields.get("taxId"),
        recipientAddress: fields.get("recipientAddress"),
        serviceDate: fields.get("serviceDate"),
        service: fields.get("service"),
        netCents,
        taxBasisPoints: tax,
        taxNote: fields.get("taxNote") ?? "",
        paymentDetails: fields.get("paymentDetails"),
      };
    }
    void save(body);
  }
  return (
    <section className="damage-panel">
      <h2>Bearbeitung</h2>
      <p>
        {report.assigneeName
          ? `Sachbearbeiter: ${report.assigneeName}`
          : "Noch nicht übernommen"}
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}{" "}
          <button
            className="button"
            type="button"
            onClick={() => router.refresh()}
          >
            Neu laden
          </button>
        </div>
      )}
      {!isAssignee && report.status !== "paid" && (
        <button
          className="button primary"
          disabled={saving}
          onClick={() =>
            void save({ action: "claim", version: report.version })
          }
        >
          {saving ? "Wird gespeichert …" : "Fall übernehmen"}
        </button>
      )}
      {isAssignee && report.status !== "paid" && (
        <form className="damage-compose" onSubmit={submit}>
          <label className="field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as DamageStatus)
              }
              disabled={saving}
            >
              <option value={report.status}>
                {damageText.de.statuses[report.status]}
              </option>
              {next && (
                <option value={next}>{damageText.de.statuses[next]}</option>
              )}
            </select>
          </label>
          <label className="damage-checkbox">
            <input
              name="serviceOrdered"
              type="checkbox"
              defaultChecked={report.serviceOrdered}
              disabled={saving}
            />
            Servicemitarbeiter beauftragt
          </label>
          {status === "invoiced" && report.status !== "invoiced" && (
            <fieldset className="invoice-fields" disabled={saving}>
              <legend>Rechnung erstellen</legend>
              <p>
                Empfänger: {report.ownerName ?? "Kein Eigentümer zugeordnet"}
              </p>
              <label className="field">
                <span>Rechnungssteller mit Anschrift *</span>
                <textarea name="issuer" required maxLength={600} rows={3} />
              </label>
              <label className="field">
                <span>Steuernummer / USt-IdNr. *</span>
                <input name="taxId" required maxLength={100} />
              </label>
              <label className="field">
                <span>Rechnungsanschrift des Eigentümers *</span>
                <textarea
                  name="recipientAddress"
                  required
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label className="field">
                <span>Leistungsdatum *</span>
                <input
                  name="serviceDate"
                  type="date"
                  required
                  max={today}
                  defaultValue={today}
                />
              </label>
              <label className="field">
                <span>Ausgeführte Leistung *</span>
                <textarea name="service" rows={3} required maxLength={2000} />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Nettobetrag in Euro *</span>
                  <input
                    name="net"
                    inputMode="decimal"
                    value={net}
                    onChange={(event) => setNet(event.target.value)}
                    placeholder="0,00"
                    required
                    maxLength={10}
                  />
                </label>
                <label className="field">
                  <span>Umsatzsteuer</span>
                  <select
                    value={tax}
                    onChange={(event) => setTax(Number(event.target.value))}
                  >
                    <option value={1900}>19 %</option>
                    <option value={700}>7 %</option>
                    <option value={0}>0 %</option>
                  </select>
                </label>
              </div>
              {tax === 0 && (
                <label className="field">
                  <span>Hinweis zur Steuerbefreiung *</span>
                  <textarea name="taxNote" required maxLength={500} rows={2} />
                </label>
              )}
              <p>
                Gesamtbetrag{" "}
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(totals.totalCents / 100)}
              </p>
              <label className="field">
                <span>Zahlungsangaben (optional)</span>
                <textarea name="paymentDetails" maxLength={600} rows={2} />
              </label>
            </fieldset>
          )}
          <button className="button primary" type="submit" disabled={saving}>
            {saving
              ? "Wird gespeichert …"
              : status === "invoiced" && report.status !== "invoiced"
                ? "Rechnung erstellen und abschließen"
                : "Änderungen speichern"}
          </button>
        </form>
      )}
    </section>
  );
}

export function DamageRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.activeElement?.closest("form")
      )
        router.refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
