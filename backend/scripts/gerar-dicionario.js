#!/usr/bin/env node
/**
 * Gera o dicionário de dados a partir do SCHEMA REAL do banco.
 *
 *   npm run dicionario
 *
 * Ler as tabelas direto do PostgreSQL (em vez de manter uma lista à mão)
 * garante que o documento nunca descreva uma coluna que não existe — o
 * dicionário é extraído de `pg_catalog` e dos `COMMENT ON` do próprio DDL.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../src/config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAIDA = path.resolve(__dirname, '../../Banco_de_Dados/dicionario-de-dados.md')

/** Tabelas agrupadas por área funcional, na ordem de leitura do MER. */
const GRUPOS = [
  ['Multi-tenant e segurança', ['petshop']],
  ['Usuários e perfis', ['usuario', 'token_recuperacao', 'cliente', 'gestor',
                          'colaborador', 'disponibilidade_colaborador']],
  ['Pets e histórico de saúde', ['pet', 'registro_saude']],
  ['Serviços, agenda e pacotes', ['servico', 'agendamento', 'bloqueio_agenda',
                                   'avaliacao', 'pacote_servico',
                                   'pacote_servico_item', 'assinatura_pacote']],
  ['Estoque e fornecedores', ['fornecedor', 'produto', 'lote', 'movimentacao_estoque']],
  ['PDV — vendas', ['venda', 'item_venda', 'pagamento']],
  ['Comunicação, auditoria e relatórios', ['notificacao', 'relatorio', 'auditoria']],
]

/** Descrição de cada tabela, na ordem do MER. */
const DESCRICOES = {
  petshop: 'Tenant da arquitetura multi-tenant (RNF13). Todo dado de negócio se apoia nesta tabela.',
  usuario: 'Classe abstrata Usuario do diagrama de classes. Cliente, Colaborador e Gestor são especializações por `perfil` (1:0..1).',
  token_recuperacao: 'Tokens de recuperação de senha (RF24). Guarda-se apenas o SHA-256 do token.',
  cliente: 'Especialização: tutor do pet. Participação parcial (endereco, pontos de fidelidade) promovida a coluna.',
  gestor: 'Especialização: dono/gerente do petshop. Sem atributos próprios além do cargo.',
  colaborador: 'Especialização: funcionário operacional (RF16).',
  disponibilidade_colaborador: 'Disponibilidade semanal (RN08). É a entidade fraca (colaborador, dia_semana) que o texto "Seg–Sex 08h–18h" do protótipo representava.',
  pet: 'Animal de estimação vinculado a um tutor (RF02).',
  registro_saude: 'Item da linha do tempo de saúde do pet (RF11). Sempre pertence a um pet.',
  servico: 'Serviço oferecido (banho, tosa, consulta), usado em agendamentos e pacotes.',
  agendamento: 'Marcação de serviço (RF04). `data_hora_fim` existe para que o conflito de agenda possa ser comparado por INTERVALO (RN01), e não por igualdade de minuto.',
  bloqueio_agenda: 'Período de indisponibilidade do colaborador (RF30 / RN12).',
  avaliacao: 'Avaliação do serviço pelo cliente (RF28). Um agendamento recebe no máximo uma (UNIQUE em agendamento_id).',
  pacote_servico: 'Catálogo de planos recorrentes (RF29).',
  pacote_servico_item: 'N:N entre plano e serviço — resolve o relacionamento "inclui" do diagrama de classes.',
  assinatura_pacote: 'Contratação de um plano por um cliente para um pet.',
  fornecedor: 'Empresa fornecedora (Rastreabilidade de estoque).',
  produto: 'Item de estoque (RF07). `quantidade_estoque` é a PROJEÇÃO de `movimentacao_estoque` — nunca editada à mão.',
  lote: 'Entrada de mercadoria com custo e validade.',
  movimentacao_estoque: 'Trilha append-only de toda entrada, saída, ajuste e estorno. É a fonte da verdade do saldo.',
  venda: 'Transação do PDV (RF10). `cliente_id` é nulo em venda avulsa.',
  item_venda: 'Produto vendido. `nome` e `preco_unitario` ficam congelados para o comprovante não depender do cadastro atual.',
  pagamento: 'Forma de pagamento de uma venda. Uma venda pode ter várias linhas (RF25 — pagamento combinado).',
  notificacao: 'Mensagem automática enviada ao usuário (RF12/RF13/RF22).',
  relatorio: 'Metadados das exportações geradas pelo gestor (RF27).',
  auditoria: 'Log das operações críticas (RNF09). `dados_antes`/`dados_depois` guardam o antes e o depois em JSONB.',
}

const client = new pg.Client({
  ...config.db,
  user: config.db.adminUser,
  password: config.db.adminPassword,
})
await client.connect()

// --- Colunas -------------------------------------------------------------
const { rows: colunas } = await client.query(`
  SELECT c.relname AS tabela,
         a.attnum,
         a.attname AS coluna,
         format_type(a.atttypid, a.atttypmod) AS tipo,
         a.attnotnull AS obrigatoria,
         col_description(c.oid, a.attnum) AS comentario
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   WHERE c.relkind = 'r'
     AND c.relname NOT IN ('schema_migrations', 'petplus_petshop_padrao_holder')
   ORDER BY c.relname, a.attnum
`)

// --- Chaves primárias, únicas e estrangeiras ------------------------------
const { rows: chaves } = await client.query(`
  SELECT conrelid::regclass::text AS tabela, conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
   WHERE contype IN ('p', 'u', 'f') AND connamespace = 'public'::regnamespace
   ORDER BY conrelid::regclass::text, contype, conname
`)

// --- CHECKs e EXCLUDE (regras de negócio) ---------------------------------
const { rows: regrasSql } = await client.query(`
  SELECT conrelid::regclass::text AS tabela, conname, contype,
         pg_get_constraintdef(oid) AS def,
         obj_description(oid, 'pg_constraint') AS comentario
    FROM pg_constraint
   WHERE contype IN ('c', 'x') AND connamespace = 'public'::regnamespace
     AND conname NOT LIKE '%\\_not\\_null\\_check'
   ORDER BY conrelid::regclass::text, conname
`)

// --- Triggers -------------------------------------------------------------
const { rows: gatilhos } = await client.query(`
  SELECT c.relname AS tabela, t.tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE NOT t.tgisinternal
   ORDER BY c.relname, t.tgname
`)

// --- Índices --------------------------------------------------------------
const { rows: indices } = await client.query(`
  SELECT tablename AS tabela, indexname, indexdef
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname NOT LIKE 'pg_%'
   ORDER BY tablename, indexname
`)

const { rows: visoes } = await client.query(`
  SELECT table_name, view_definition
    FROM information_schema.views
   WHERE table_schema = 'public'
   ORDER BY table_name
`)

await client.end()

// --- Montagem ------------------------------------------------------------
const colunasDe = (tabela) => colunas.filter((c) => c.tabela === tabela)
const pkDe = (tabela) => chaves.find((k) => k.tabela === tabela && k.contype === 'p')
const fksDe = (tabela) => chaves.filter((k) => k.tabela === tabela && k.contype === 'f')
const unicosDe = (tabela) => chaves.filter((k) => k.tabela === tabela && k.contype === 'u')

/** Nomes das colunas cobertas por uma constraint (PK/FK). */
function colunasDaDef(def) {
  const dentro = def.match(/\(([^)]*)\)/)
  if (!dentro) return []
  return dentro[1].split(',').map((s) => s.trim().replace(/"/g, ''))
}

/**
 * Tabela referenciada por uma FK, já com as colunas:
 *   "FOREIGN KEY (pet_id) REFERENCES pet(id)" -> "pet.id"
 *   "FOREIGN KEY (pet_id, petshop_id) REFERENCES pet(id, petshop_id)"
 *      -> "pet(id, petshop_id)"
 */
function destinoFk(def) {
  const m = def.match(/REFERENCES\s+([A-Za-z_"]+)\s*(?:\(([^)]*)\))?/i)
  if (!m) return '?'
  const tabela = m[1].replace(/"/g, '')
  const colunas = (m[2] ?? '').split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean)
  return colunas.length ? `${tabela}(${colunas.join(', ')})` : tabela
}

const tabelasPresentes = [...new Set(colunas.map((c) => c.tabela))]
const md = []
md.push('# Dicionário de Dados — PetPlus')
md.push('')
md.push('> Documento **gerado automaticamente** a partir do banco em execução.')
md.push('> Para regerar após mexer no schema: `cd backend && npm run dicionario`.')
md.push('')
md.push(`- **PostgreSQL:** 17`)
md.push(`- **Tabelas:** ${tabelasPresentes.length}`)
md.push(`- **Colunas:** ${colunas.length}`)
md.push(`- **Chaves estrangeiras:** ${chaves.filter((k) => k.contype === 'f').length}`)
md.push(`- **Índices:** ${indices.length}`)
md.push('')
md.push('## Convenções')
md.push('')
md.push('| Convenção | Significado |')
md.push('|---|---|')
md.push('| `id BIGSERIAL` | Chave primária surrogate, atribuída pelo banco |')
md.push('| `petshop_id` | Tenant dono da linha — base do isolamento multi-tenant (RNF13) |')
md.push('| `enum` | Domínio fechado vindo do diagrama de classes (tipo de serviço, status…) |')
md.push('| `citext` | Texto sem distinção de caixa (e-mail) |')
md.push('| `char(14)` / `char(11)` | CNPJ e CPF **normalizados, só dígitos** |')
md.push('| `numeric(10,2)` / `numeric(12,2)` | Dinheiro — nunca ponto flutuante |')
md.push('| `timestamptz` | Instante absoluto; convertemos para o fuso do petshop na apresentação |')
md.push('| `ativo BOOLEAN` | Exclusão lógica (RF03): o registro sai da listagem, o histórico permanece |')
md.push('| `*_em` | Momento do fato |')
md.push('')

// --- Rastreabilidade ------------------------------------------------------
md.push('## Regras de negócio garantidas pelo BANCO')
md.push('')
md.push('Estas regras não dependem da aplicação: o PostgreSQL recusa a operação.')
md.push('Por isso o `npm run test:db` consegue prová-las.')
md.push('')
const rotulos = { c: 'CHECK', x: 'EXCLUDE' }
for (const r of regrasSql) {
  md.push(`### \`${r.conname}\` — ${r.tabela} · ${rotulos[r.contype] ?? r.contype}`)
  md.push('')
  if (r.comentario) {
    md.push(r.comentario)
    md.push('')
  }
  md.push('```sql')
  md.push(r.def + ';')
  md.push('```')
  md.push('')
}

md.push('### Gatilhos')
md.push('')
md.push('| Tabela | Gatilho | O que faz |')
md.push('|---|---|---|')
const oQueFaz = {
  trg_movimentar_estoque: 'Atualiza `produto.quantidade_estoque` e impede saldo negativo (RN02)',
  trg_validar_disponibilidade: 'Recusa agendamento fora da disponibilidade do colaborador (RN08)',
  trg_validar_bloqueio: 'Recusa bloqueio que sobreponha agendamento confirmado (RN12)',
  trg_validar_estorno: 'Exige perfil GESTOR e prazo comercial no estorno (RN11)',
  trg_validar_pagamentos: 'Confere que a soma dos pagamentos cobre o total (RF25) — roda no COMMIT',
  trg_auditar_produto: 'Grava o antes/depois em `auditoria` (RNF09)',
}
for (const g of gatilhos) {
  md.push(`| \`${g.tabela}\` | \`${g.tgname}\` | ${oQueFaz[g.tgname] ?? '—'} |`)
}
md.push('')

// --- Tabelas --------------------------------------------------------------
md.push('## Tabelas')
md.push('')
for (const [grupo, tabelas] of GRUPOS) {
  md.push(`### ${grupo}`)
  md.push('')
  for (const tabela of tabelas) {
    if (!tabelasPresentes.includes(tabela)) continue
    const pk = pkDe(tabela)
    md.push(`#### \`${tabela}\``)
    md.push('')
    if (DESCRICOES[tabela]) {
      md.push(DESCRICOES[tabela])
      md.push('')
    }
    if (pk) {
      md.push(`**PK:** \`${colunasDaDef(pk.def).join(', ')}\``)
      md.push('')
    }
    md.push('| Coluna | Tipo | Nulo | Descrição |')
    md.push('|---|---|---|---|')
    const colPk = pk ? colunasDaDef(pk.def) : []
    const unicos = new Set()
    for (const u of unicosDe(tabela)) for (const c of colunasDaDef(u.def)) unicos.add(c)
    for (const c of colunasDe(tabela)) {
      const marcas = []
      if (colPk.includes(c.coluna)) marcas.push('PK')
      // FKs compostas (com petshop_id) recebem sufixo para ficar claro
      // que são a barreira de isolamento entre unidades.
      for (const fk of fksDe(tabela)) {
        const cols = colunasDaDef(fk.def)
        if (!cols.includes(c.coluna)) continue
        marcas.push(`FK → ${destinoFk(fk.def)}${cols.length > 1 && cols.includes('petshop_id') ? ' 🔒' : ''}`)
      }
      if (unicos.has(c.coluna)) marcas.push('UNIQUE')
      md.push(`| \`${c.coluna}\` | \`${c.tipo}\` | ${c.obrigatoria ? 'não' : 'sim'} | `
        + `${[c.comentario, marcas.join(' · ')].filter(Boolean).join(' — ') || '—'} |`)
    }
    md.push('')
    const fks = fksDe(tabela)
    if (fks.length) {
      md.push('**Chaves estrangeiras:**')
      md.push('')
      for (const fk of fks) {
        const cols = colunasDaDef(fk.def)
        const selo = cols.length > 1 && cols.includes('petshop_id')
          ? ' 🔒 composta com `petshop_id` — impede atravessar tenants'
          : ''
        md.push(`- \`${cols.join(', ')}\` → \`${destinoFk(fk.def)}\`${selo}`)
      }
      md.push('')
    }
  }
}

// --- Views ----------------------------------------------------------------
md.push('## Views')
md.push('')
md.push('Consultas prontas que a aplicação e os relatórios usam em vez de recalcular a lógica.')
md.push('')
const descricaoView = {
  vw_alerta_estoque_minimo: 'Produtos no ou abaixo do estoque mínimo (RF09 / RN05)',
  vw_alerta_validade: 'Produtos vencendo dentro da janela configurada (RF23 / RN09)',
  vw_faturamento: 'Faturamento por dia, semana e mês, só de vendas finalizadas (RF14)',
  vw_servicos_mais_vendidos: 'Serviços mais vendidos por quantidade e receita (RF15)',
  vw_ocupacao_agenda: 'Minutos de agenda ocupada por dia (RF15)',
  vw_agenda: 'Agenda já expandida com nomes de pet, tutor, profissional e serviço',
  vw_comprovante_venda: 'Comprovante de venda com itens e pagamentos na mesma linha',
}
md.push('| View | Para que serve |')
md.push('|---|---|')
for (const v of visoes) md.push(`| \`${v.table_name}\` | ${descricaoView[v.table_name] ?? '—'} |`)
md.push('')

// --- Índices --------------------------------------------------------------
md.push('## Índices')
md.push('')
md.push('| Tabela | Índice | Objetivo |')
md.push('|---|---|---|')
const motivo = {
  agendamento_sem_conflito_profissional: 'RN01 — impede sobreposição de intervalos por profissional',
  agendamento_colaborador_data_idx: 'carrega a agenda de um profissional por período',
  avaliacao_agendamento_id_key: 'garante 1 avaliação por agendamento (1:0..1)',
  auditoria_data_idx: 'consulta cronológica do log de auditoria (RNF09)',
  venda_data_idx: 'faturamento por período (RF14)',
  venda_cliente_idx: 'histórico de compras do tutor',
  movimentacao_produto_idx: 'extrato de estoque por produto',
  notificacao_usuario_idx: 'sino de notificações não lidas',
  disponibilidade_unica: 'impede duas janelas para o mesmo dia (entidade fraca)',
  usuario_email_key: 'login — o e-mail identifica a conta em todo o sistema',
}
md.push('| Índice | Tabela | Objetivo |')
md.push('|---|---|---|')
for (const i of indices) {
  if (/_pkey$/.test(i.indexname)) continue
  md.push(`| \`${i.indexname}\` | \`${i.tabela}\` | ${motivo[i.indexname] ?? 'apoio às consultas do dia a dia'} |`)
}
md.push('')
md.push('As chaves primárias (`*_pkey`) foram omitidas desta lista: são criadas')
md.push('automaticamente para toda PK e UNIQUE.')
md.push('')

await writeFile(SAIDA, md.join('\n'), 'utf8')
console.log(`✓ dicionário de dados gerado: ${SAIDA}`)
console.log(`  ${tabelasPresentes.length} tabelas · ${colunas.length} colunas · ${indices.length} índices · ${gatilhos.length} gatilhos`)