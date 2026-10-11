# Studio Personale JW

App web per programmare lo studio personale, approfondire argomenti, riflettere con obiettivi/domande/pratiche e prendere decisioni (priorità, pro/contro, conclusione), basandosi su articoli e video di [jw.org](https://www.jw.org/).

## Funzionalità

- **Argomenti**: elenco personale + ricerca live su jw.org con suggerimenti
- **Studio**: obiettivi, punti di riflessione, domande, pratiche, programma
- **Decisioni**: priorità ponderate, pro/contro, materiale jw.org, conclusione automatica dai dati
- **Assistente AI gratuito**: ricerca jw.org + elaborazione pensieri (Pollinations, con fallback locale)
- **Impostazioni**: colori, font, densità, hero, ordine sezioni, funzionalità on/off

I dati restano nel browser (`localStorage`). L’app non è affiliata a jw.org.

## Avvio

```bash
npm install
npm run dev
```

Produzione:

```bash
npm run build
npm start
```

Apri `http://localhost:5173` (dev) o `http://localhost:4173` (start).
