"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <button
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error();
            router.replace("/anmelden");
            router.refresh();
          } catch {
            setError("Abmelden fehlgeschlagen.");
            setPending(false);
          }
        }}
      >
        {pending ? "Wird abgemeldet …" : "Abmelden"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (result.error) {
        setError("E-Mail-Adresse oder Passwort ist falsch.");
        setPending(false);
        return;
      }
      const membership = await fetch("/api/me", { cache: "no-store" });
      if (!membership.ok) {
        await authClient.signOut();
        setError("Für dieses Konto besteht kein aktiver Hausportal-Zugang.");
        setPending(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Anmelden fehlgeschlagen. Bitte versuche es erneut.");
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-form">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span>E-Mail-Adresse</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          maxLength={254}
        />
      </label>
      <label className="field">
        <span>Passwort</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={128}
        />
      </label>
      <button className="button primary" disabled={pending}>
        {pending ? "Wird angemeldet …" : "Anmelden"}
      </button>
      <Link className="auth-link" href="/passwort-vergessen">
        Passwort vergessen?
      </Link>
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmation"))
      return setError("Die Passwörter stimmen nicht überein.");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.get("password") }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Aktivierung fehlgeschlagen.");
      router.replace(result.redirectTo);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Aktivierung fehlgeschlagen.",
      );
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="auth-form">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span>Passwort</span>
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="password-rule"
        />
      </label>
      <p id="password-rule" className="field-hint">
        Mindestens 12 Zeichen.
      </p>
      <label className="field">
        <span>Passwort wiederholen</span>
        <input
          name="confirmation"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
        />
      </label>
      <button className="button primary" disabled={pending}>
        {pending ? "Wird aktiviert …" : "Zugang aktivieren"}
      </button>
    </form>
  );
}

export function PasswordResetForm({ token }: { token?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = token
        ? await authClient.resetPassword({
            token,
            newPassword: String(data.get("password")),
          })
        : await authClient.requestPasswordReset({
            email: String(data.get("email")).trim(),
            redirectTo: new URL(
              "/passwort-zuruecksetzen",
              window.location.origin,
            ).href,
          });
      if (result.error) throw new Error();
      setDone(true);
    } catch {
      setError("Die Anfrage konnte nicht verarbeitet werden.");
    } finally {
      setPending(false);
    }
  }
  if (done)
    return (
      <div>
        <p role="status">
          {token
            ? "Passwort geändert."
            : "Falls ein Konto besteht, wurde ein Link zum Zurücksetzen versendet."}
        </p>
        <Link className="button" href="/anmelden">
          Zur Anmeldung
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="auth-form">
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {token ? (
        <label className="field">
          <span>Neues Passwort</span>
          <input
            type="password"
            name="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
      ) : (
        <label className="field">
          <span>E-Mail-Adresse</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            maxLength={254}
          />
        </label>
      )}
      <button className="button primary" disabled={pending}>
        {pending
          ? "Wird verarbeitet …"
          : token
            ? "Passwort speichern"
            : "Link anfordern"}
      </button>
      <Link className="auth-link" href="/anmelden">
        Zur Anmeldung
      </Link>
    </form>
  );
}
