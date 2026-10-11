# Studio Personale JW

App web per programmare lo studio personale, approfondire argomenti, riflettere con obiettivi/domande/pratiche e prendere decisioni (priorità, pro/contro, conclusione), basandosi su articoli e video di [jw.org](https://www.jw.org/).

## Funzionalità

- **Argomenti**: elenco personale + ricerca live su jw.org con suggerimenti
- **Studio**: obiettivi, punti di riflessione, domande, pratiche, programma
- **Decisioni**: priorità ponderate, pro/contro, materiale jw.org, conclusione automatica dai dati
- **Assistente AI gratuito**: ricerca jw.org + elaborazione pensieri (Pollinations, con fallback locale)
- **Apertura in JW Library**: deep link `jwlibrary://` e link di condivisione `finder?srcid=jwlshare` per articoli e video
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

## Deploy su Vercel

Supabase **non è necessario**: argomenti, decisioni e chat restano nel browser (`localStorage`).

1. Crea un token su [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Dalla cartella del progetto:

```bash
npx vercel login
npx vercel --prod --yes
```

Oppure con token:

```bash
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```

Le route in `api/` fanno da proxy verso jw.org e l’AI gratuita (Pollinations).

