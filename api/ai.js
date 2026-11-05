import { chatCompletion, resolveOpenAiKey } from './openaiChat.js'

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

    const result = await chatCompletion({
      messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      model: body.model,
      apiKey: resolveOpenAiKey(req, body),
    })

    if (!result.ok) {
      res.status(result.status || 502).send(result.text || 'AI non disponibile')
      return
    }

    // Formato compatibile con il client (choices[].message.content) + metadati utili
    res.status(200).json({
      engine: result.engine,
      model: result.model,
      choices: [{ message: { role: 'assistant', content: result.text } }],
    })
  } catch (error) {
    res.status(502).send(String(error))
  }
}
