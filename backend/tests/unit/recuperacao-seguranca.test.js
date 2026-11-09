import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backend = fileURLToPath(new URL('../../', import.meta.url))

// Processo isolado: testa a configuração real de produção e captura a saída
// real do Pino. Apenas o banco é substituído; não conecta nem altera dados.
function executar({ producao = false, expor = 'false', transporte = 'console' } = {}) {
  const script = `
    import assert from 'node:assert/strict';
    import { mkdtemp, readFile, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { pool } from './src/db/pool.js';
    import { config } from './src/config/env.js';
    import { solicitarRecuperacao } from './src/services/auth.service.js';
    import { enviar } from './src/services/email.service.js';
    import { logger } from './src/observability/logger.js';
    const consultas = [];
    pool.query = async () => ({ rows: [{ id: 9, petshop_id: 1, nome: 'Teste', email: 'teste@example.com' }] });
    pool.connect = async () => ({
      query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [], rowCount: 1 }; },
      release() {},
    });
    const resposta = await solicitarRecuperacao({ email: 'teste@example.com' });
    const aviso = consultas.find(c => c.sql.includes('INSERT INTO notificacao'));
    assert.ok(aviso);
    assert.ok(!aviso.params[3].includes('token='));
    assert.ok(!aviso.params[3].includes('redefinir-senha'));
    const segredo = 'SEGREDO_DE_TESTE_NAO_PODE_APARECER';
    const link = 'https://app.example.com/#/redefinir-senha?token=' + segredo;
    const dir = await mkdtemp(path.join(tmpdir(), 'petplus-recuperacao-'));
    config.email.outboxDir = dir;
    try {
      const entrega = await enviar({ para: 'teste@example.com', assunto: 'Recuperação', texto: 'Abra ' + link });
      if (config.email.transport === 'arquivo') {
        const arquivo = await readFile(entrega.destino, 'utf8');
        assert.ok(!arquivo.includes(segredo));
        assert.ok(!arquivo.includes(link));
      }
      logger.info({ texto: link, mensagem: link, detalhe: { texto: link, mensagem: link } }, 'teste de redação');
      console.log('RESULTADO:' + JSON.stringify(resposta));
    } finally {
      await rm(dir, { recursive: true, force: true });
      await pool.end();
    }
  `
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backend,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: producao ? 'production' : 'test',
      JWT_SECRET: 'segredo-isolado-de-teste-com-mais-de-32-caracteres',
      COOKIE_SECURE: 'true', LOG_PRETTY: 'false', LOG_LEVEL: 'info',
      APP_URL: 'https://app.example.com', CORS_ORIGIN: 'https://outra-origem.example.com',
      EXPOR_TOKEN_RECUPERACAO: expor, EMAIL_TRANSPORT: transporte,
    },
  })
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout)
  assert.ok(!resultado.stdout.includes('SEGREDO_DE_TESTE_NAO_PODE_APARECER'))
  const linha = resultado.stdout.split(/\r?\n/).find(l => l.startsWith('RESULTADO:'))
  assert.ok(linha, resultado.stdout)
  return JSON.parse(linha.slice('RESULTADO:'.length))
}

test('recuperação não expõe token por padrão e não persiste o link na notificação', () => {
  const resposta = executar()
  assert.equal(resposta.enviado, true)
  assert.equal(resposta.token, undefined)
  assert.equal(resposta.link, undefined)
})

test('demonstração exige opt-in e monta o link com APP_URL, independente do CORS', () => {
  const resposta = executar({ expor: 'true' })
  assert.match(resposta.token, /^[a-f0-9]{64}$/)
  assert.equal(resposta.link, 'https://app.example.com/#/redefinir-senha?token=' + resposta.token)
})

for (const transporte of ['console', 'arquivo']) {
  test(`produção não expõe recuperação mesmo com flag ativa (${transporte})`, () => {
    const resposta = executar({ producao: true, expor: 'true', transporte })
    assert.equal(resposta.token, undefined)
    assert.equal(resposta.link, undefined)
  })
}
