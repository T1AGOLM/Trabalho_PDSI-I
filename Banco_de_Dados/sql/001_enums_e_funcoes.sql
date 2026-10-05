-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 001_enums_e_funcoes.sql
-- ---------------------------------------------------------------------
-- Enums (domínios de valores vindos do diagrama de classes), extensões e
-- funções auxiliares compartilhadas pelas demais etapas.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE com igualdade + intervalo
CREATE EXTENSION IF NOT EXISTS citext;       -- e-mails/CPFs sem distinção de caixa

-- ---------------------------------------------------------------------
-- 1. ENUMS — Domínios closed do diagrama de classes
-- ---------------------------------------------------------------------

-- Usuário é a classe abstrata; o perfil generaliza a herança
-- (Usuario -> Cliente | Colaborador | Gestor) em uma única tabela.
CREATE TYPE perfil_usuario      AS ENUM ('GESTOR', 'COLABORADOR', 'CLIENTE');
CREATE TYPE tipo_cargo          AS ENUM ('ATENDENTE', 'TOSADOR', 'BANHISTA', 'VETERINARIO');
CREATE TYPE tipo_registro       AS ENUM ('vacina', 'atendimento', 'banho', 'observação');
CREATE TYPE status_agendamento  AS ENUM ('confirmado', 'cancelado', 'concluído');
CREATE TYPE tipo_servico        AS ENUM ('banho', 'tosa', 'consulta');
CREATE TYPE forma_pagamento     AS ENUM ('dinheiro', 'débito', 'crédito', 'PIX');
CREATE TYPE status_venda        AS ENUM ('finalizada', 'estornada');
CREATE TYPE canal_notificacao   AS ENUM ('e-mail', 'push');
CREATE TYPE tipo_relatorio      AS ENUM ('vendas', 'agendamentos', 'estoque', 'financeiro');
CREATE TYPE formato_arquivo     AS ENUM ('PDF', 'Excel', 'CSV');
CREATE TYPE status_assinatura   AS ENUM ('ativo', 'cancelado');
CREATE TYPE tipo_movimentacao   AS ENUM ('entrada', 'saida', 'ajuste', 'estorno');

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES UTILITÁRIAS
-- ---------------------------------------------------------------------

-- Converte timestamptz para 'YYYY-MM-DD"T"HH24:MI' no fuso do petshop.
-- O frontend consome agendamento.dataHora exatamente neste formato local.
CREATE OR REPLACE FUNCTION petplus_data_hora_local(ts timestamptz, tz text DEFAULT 'America/Sao_Paulo')
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(ts AT TIME ZONE tz, 'YYYY-MM-DD"T"HH24:MI')
$$;

-- Converte o texto local do frontend ('2026-09-12T09:00') para o instante
-- absoluto (timestamptz), interpretando o texto no fuso do petshop.
--
-- `::timestamp` (sem fuso) interpreta o texto como "hora de relógio";
-- `AT TIME ZONE` então ancora esse instante no fuso informado. Usar
-- `::timestamptz` aqui aplicaria a conversão com base no TimeZone da
-- sessão e depois de novo no AT TIME ZONE — deslocando o horário.
CREATE OR REPLACE FUNCTION petplus_para_ts(local_iso text, tz text DEFAULT 'America/Sao_Paulo')
RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (local_iso || ':00')::timestamp AT TIME ZONE tz
$$;

-- Garante que uma linha pertence ao tenant da sessão (usada pelas políticas RLS
-- e como segunda camada de defesa em repositórios).
CREATE OR REPLACE FUNCTION petplus_tenant_ok(row_petshop_id bigint)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT row_petshop_id = current_setting('app.petshop_id', true)::bigint
$$;