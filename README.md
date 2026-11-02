# Hausportal

Hausverwaltung mit Next.js App Router, TypeScript, Neon Postgres, Neon Auth und einer Neon Function für Einladungen. Das Frontend wird auf Vercel betrieben. Docker Compose bleibt für die lokale Entwicklung erhalten.

## Anmeldung und Einladungen

- Administratoren verwalten Eigentümer, Mieter, Objekte und Mitarbeiter.
- Beim Anlegen eines Eigentümers oder Mieters werden zunächst der Kontakt und eine Einladung gespeichert. Der Empfänger erhält einen Link und setzt sein Passwort selbst. Erst dann entstehen die Neon-Auth-Identität und der Benutzer mit der zugehörigen Rolle.
- Einladungslinks gelten sieben Tage, sind einmal verwendbar und werden nur als SHA-256-Hash gespeichert. Erneutes Einladen widerruft den vorherigen Link.
- Eigentümer sehen im Portal ausschließlich ihre Objekte. Mieter sehen ihr zugeordnetes Objekt und ihre Wohnungsbezeichnung. Die API prüft Rollen unabhängig von der Navigation.
- Mitarbeiterrollen sind beschreibende Verwaltungsdaten; Mitarbeiter erhalten in diesem Schritt keinen eigenen Login.
- Ein fehlgeschlagener Mailversand wird angezeigt. Der Kontakt bleibt gespeichert; die Einladung lässt sich aus der Liste erneut senden.
- Abmelden und Passwort-Rücksetzung sind vorhanden. Passwort-Rücksetzungen laufen über den Maildienst von Neon Auth, Einladungen über Gmail-SMTP.

Der erste Administrator wird per CLI eingeladen:

```bash
npm run admin:invite
```

Das Skript verwendet `BOOTSTRAP_ADMIN_EMAIL`, erstellt kein Passwort und verweigert die Bootstrap-Einladung, sobald ein aktiver Administrator besteht.

## Lokale Entwicklung

Voraussetzungen: Node.js ab 22.18 (empfohlen 24), ein eingerichtetes Neon-Projekt und die privaten Variablen in `.env.local`. `.env.example` beschreibt die erforderlichen Namen. Geheimnisse gehören weder ins Repository noch in `NEXT_PUBLIC_*`-Variablen.

```bash
npm ci
npm run db:migrate
npm run dev
```

Alternativ mit laufendem Docker Desktop:

```bash
docker compose up --build
```

Die Anwendung läuft unter `http://localhost:3000`. Ohne Anmeldung öffnet sich die Anmeldeseite. Die Daten liegen in der konfigurierten Neon-Datenbank, auch beim lokalen Start. Für unabhängige Entwicklung einen eigenen Neon-Branch und dessen Umgebungsvariablen verwenden. Alte Browserdaten unter `hausportal:database:v1` werden nicht automatisch in Neon importiert oder gelöscht. Mockdaten sind nur noch Testfixtures.

`docker compose up` startet `next dev` mit eingebundenem Quellcode und Fast Refresh. Änderungen werden über die Entwicklungsverbindung an den Browser gemeldet; ein Browserneustart ist nicht erforderlich. Nach geänderten Abhängigkeiten:

```bash
docker compose exec web npm ci
docker compose restart web
```

Produktionsmodus ohne Hot Reload:

```bash
docker compose -f compose.production.yaml up --build
```

Er liest `.env.local` erst beim Containerstart ein. Der Build benötigt keine privaten Umgebungsvariablen. Entwicklungs- und Produktionsmodus verwenden denselben lokalen Port und dürfen nicht gleichzeitig laufen.

## Architektur

| Bereich                | Aufgabe                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `src/app/(verwaltung)` | Geschützte Admin-Routen; Server Components prüfen den Zugang und laden Daten. |
| `src/app/portal`       | Serverseitig gefilterte Ansicht für Eigentümer und Mieter.                    |
| `src/app/api`          | Validierte Schreibzugriffe, Session- und Rollenprüfung, Einladungen.          |
| `src/components`       | Interaktive Formulare, Suche, Navigation, Dialoge und Clientzustand.          |
| `src/lib/domain.ts`    | Fachliche Datentypen, Zuordnungen und Löschfolgen.                            |
| `src/lib/server`       | Serverseitige Datenbank- und Zugriffslogik.                                   |
| `db/migrations`        | Versionierte SQL-Migrationen im Schema `hausportal`.                          |
| `hello.ts`             | Neon Function: authentifizierter Einladungsversand über SMTP.                 |
| `neon.ts`              | Deklaration von Neon Auth und Function-Konfiguration.                         |

Der Clientzustand wird vom Server initialisiert und über `/api/data` gespeichert. Änderungen laufen transaktional; eine Revision verhindert das Überschreiben neuerer Datenstände. Postgres-Verbindungen verwenden `pg` mit begrenztem Pool, auf Vercel mit `attachDatabasePool`. Migrationen nutzen die direkte Datenbankverbindung. Auth-Cookies verwaltet das Neon-SDK. Der Next.js-Server ruft die Function mit einem privaten gemeinsamen Geheimnis auf; dieses gelangt nicht in den Browser.

Das Dashboard enthält Schnellaktionen und anklickbare Zuordnungskacheln. Routen: `/dashboard`, `/eigentuemer`, `/mieter`, `/objekte`, `/mitarbeiter`; jeweils Listen und Formularseiten. Die Eigentümerauswahl zeigt zuerst alphabetisch Eigentümer ohne Objekt mit „(offen)“, danach die übrigen.

## Gmail-SMTP

Für dieses Abschlussprojekt werden Einladungen über ein Gmail-Konto versendet. Eine eigene Absenderdomain ist dafür nicht erforderlich. Der Absender entspricht immer `SMTP_USER`.

1. Im verwendeten Google-Konto die Zwei-Faktor-Anmeldung aktivieren.
2. Unter [Google App-Passwörter](https://myaccount.google.com/apppasswords) ein eigenes App-Passwort für „Hausportal“ erstellen. Google kann diese Möglichkeit bei bestimmten Kontotypen oder Schutzprogrammen einschränken.
3. In der privaten `.env.local` hinterlegen:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=dein-konto@gmail.com
SMTP_PASS=DEIN_GOOGLE_APP_PASSWORT
```

Das normale Google-Passwort nicht verwenden. Bei einem anderen Absender `SMTP_USER` entsprechend ändern. Zugangsdaten nie in den Chat oder ins Repository kopieren. Das App-Passwort muss nach ausdrücklicher Freigabe auch als private Variable der Neon Function hinterlegt werden; Vercel benötigt es nicht.

```bash
npm run smtp:check
```

Die Prüfung stellt die TLS-Verbindung her und prüft die Anmeldung, ohne eine Mail zu senden. Anschließend die Function deployen und `npm run admin:invite` für die erste tatsächliche Einladung ausführen. Erst eine erfolgreiche SMTP-Prüfung und ein tatsächlicher Versand belegen die funktionierende Gmail-Anbindung. Ein erfolgreicher Build allein reicht dafür nicht.

Port 465 verwendet direkt TLS; alternativ ist Port 587 mit zwingendem STARTTLS möglich. Zertifikate werden geprüft. Gmail ist für kleine Test-/Projektmengen geeignet; Google kann Versand begrenzen oder Serveranmeldungen blockieren. Für größere Produktivmengen später einen SMTP-Dienst einsetzen. Passwort-Rücksetzungen bleiben beim Maildienst von Neon Auth.

- [Google: Mit App-Passwörtern anmelden](https://support.google.com/mail/answer/185833?hl=de)
- [Nodemailer: Gmail](https://nodemailer.com/guides/using-gmail)

## Neon und Vercel

Neon-Projekt und Produktionsbranch sind über `.neon` lokal verknüpft. Die Datei wird nicht versioniert. Neue Einrichtung:

```bash
neon init -y --org-id ORG_ID --project-id PROJECT_ID --branch production --services postgres,auth,functions
neon deploy --branch production --env .env.local
npm run db:migrate
```

`neon deploy` stellt die Services aus `neon.ts` bereit und zieht die Service-Variablen in die lokale Env-Datei. Bei Testbranches `--no-env-pull` verwenden, damit die Produktionskonfiguration nicht überschrieben wird. Produktions-App-URL als vertrauenswürdige Domain in Neon Auth eintragen.

Vercel benötigt `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_FUNCTION_HELLO_BASE_URL`, `FUNCTION_ORIGIN_SECRET` und `APP_URL`. Die SMTP-Zugangsdaten werden für den laufenden Einladungsdienst nur bei Neon Functions benötigt. Lokale CLI-Skripte verwenden sie aus `.env.local`. `APP_URL` muss auf die öffentlich erreichbare App zeigen, bevor Einladungen versendet werden.

Migrationen werden bewusst separat ausgeführt, statt bei jedem Frontend-Build. Vorschau-Deployments erhalten nicht automatisch die Produktionsgeheimnisse oder einen eigenen Datenbankbranch.

## Prüfungen

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Der Integrationstest verwendet echte isolierte Neon-Services und zufällig erzeugte Testkonten. Er verweigert den Start außerhalb eines Branches mit dem Präfix `hausportal-check-`. Niemals Produktionsvariablen dafür verwenden. Die Test-App muss mit denselben Branch-Variablen auf Port 3002 laufen, anschließend:

```bash
node --env-file=/ABSOLUTER/PFAD/test.env scripts/test-e2e.mjs
```

Geprüft werden Registrierung aller drei Rollen, Sessions, wiederholte Anmeldung, Rechte und Datentrennung, abgelaufene/verwendete Links, Datenbankspeicherung, Revisionskonflikte sowie App → Function → Datenbank und SMTP-Versand. Für den Versandtest muss `E2E_MAIL_TO` ausdrücklich auf ein eigenes Testpostfach gesetzt werden; der Test versendet eine echte Einladung dorthin. Ohne diese Variable verweigert er den Start. Den isolierten Testbranch nach Abschluss löschen.

## Weitere fachliche Schritte

Wohnungen sind noch keine eigenständigen Datensätze: Die Anzahl der Einheiten ist eine Objektangabe, die Wohnungsbezeichnung beim Mieter Freitext. Belegungskontrolle, mehrere Eigentümer pro Objekt, Verträge, Abrechnung und Dokumente folgen in eigenen Schritten. Das hier ist ein Einladungs-/Registrierungsablauf; kostenpflichtige Abonnements oder Zahlungsabwicklung sind nicht enthalten.
