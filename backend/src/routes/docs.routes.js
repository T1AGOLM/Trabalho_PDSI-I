import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { openapi } from '../docs/openapi.js'

/**
 * Documentação viva da API (RNF18).
 *
 * `/api/openapi.json` é o contrato legível por máquina (serve para gerar
 * cliente ou rodar teste de contrato). `/api/docs` é a mesma coisa em
 * página navegável, com "Try it out" apontando para a própria API.
 */
export const docsRoutes = Router()

docsRoutes.get('/openapi.json', (_req, res) => {
  res.json(openapi)
})

docsRoutes.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapi, {
    customSiteTitle: 'PetPlus — API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: -1,
    },
  }),
)
