import { registerCommand } from '../kernel/commands'
import { semanticSearch, type SemanticHit } from './indexer'

/** Commands that need the AI layer itself. Registered after the kernel commands. */

registerCommand<{ query: string }, SemanticHit[]>({
  id: 'fs.semanticSearch',
  title: 'Buscar por significado',
  description:
    'Encuentra archivos por lo que contienen, no por su nombre, usando un índice de resúmenes. Úsalo cuando la persona describa un documento por su tema ("el documento donde hablo de los costos del servidor").',
  params: { query: { type: 'string', description: 'Descripción en lenguaje natural de lo que se busca.', required: true } },
  async run({ query }) {
    const { hits } = await semanticSearch(query)
    return { result: hits }
  },
})
