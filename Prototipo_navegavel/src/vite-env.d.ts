/// <reference types="vite/client" />

/**
 * Tipos das variáveis de ambiente do Vite.
 * `VITE_API_URL` permite apontar o front para outra API sem recompilar.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}