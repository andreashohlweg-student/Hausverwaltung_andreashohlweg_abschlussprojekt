## Oberflächentexte

- Sachliche Verwaltungsoberfläche entsprechend der Nutzervorlage umsetzen.
- Keine ungefragten Slogans, Werbetexte, Begrüßungen, dekorativen Untertitel oder übergroßen Überschriften ergänzen.
- Keine Projektphasen, Prototyp-/Demo-Labels oder Hinweise auf den technischen Aufbau in die GUI aufnehmen. Diese gehören in die Dokumentation.
- Seitentitel benennen die Funktion direkt, zum Beispiel „Dashboard“ oder „Mieter verwalten“.
- Sichtbarer Text muss eine konkrete Bedienfunktion erfüllen: Feldbeschriftung, Aktion, notwendige Hilfestellung, Status oder Fehlermeldung. Redundante Erklärtexte weglassen.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## UI Content Policy — Strict Separation of Development Context and User-Facing Content

**Core principle: Intent is not content.**

All project requirements, planning discussions, architectural decisions, implementation notes, explanations, developer instructions, and design considerations are strictly internal working information by default.

### Mandatory Rules

1. **Never expose internal development context in the UI.**
   Do not copy, paraphrase, summarize, reinterpret, or indirectly reference internal project information in visible interface text.

2. **Never generate unsolicited marketing or promotional content.**
   Do not invent slogans, promotional headlines, advertising copy, exaggerated descriptions, or claims about the application's quality, benefits, or capabilities.

3. **Requirements define behavior, not wording.**
   A functional requirement is an instruction to implement functionality. It is not permission to transform that requirement into user-facing descriptions, explanations, or promotional text.

4. **Only use explicitly approved user-facing content.**
   Text explicitly provided or designated for display may be used. Standard functional UI labels, such as "Save", "Cancel", "Login", or "Settings", may be generated when necessary for usability.

5. **Prefer neutral, functional language.**
   When UI text is required but no wording has been specified, use the shortest clear, factual description of the actual functionality. Do not embellish.

6. **Never fill empty UI space with invented content.**
   Do not generate welcome messages, introductory paragraphs, feature descriptions, onboarding explanations, or decorative headlines merely to make an interface appear more complete.

7. **Do not turn implementation details into user-facing features.**
   Technical architecture, development progress, planned improvements, internal terminology, and design rationale must remain invisible unless explicitly requested for the UI.

### Mandatory Validation

Before introducing any visible UI text, verify:

- Is this text explicitly intended for the end user?
- Is it necessary for understanding or operating the interface?
- Does it describe real, implemented functionality without embellishment?
- Does it avoid revealing, paraphrasing, or promoting internal development context?

If any condition fails, remove or replace the text with a neutral functional label, or omit it entirely.

**Default behavior: Implement the requested functionality, not a narrative about the functionality.**