import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * O front chama a API pelo caminho relativo `/api` e o Vite encaminha para o
 * backend em desenvolvimento.
 *
 * Isso não é só conveniência: com front e API na mesma origem, o cookie de
 * sessão (`httpOnly`) é de primeira parte — não precisa de CORS com
 * credenciais nem de `SameSite=None`, que são justamente as configurações
 * que enfraquecem a proteção do cookie. Em produção a mesma regra vale: o
 * build estático é servido atrás do mesmo domínio da API.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
