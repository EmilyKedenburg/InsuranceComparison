import express from 'express'
import { aiScenarioRouter } from './aiScenarioRoute.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(express.json({ limit: '12kb' }))
app.use('/api/ai-scenario', aiScenarioRouter)

app.use((error, _request, response, next) => {
  if (error?.type === 'entity.too.large') {
    response.status(400).json({ error: 'Request payload is too large.' })
    return
  }

  next(error)
})

app.listen(port, () => {
  console.log(`AI scenario backend listening on http://localhost:${port}`)
})
