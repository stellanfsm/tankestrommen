## Hva er endret?

<!-- Kort oppsummering av endringen. Ved større PR: punktliste eller lenke til issue. -->

## Hvorfor?

<!-- Motivasjon, kontekst, lenke til issue/ADR. -->

## Hvordan er det testet?

<!-- Enhetstester, manuell kjøring, fixtures, lokale kommandoer. -->

- [ ] Automatiske tester kjørt lokalt (beskriv hvilke)
- [ ] Annen verifikasjon (beskriv)

## CI-status

<!-- Lim inn kort status etter push, eller skriv «Grønn på siste commit» / lenke til workflow-run. -->

- [ ] Relevante GitHub Actions / CI er grønne (eller forklar unntak)

## Risiko

<!-- Regresjon, ytelse, bakoverkompatibilitet, feature flags, rollback. -->

- [ ] Risiko vurdert (beskriv kort; «lav» er ok)

## Personvern / secrets-sjekk

- [ ] Ingen hemmeligheter, tokens eller persondata committet (`.env`, nøkler, logger)
- [ ] `.env.example` oppdatert ved nye miljøvariabler (hvis aktuelt)
- [ ] Ingen unødvendig logging av sensitiv data

## Manuell sjekk før merge

<!-- Det reviewer eller forfatter må gjøre utenom CI. -->

- [ ] Manuelt verifisert (beskriv hva)

---

## Tankestrømmen (kun hvis analyse, scorers, fixtures eller modellvalg er berørt)

<!-- Slett hele blokken eller kryss av «ikke aktuelt» hvis PR-en ikke rører Tankestrømmen. -->

- [ ] **Ikke aktuelt** for denne PR-en
- [ ] `npm run eval:tankestrom:dry` (eller tilsvarende) kjørt der det gir mening
- [ ] Live-/Braintrust-eval vurdert eller kjørt der endringen krever det (beskriv resultat eller lenke til eksperiment)
- [ ] Fixtures / forventet output oppdatert i tråd med endringen

## Foreldre-app UI / Tankestrøm-import (kun hvis E2E er relevant)

<!-- Slett blokken eller kryss «ikke aktuelt». -->

- [ ] **Ikke aktuelt** for denne PR-en
- [ ] Playwright- eller annen E2E-suite kjørt / planlagt før merge (beskriv)
