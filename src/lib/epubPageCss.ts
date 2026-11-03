/**
 * Margini e wrapping comuni per EPUB: evita testo attaccato
 * ai bordi del lettore (Books, Thorium, Kindle preview, ecc.).
 */
export const EPUB_PAGE_CSS = `
@page{margin:1.6em 1.7em}
html,body{
  margin:0;
  padding:0;
}
body{
  box-sizing:border-box;
  padding:1.55em 1.65em 2em;
  line-height:1.55;
  text-align:left;
  overflow-wrap:break-word;
  word-wrap:break-word;
  word-break:normal;
  hyphens:auto;
  -webkit-hyphens:auto;
}
p,li,h1,h2,h3,h4,div,span,footer{
  max-width:100%;
  overflow-wrap:break-word;
  word-wrap:break-word;
}
ul,ol{
  margin:.35em 0 0;
  padding-left:1.25em;
  padding-right:.35em;
}
li{margin:.35em 0}
`.replace(/\n/g, '')
