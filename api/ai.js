import { chatCompletion, resolveGeminiKey, resolveProvider } from './llmChat.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) {
      res.status(400).send('Messaggi mancanti')
      return
    }

    const provider = resolveProvider(req, body)
    const result = await chatCompletion({
      messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      model: body.model,
      provider,
      geminiApiKey: resolveGeminiKey(req, body),
    })

    if (!result.ok) {
      res.status(result.status || 502).setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.send(result.text || 'AI non disponibile')
      return
    }

    res.status(200).json({
      engine: result.engine,
      model: result.model,
      choices: [{ message: { role: 'assistant', content: result.text } }],
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(400).send('Richiesta AI non valida')
      return
    }
    res.status(502).send('Servizio AI non disponibile. Riprova tra poco.')
  }
}
