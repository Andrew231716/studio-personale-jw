import { askAi } from './ai'
import {
  BIBLE_BOOKS,
  bibleCode,
  bibleOpenUrl,
  bookOpenUrl,
  extractBibleCode,
  parseScriptureLabel,
} from './bibleRefs'
import { searchJw, searchJwDeep } from './jwApi'
import { uid } from './id'
import type {
  BibleReadingKind,
  BibleReadingPlan,
  BibleScriptureRef,
  JwResult,
  StudyResource,
} from '../types'

export interface BibleCatalogEntry {
  label: string
  query: string
  blurb: string
  /** Riferimenti tipici (etichetta + codice bible= o libro) */
  scriptures?: Array<{ label: string; bible: string }>
}

export const BIBLE_KIND_LABELS: Record<BibleReadingKind, string> = {
  personaggio: 'Personaggi',
  racconto: 'Racconti',
  libro: 'Libri',
  tema: 'Temi',
}

function s(label: string, book: number, chapter: number, verse = 1) {
  return { label, bible: bibleCode(book, chapter, verse) }
}

export const BIBLE_READING_SUGGESTIONS: Record<BibleReadingKind, BibleCatalogEntry[]> = {
  personaggio: [
    { label: 'Adamo ed Eva', query: 'Adamo Eva Genesi', blurb: 'La creazione dell’uomo, la disubbidienza e la promessa in Genesi 3:15.', scriptures: [s('Genesi 1:26-28', 1, 1, 26), s('Genesi 3:1-15', 1, 3, 1)] },
    { label: 'Noè', query: 'Noè diluvio fede', blurb: 'Uomo giusto che obbedì e salvò la famiglia attraverso l’arca.', scriptures: [s('Genesi 6:9-22', 1, 6, 9), s('Ebrei 11:7', 58, 11, 7)] },
    { label: 'Abramo', query: 'Abramo fede Bibbia', blurb: 'Padre di tutti quelli che hanno fede; lasciò Ur e confidò nelle promesse di Geova.', scriptures: [s('Genesi 12:1-9', 1, 12, 1), s('Genesi 22:1-18', 1, 22, 1), s('Ebrei 11:8-19', 58, 11, 8)] },
    { label: 'Sara', query: 'Sara Abramo Bibbia', blurb: 'Moglie di Abramo, esempio di fede e rispetto.', scriptures: [s('Genesi 18:9-15', 1, 18, 9), s('1 Pietro 3:5-6', 60, 3, 5)] },
    { label: 'Isacco', query: 'Isacco Bibbia', blurb: 'Figlio della promessa; Geova preparò una moglie e rinnovò l’alleanza.', scriptures: [s('Genesi 22:1-14', 1, 22, 1), s('Genesi 24:1-67', 1, 24, 1)] },
    { label: 'Giacobbe', query: 'Giacobbe Israele Bibbia', blurb: 'Diventò Israele; dalle sue dodici tribù nacque la nazione.', scriptures: [s('Genesi 28:10-22', 1, 28, 10), s('Genesi 32:22-32', 1, 32, 22)] },
    { label: 'Giuseppe', query: 'Giuseppe figlio di Giacobbe', blurb: 'Integrità in Egitto, perdono ai fratelli e fiducia in Geova.', scriptures: [s('Genesi 37:1-36', 1, 37, 1), s('Genesi 39:1-23', 1, 39, 1), s('Genesi 45:1-15', 1, 45, 1)] },
    { label: 'Mosè', query: 'Mosè Esodo', blurb: 'Liberatore d’Israele, mediatore della Legge, uomo umile.', scriptures: [s('Esodo 3:1-15', 2, 3, 1), s('Esodo 14:1-31', 2, 14, 1), s('Numeri 12:3', 4, 12, 3)] },
    { label: 'Aronne', query: 'Aronne sommo sacerdote', blurb: 'Primo sommo sacerdote; lezioni su obbedienza e ruolo sacerdotale.', scriptures: [s('Esodo 28:1-3', 2, 28, 1), s('Levitico 8:1-13', 3, 8, 1)] },
    { label: 'Giosuè', query: 'Giosuè conquista Canaan', blurb: 'Coraggio e obbedienza: «Sii forte e risoluto».', scriptures: [s('Giosuè 1:1-9', 6, 1, 1), s('Giosuè 6:1-27', 6, 6, 1)] },
    { label: 'Debora', query: 'Debora profetessa', blurb: 'Profetessa e giudice che diede gloria a Geova.', scriptures: [s('Giudici 4:1-24', 7, 4, 1), s('Giudici 5:1-31', 7, 5, 1)] },
    { label: 'Gedeone', query: 'Gedeone Giudici', blurb: 'Da timoroso a guerriero fedele con pochi uomini.', scriptures: [s('Giudici 6:11-40', 7, 6, 11), s('Giudici 7:1-25', 7, 7, 1)] },
    { label: 'Rut', query: 'Rut lealtà', blurb: 'Lealtà verso Geova e verso Naomi; antenata di Davide.', scriptures: [s('Rut 1:16-17', 8, 1, 16), s('Rut 2:1-23', 8, 2, 1), s('Rut 4:13-22', 8, 4, 13)] },
    { label: 'Samuele', query: 'Samuele profeta', blurb: 'Ascoltò Geova da ragazzo e giudicò Israele con integrità.', scriptures: [s('1 Samuele 3:1-21', 9, 3, 1), s('1 Samuele 12:1-25', 9, 12, 1)] },
    { label: 'Saul', query: 'Saul re Israele', blurb: 'Primo re: lezioni su ubbidienza incompleta e orgoglio.', scriptures: [s('1 Samuele 9:1-27', 9, 9, 1), s('1 Samuele 15:1-35', 9, 15, 1)] },
    { label: 'Davide', query: 'Davide re Israele', blurb: 'Uomo secondo il cuore di Geova: fede, pentimento e regno.', scriptures: [s('1 Samuele 17:1-58', 9, 17, 1), s('2 Samuele 7:1-17', 10, 7, 1), s('Salmi 51:1-19', 19, 51, 1)] },
    { label: 'Gionatan', query: 'Gionatan Davide amicizia', blurb: 'Amicizia leale e fede in Geova nonostante Saul.', scriptures: [s('1 Samuele 18:1-4', 9, 18, 1), s('1 Samuele 20:1-42', 9, 20, 1)] },
    { label: 'Salomone', query: 'Salomone saggezza', blurb: 'Chiese saggezza; costruì il tempio; poi lezioni da non ripetere.', scriptures: [s('1 Re 3:5-14', 11, 3, 5), s('1 Re 8:22-61', 11, 8, 22), s('Ecclesiaste 12:13-14', 21, 12, 13)] },
    { label: 'Elia', query: 'Elia profeta', blurb: 'Zelo per Geova sul Carmelo e cura di Geova nella depressione.', scriptures: [s('1 Re 18:20-40', 11, 18, 20), s('1 Re 19:1-18', 11, 19, 1)] },
    { label: 'Eliseo', query: 'Eliseo profeta', blurb: 'Successore di Elia; miracoli e compassione.', scriptures: [s('2 Re 2:1-15', 12, 2, 1), s('2 Re 5:1-19', 12, 5, 1)] },
    { label: 'Giosia', query: 'Giosia re riforma', blurb: 'Re giovane che restaurò la vera adorazione.', scriptures: [s('2 Re 22:1-20', 12, 22, 1), s('2 Re 23:1-25', 12, 23, 1)] },
    { label: 'Ester', query: 'Ester coraggio', blurb: 'Coraggio per salvare il popolo: «Se perisco, perisco».', scriptures: [s('Ester 4:13-17', 17, 4, 13), s('Ester 7:1-10', 17, 7, 1)] },
    { label: 'Giobbe', query: 'Giobbe integrità', blurb: 'Integrità sotto prova e fiducia in Geova.', scriptures: [s('Giobbe 1:1-22', 18, 1, 1), s('Giobbe 42:1-17', 18, 42, 1)] },
    { label: 'Isaia', query: 'Isaia profeta', blurb: 'Messaggio di giudizio e speranza messianica.', scriptures: [s('Isaia 6:1-13', 23, 6, 1), s('Isaia 53:1-12', 23, 53, 1)] },
    { label: 'Geremia', query: 'Geremia profeta', blurb: 'Profeta coraggioso nonostante l’opposizione.', scriptures: [s('Geremia 1:4-19', 24, 1, 4), s('Geremia 20:7-13', 24, 20, 7)] },
    { label: 'Daniele', query: 'Daniele integrità', blurb: 'Integrità a Babilonia; visioni del Regno.', scriptures: [s('Daniele 1:1-21', 27, 1, 1), s('Daniele 6:1-28', 27, 6, 1)] },
    { label: 'Sadràch, Mesàch, Abednego', query: 'tre ebrei forno ardente', blurb: 'Rifiutarono di adorare l’immagine; Geova li liberò.', scriptures: [s('Daniele 3:1-30', 27, 3, 1)] },
    { label: 'Giona', query: 'Giona Ninive', blurb: 'Misericordia di Geova e lezioni sull’atteggiamento.', scriptures: [s('Giona 1:1-17', 32, 1, 1), s('Giona 3:1-10', 32, 3, 1), s('Giona 4:1-11', 32, 4, 1)] },
    { label: 'Maria', query: 'Maria madre di Gesù', blurb: 'Umiltà e fede: «Eccomi, la schiava di Geova».', scriptures: [s('Luca 1:26-56', 42, 1, 26), s('Luca 2:1-52', 42, 2, 1)] },
    { label: 'Giuseppe (padre adottivo)', query: 'Giuseppe padre adottivo Gesù', blurb: 'Uomo giusto che protetse Gesù secondo le indicazioni di Geova.', scriptures: [s('Matteo 1:18-25', 40, 1, 18), s('Matteo 2:13-23', 40, 2, 13)] },
    { label: 'Gesù', query: 'Gesù Cristo esempio', blurb: 'Il Figlio di Dio: insegnamenti, miracoli, morte e risurrezione.', scriptures: [s('Matteo 5:1-12', 40, 5, 1), s('Giovanni 13:1-17', 43, 13, 1), s('Filippesi 2:5-11', 50, 2, 5)] },
    { label: 'Pietro', query: 'apostolo Pietro', blurb: 'Da pescatore a pastore: zelo, cadute e recupero.', scriptures: [s('Matteo 16:13-19', 40, 16, 13), s('Giovanni 21:15-19', 43, 21, 15), s('Atti 2:14-42', 44, 2, 14)] },
    { label: 'Giovanni', query: 'apostolo Giovanni', blurb: 'Apostolo dell’amore; visioni in Rivelazione.', scriptures: [s('Giovanni 13:23-25', 43, 13, 23), s('1 Giovanni 4:7-21', 62, 4, 7), s('Rivelazione 1:1-20', 66, 1, 1)] },
    { label: 'Paolo', query: 'apostolo Paolo', blurb: 'Da persecutore a apostolo delle nazioni.', scriptures: [s('Atti 9:1-22', 44, 9, 1), s('2 Corinti 11:23-33', 47, 11, 23), s('Filippesi 3:4-14', 50, 3, 4)] },
    { label: 'Timoteo', query: 'Timoteo giovane cristiano', blurb: 'Esempio per i giovani: fede sincera e buone qualità.', scriptures: [s('Atti 16:1-5', 44, 16, 1), s('1 Timoteo 4:12-16', 54, 4, 12), s('2 Timoteo 1:5-7', 55, 1, 5)] },
    { label: 'Lidia', query: 'Lidia Atti', blurb: 'Ospitalità e cuore aperto alla buona notizia.', scriptures: [s('Atti 16:11-15', 44, 16, 11)] },
  ],
  racconto: [
    { label: 'Creazione', query: 'creazione Genesi', blurb: 'Geova crea i cieli, la terra e l’umanità.', scriptures: [s('Genesi 1:1-31', 1, 1, 1), s('Genesi 2:1-25', 1, 2, 1)] },
    { label: 'Diluvio dei giorni di Noè', query: 'Noè diluvio', blurb: 'Giudizio e salvezza; paralleli ai nostri giorni.', scriptures: [s('Genesi 6–8', 1, 6, 1), s('Matteo 24:37-39', 40, 24, 37)] },
    { label: 'Torre di Babele', query: 'torre di Babele', blurb: 'Orgoglio umano e confusione delle lingue.', scriptures: [s('Genesi 11:1-9', 1, 11, 1)] },
    { label: 'Abramo offerisce Isacco', query: 'Abramo Isacco sacrificio', blurb: 'Fede messa alla prova; Geova provvede.', scriptures: [s('Genesi 22:1-19', 1, 22, 1)] },
    { label: 'Esodo dall’Egitto', query: 'uscita dall’Egitto Esodo', blurb: 'Liberazione, Pasqua e Mar Rosso.', scriptures: [s('Esodo 12:1-42', 2, 12, 1), s('Esodo 14:1-31', 2, 14, 1)] },
    { label: 'Dieci Comandamenti', query: 'Dieci Parole Sinai', blurb: 'Geova dà la Legge al Sinai.', scriptures: [s('Esodo 19:1-25', 2, 19, 1), s('Esodo 20:1-17', 2, 20, 1)] },
    { label: 'Caduta di Gerico', query: 'Gerico Giosuè', blurb: 'Vittoria grazie all’obbedienza.', scriptures: [s('Giosuè 6:1-27', 6, 6, 1)] },
    { label: 'Davide e Golia', query: 'Davide e Golia', blurb: 'Fede che affronta l’impossibile.', scriptures: [s('1 Samuele 17:1-58', 9, 17, 1)] },
    { label: 'Naman guarito', query: 'Naman lebbra Eliseo', blurb: 'Umiltà e obbedienza semplice.', scriptures: [s('2 Re 5:1-19', 12, 5, 1)] },
    { label: 'Forno ardente', query: 'tre ebrei forno ardente', blurb: 'Integrità sotto pressione.', scriptures: [s('Daniele 3:1-30', 27, 3, 1)] },
    { label: 'Daniele nella fossa dei leoni', query: 'Daniele fossa dei leoni', blurb: 'Preghiera costante e protezione divina.', scriptures: [s('Daniele 6:1-28', 27, 6, 1)] },
    { label: 'Giona e il grosso pesce', query: 'Giona pesce Ninive', blurb: 'Misericordia di Geova verso Ninive.', scriptures: [s('Giona 1–4', 32, 1, 1)] },
    { label: 'Nascita di Gesù', query: 'nascita di Gesù', blurb: 'Il Messia nasce secondo le profezie.', scriptures: [s('Luca 2:1-20', 42, 2, 1), s('Matteo 1:18-25', 40, 1, 18)] },
    { label: 'Battesimo di Gesù', query: 'battesimo di Gesù', blurb: 'Inizio del ministero terreno.', scriptures: [s('Matteo 3:13-17', 40, 3, 13)] },
    { label: 'Tentazioni di Gesù', query: 'tentazioni di Gesù deserto', blurb: 'Risposte basate sulla Parola di Dio.', scriptures: [s('Matteo 4:1-11', 40, 4, 1)] },
    { label: 'Sermone del Monte', query: 'Sermone del Monte', blurb: 'Principi del Regno per i discepoli.', scriptures: [s('Matteo 5–7', 40, 5, 1)] },
    { label: 'Parabola del seminatore', query: 'parabola del seminatore', blurb: 'Come riceviamo la Parola.', scriptures: [s('Matteo 13:1-23', 40, 13, 1)] },
    { label: 'Buon samaritano', query: 'parabola del buon samaritano', blurb: 'Chi è il mio prossimo?', scriptures: [s('Luca 10:25-37', 42, 10, 25)] },
    { label: 'Figliol prodigo', query: 'parabola del figlio prodigo', blurb: 'Misericordia del Padre.', scriptures: [s('Luca 15:11-32', 42, 15, 11)] },
    { label: 'Pecore e capri', query: 'parabola pecore e capri', blurb: 'Giudizio e sostegno ai «fratelli» di Cristo.', scriptures: [s('Matteo 25:31-46', 40, 25, 31)] },
    { label: 'Risurrezione di Lazzaro', query: 'risurrezione di Lazzaro', blurb: 'Gesù è «la risurrezione e la vita».', scriptures: [s('Giovanni 11:1-44', 43, 11, 1)] },
    { label: 'Ultima Cena', query: 'Ultima Cena commemorazione', blurb: 'Istituzione del Memorial.', scriptures: [s('Luca 22:14-20', 42, 22, 14), s('1 Corinti 11:23-26', 46, 11, 23)] },
    { label: 'Morte e risurrezione di Gesù', query: 'morte risurrezione di Gesù', blurb: 'Il riscatto e la vittoria sulla morte.', scriptures: [s('Matteo 27–28', 40, 27, 1), s('1 Corinti 15:1-8', 46, 15, 1)] },
    { label: 'Pentecoste 33 E.V.', query: 'Pentecoste Atti', blurb: 'Nascita della congregazione cristiana.', scriptures: [s('Atti 2:1-47', 44, 2, 1)] },
    { label: 'Conversione di Saulo', query: 'conversione di Saulo Paolo', blurb: 'Trasformazione radicale per il Regno.', scriptures: [s('Atti 9:1-22', 44, 9, 1)] },
    { label: 'Visione di Pietro e Cornelio', query: 'Pietro Cornelio', blurb: 'Buona notizia aperta alle nazioni.', scriptures: [s('Atti 10:1-48', 44, 10, 1)] },
  ],
  libro: BIBLE_BOOKS.map((b) => ({
    label: b.name,
    query: `libro di ${b.name} panoramica Bibbia`,
    blurb: `Panoramica e punti salienti del libro di ${b.name} secondo le pubblicazioni jw.org.`,
    scriptures: [{ label: `${b.name} 1:1`, bible: bibleCode(b.num, 1, 1) }],
  })),
  tema: [
    { label: 'Nome di Dio — Geova', query: 'nome di Dio Geova Bibbia', blurb: 'Il nome personale di Dio e perché usarlo.', scriptures: [s('Esodo 3:14-15', 2, 3, 14), s('Salmi 83:18', 19, 83, 18), s('Giovanni 17:6', 43, 17, 6)] },
    { label: 'Regno di Dio', query: 'Regno di Dio Bibbia', blurb: 'Il governo di Geova e la sua volontà sulla terra.', scriptures: [s('Daniele 2:44', 27, 2, 44), s('Matteo 6:9-10', 40, 6, 9), s('Rivelazione 21:3-4', 66, 21, 3)] },
    { label: 'Risurrezione', query: 'risurrezione speranza Bibbia', blurb: 'Speranza certa basata sulla potenza di Geova.', scriptures: [s('Giovanni 5:28-29', 43, 5, 28), s('Atti 24:15', 44, 24, 15), s('1 Corinti 15:20-28', 46, 15, 20)] },
    { label: 'Preghiera', query: 'preghiera Bibbia esempi', blurb: 'Come, quando e perché pregare.', scriptures: [s('Matteo 6:5-13', 40, 6, 5), s('Filippesi 4:6-7', 50, 4, 6), s('1 Tessalonicesi 5:17', 52, 5, 17)] },
    { label: 'Fede', query: 'fede esempi biblici', blurb: 'Fiducia in Geova nonostante le prove.', scriptures: [s('Ebrei 11:1-40', 58, 11, 1), s('Giacomo 2:14-26', 59, 2, 14)] },
    { label: 'Amore', query: 'amore cristiano Bibbia', blurb: 'L’amore identifica i veri discepoli.', scriptures: [s('1 Corinti 13:1-13', 46, 13, 1), s('Giovanni 13:34-35', 43, 13, 34), s('1 Giovanni 4:7-21', 62, 4, 7)] },
    { label: 'Perdono', query: 'perdono Bibbia', blurb: 'Perdonare come Geova perdona.', scriptures: [s('Matteo 6:14-15', 40, 6, 14), s('Efesini 4:32', 49, 4, 32), s('Colossesi 3:13', 51, 3, 13)] },
    { label: 'Umiltà', query: 'umiltà Bibbia', blurb: 'Geova esalta gli umili.', scriptures: [s('Proverbi 22:4', 20, 22, 4), s('Filippesi 2:3-8', 50, 2, 3), s('1 Pietro 5:5-6', 60, 5, 5)] },
    { label: 'Pazienza', query: 'pazienza Bibbia', blurb: 'Aspettare i tempi di Geova.', scriptures: [s('Giacomo 5:7-11', 59, 5, 7), s('Romani 12:12', 45, 12, 12)] },
    { label: 'Integrità', query: 'integrità Bibbia', blurb: 'Rimanere leali sotto prova.', scriptures: [s('Giobbe 2:3', 18, 2, 3), s('Proverbi 10:9', 20, 10, 9), s('1 Pietro 2:12', 60, 2, 12)] },
    { label: 'Famiglia', query: 'famiglia Bibbia ruoli', blurb: 'Principi per matrimoni e genitori.', scriptures: [s('Efesini 5:22-33', 49, 5, 22), s('Efesini 6:1-4', 49, 6, 1), s('Colossesi 3:18-21', 51, 3, 18)] },
    { label: 'Amicizia con Geova', query: 'amicizia con Geova', blurb: 'Avvicinarsi a Dio ogni giorno.', scriptures: [s('Giacomo 4:8', 59, 4, 8), s('Salmi 25:14', 19, 25, 14), s('Giovanni 15:14-15', 43, 15, 14)] },
    { label: 'Spirito santo', query: 'spirito santo Bibbia', blurb: 'Forza attiva di Geova che aiuta i servitori.', scriptures: [s('Atti 1:8', 44, 1, 8), s('Galati 5:22-23', 48, 5, 22), s('Giovanni 14:26', 43, 14, 26)] },
    { label: 'Angeli', query: 'angeli Bibbia', blurb: 'Messaggeri di Geova che sostengono i suoi servitori.', scriptures: [s('Salmi 34:7', 19, 34, 7), s('Ebrei 1:14', 58, 1, 14)] },
    { label: 'Satana e demoni', query: 'Satana demoni Bibbia', blurb: 'Chi è il Diavolo e come resistergli.', scriptures: [s('Giovanni 8:44', 43, 8, 44), s('1 Pietro 5:8-9', 60, 5, 8), s('Giacomo 4:7', 59, 4, 7)] },
    { label: 'Fine di questo sistema', query: 'grandi tribolazione fine', blurb: 'Segni e speranza durante gli ultimi giorni.', scriptures: [s('Matteo 24:3-14', 40, 24, 3), s('2 Timoteo 3:1-5', 55, 3, 1), s('Rivelazione 7:9-17', 66, 7, 9)] },
    { label: 'Paradiso terrestre', query: 'paradiso terra Bibbia', blurb: 'Cosa farà il Regno per la terra.', scriptures: [s('Salmi 37:10-11,29', 19, 37, 10), s('Isaia 65:17-25', 23, 65, 17), s('Rivelazione 21:3-5', 66, 21, 3)] },
    { label: 'Battesimo', query: 'battesimo Bibbia', blurb: 'Dedizione e immersione come discepoli.', scriptures: [s('Matteo 28:19-20', 40, 28, 19), s('Atti 8:35-39', 44, 8, 35), s('1 Pietro 3:21', 60, 3, 21)] },
    { label: 'Congregazione cristiana', query: 'congregazione cristiana Bibbia', blurb: 'Organizzazione, anziani e unità.', scriptures: [s('Efesini 4:11-16', 49, 4, 11), s('Ebrei 10:24-25', 58, 10, 24), s('1 Pietro 5:1-3', 60, 5, 1)] },
    { label: 'Ministero / predicazione', query: 'predicazione ministero Bibbia', blurb: 'Annunciare la buona notizia con coraggio.', scriptures: [s('Matteo 24:14', 40, 24, 14), s('Atti 20:20-21', 44, 20, 20), s('Romani 10:13-15', 45, 10, 13)] },
    { label: 'Ansia e pace', query: 'ansia pace Bibbia', blurb: 'Gettare le inquietudini su Geova.', scriptures: [s('Filippesi 4:6-9', 50, 4, 6), s('1 Pietro 5:7', 60, 5, 7), s('Matteo 6:25-34', 40, 6, 25)] },
    { label: 'Lavoro e onestà', query: 'lavoro onestà Bibbia', blurb: 'Integrità sul lavoro e bilanciare le priorità.', scriptures: [s('Colossesi 3:23', 51, 3, 23), s('Efesini 4:28', 49, 4, 28), s('Proverbi 10:4', 20, 10, 4)] },
  ],
}

/** Compatibilità con le view che usavano solo label/query. */
export type BibleSuggestion = BibleCatalogEntry

function resultsToResources(results: JwResult[]): StudyResource[] {
  return results.slice(0, 12).map((r) => ({
    id: uid('res'),
    title: r.title,
    url: r.url,
    kind: r.kind,
    notes: [r.context, r.snippet].filter(Boolean).join(' — '),
    lank: r.lank,
    docid: r.docid,
  }))
}

function scripturesFromCatalog(entry?: BibleCatalogEntry): BibleScriptureRef[] {
  return (entry?.scriptures || []).map((x) => ({
    id: uid('scr'),
    label: x.label,
    bible: x.bible,
    url: bibleOpenUrl(x.bible),
  }))
}

function scripturesFromBibleResults(results: JwResult[], language: string): BibleScriptureRef[] {
  const out: BibleScriptureRef[] = []
  for (const r of results) {
    if (r.kind !== 'bible' && r.section !== 'bibbia') continue
    const bible = extractBibleCode(r.url) || extractBibleCode(r.wolUrl)
    const parsed = !bible ? parseScriptureLabel(r.title) : {}
    out.push({
      id: uid('scr'),
      label: r.title.replace(/\u00a0/g, ' '),
      bible: bible || parsed.bible,
      url: r.url || (bible ? bibleOpenUrl(bible, language) : undefined),
      note: r.snippet?.slice(0, 160),
    })
    if (out.length >= 12) break
  }
  return out
}

export function filterCatalog(
  kind: BibleReadingKind,
  text: string,
): BibleCatalogEntry[] {
  const q = text.trim().toLowerCase()
  const all = BIBLE_READING_SUGGESTIONS[kind]
  if (!q) return all
  return all.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.blurb.toLowerCase().includes(q) ||
      e.query.toLowerCase().includes(q),
  )
}

export async function searchBibleTopic(params: {
  query: string
  language?: string
}): Promise<{
  verses: BibleScriptureRef[]
  resources: StudyResource[]
  queriesUsed: string[]
}> {
  const language = params.language || 'I'
  const query = params.query.trim()
  if (!query) return { verses: [], resources: [], queriesUsed: [] }

  const [bibleHits, deep] = await Promise.all([
    searchJw(query, { language, filter: 'bible' }).catch(() => [] as JwResult[]),
    searchJwDeep(query, {
      language,
      filters: ['bible', 'publications', 'indexes', 'videos'],
      maxQueries: 4,
      perSection: 6,
    }),
  ])

  const verses = scripturesFromBibleResults(
    [...bibleHits, ...deep.flat.filter((r) => r.kind === 'bible' || r.section === 'bibbia')],
    language,
  )
  // Dedup by bible code / label
  const seen = new Set<string>()
  const uniqueVerses = verses.filter((v) => {
    const key = v.bible || v.label
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    verses: uniqueVerses,
    resources: resultsToResources(
      deep.flat.filter((r) => r.kind !== 'bible' && r.section !== 'bibbia'),
    ),
    queriesUsed: deep.queriesUsed,
  }
}

export async function buildBibleReadingPlan(params: {
  kind: BibleReadingKind
  query: string
  language?: string
  entry?: BibleCatalogEntry
}): Promise<BibleReadingPlan> {
  const language = params.language || 'I'
  const query = params.query.trim()
  const entry =
    params.entry ||
    BIBLE_READING_SUGGESTIONS[params.kind].find(
      (e) => e.label.toLowerCase() === query.toLowerCase() || e.query === query,
    )

  const [deep, bibleHits] = await Promise.all([
    searchJwDeep(`${query} Bibbia lettura`, {
      language,
      filters: ['publications', 'indexes', 'videos', 'bible'],
      maxQueries: 4,
      perSection: 5,
    }),
    searchJw(query, { language, filter: 'bible' }).catch(() => [] as JwResult[]),
  ])

  const resources = resultsToResources(deep.flat)
  const catalogScriptures = scripturesFromCatalog(entry)
  const searchScriptures = scripturesFromBibleResults(
    [...bibleHits, ...deep.flat],
    language,
  )
  const scriptureMap = new Map<string, BibleScriptureRef>()
  for (const sref of [...catalogScriptures, ...searchScriptures]) {
    const key = sref.bible || sref.label
    if (!scriptureMap.has(key)) scriptureMap.set(key, sref)
  }
  const scriptures = Array.from(scriptureMap.values()).slice(0, 14)

  // Se è un libro biblico, garantisci il link al libro
  if (params.kind === 'libro') {
    const book = BIBLE_BOOKS.find((b) => b.name.toLowerCase() === query.toLowerCase())
    if (book && !scriptures.some((x) => x.bible?.startsWith(String(book.num)))) {
      scriptures.unshift({
        id: uid('scr'),
        label: `${book.name} (apri il libro)`,
        bible: bibleCode(book.num, 1, 1),
        url: bookOpenUrl(book.num, language),
      })
    }
  }

  const sourceBlock = deep.sections
    .map(
      (sec) =>
        `### ${sec.label}\n` +
        sec.items
          .map((r) => {
            const snip = r.snippet ? ` — ${r.snippet.slice(0, 140)}` : ''
            return `- ${r.title}${r.context ? ` (${r.context})` : ''}${snip}\n  URL: ${r.url}`
          })
          .join('\n'),
    )
    .join('\n\n')

  const scriptureBlock = scriptures
    .map((x) => `- ${x.label}${x.bible ? ` [bible=${x.bible}]` : ''}`)
    .join('\n')

  const kindLabel = BIBLE_KIND_LABELS[params.kind]
  const prompt = `Propomi un percorso di lettura della Bibbia su “${query}” (categoria: ${kindLabel}).
${entry?.blurb ? `Contesto catalogo: ${entry.blurb}` : ''}
Struttura la risposta così:
1. Titolo del percorso
2. Perché vale la pena leggerlo (2-3 frasi)
3. Passi di lettura consigliati (usa scritture TNM italiana; preferisci quelle elencate sotto se pertinenti)
4. Domande di riflessione (3-5) da annotare nel piano di studio
5. Come collegarlo agli articoli/video jw.org elencati (cita solo quei titoli)
Non inventare link. Usa solo terminologia jw.org.`

  let plan = ''
  try {
    plan = await askAi({
      prompt,
      context: `Categoria: ${kindLabel}\nQuery: ${query}\n\nScritture:\n${scriptureBlock || '—'}\n\nFonti jw.org:\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org.'}`,
      allowedUrls: [
        ...resources.map((r) => r.url),
        ...scriptures.map((x) => x.url).filter(Boolean) as string[],
      ],
    })
  } catch {
    plan = [
      `Percorso di lettura: ${query}`,
      entry?.blurb || '',
      '',
      'Scritture da aprire su jw.org / JW Library:',
      ...scriptures.slice(0, 6).map((x) => `• ${x.label}`),
      '',
      'Annota: Cosa imparo su Geova? Cosa posso applicare?',
    ]
      .filter(Boolean)
      .join('\n')
  }

  const titleMatch = plan.match(/^(?:1\.\s*)?(?:Titolo[^:\n]*:\s*)?(.+)$/m)
  const now = new Date().toISOString()
  return {
    id: uid('bible'),
    title: (titleMatch?.[1] || `Lettura: ${query}`).replace(/\*\*/g, '').trim().slice(0, 120),
    kind: params.kind,
    query,
    plan,
    resources,
    scriptures,
    reflections: [],
    blurb: entry?.blurb,
    createdAt: now,
    updatedAt: now,
  }
}
