-- =====================================================================
-- PetPlus — Dados de demonstração
-- 010_seed.sql
-- ---------------------------------------------------------------------
-- Reproduz o conjunto de dados do protótipo navegável (src/data.ts) no
-- banco normalizado. As senhas de TODOS os usuários de demonstração são
-- `123`, armazenadas com hash bcrypt (RNF02) — nunca em texto puro.
--
-- Os e-mails de acesso rápido do protótipo (gestor@ / colab@ / cliente@)
-- viram as contas de demonstração reais; os demais tutores mantêm os
-- e-mails originais de src/data.ts.
-- =====================================================================

-- Executado por `npm run seed` (node-postgres), que já trata o erro e
-- aborta a transação; sem meta-comandos de psql para funcionar nos dois
-- caminhos.

BEGIN;

-- RLS é FORÇADO: precisamos declarar o tenant antes de qualquer escrita.
SET LOCAL app.petshop_id = '1';
SET LOCAL app.usuario_id = '6';

-- ---------------------------------------------------------------------
-- TENANT
-- ---------------------------------------------------------------------
-- CNPJ é armazenado normalizado: só dígitos (CHAR(14)). A máscara é
-- responsabilidade da camada de apresentação.
INSERT INTO petshop (id, nome, cnpj, email, telefone, endereco, prazo_estorno_dias,
                     antecedencia_lembrete_h, antecedencia_validade_d)
VALUES (1, 'PetPlus — Unidade Vila Mariana', '11222333000144',
        'contato@petplus.com.br', '(11) 3333-4444',
        'Rua das Acácias, 500 — Vila Mariana, São Paulo/SP',
        7, 24, 30)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- USUÁRIOS
-- ids 1–5 = clientes (tutores) · 6 = gestor · 7–11 = colaboradores
-- ---------------------------------------------------------------------
-- $2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6 = bcrypt("123")
-- A última coluna é `ativo`: Larissa (tutor) e Camila (colaboradora) estão
-- inativos no protótipo, e é isso que a coluna precisa refletir.
INSERT INTO usuario (id, petshop_id, perfil, nome, email, telefone, senha_hash, ativo, consent_lgpd, consent_em) VALUES
 (1, 1, 'CLIENTE', 'Ana Beatriz Souza',       'cliente@petplus.com', '(11) 98877-1234', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (2, 1, 'CLIENTE', 'Carlos Eduardo Lima',      'carlos.lima@email.com',  '(11) 99123-4567', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (3, 1, 'CLIENTE', 'Fernanda Ribeiro',         'fer.ribeiro@email.com', '(11) 97766-3322', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (4, 1, 'CLIENTE', 'João Pedro Martins',       'jp.martins@email.com',  '(11) 96555-9090', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (5, 1, 'CLIENTE', 'Larissa Costa',            'lari.costa@email.com',   '(11) 98080-2211', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', false, false, NULL),
 (6, 1, 'GESTOR',  'Marcos Ruan',              'gestor@petplus.com',     '(11) 90000-0001', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (7, 1, 'COLABORADOR', 'Juliana Ferreira',      'colab@petplus.com',      '(11) 91111-0101', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (8, 1, 'COLABORADOR', 'Marcos Vinícius',      'marcos@petplus.com.br',  '(11) 92222-0202', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (9, 1, 'COLABORADOR', 'Patrícia Gomes',       'patricia@petplus.com.br','(11) 93333-0303', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (10,1, 'COLABORADOR', 'Dr. Roberto Nogueira',  'roberto@petplus.com.br', '(11) 94444-0404', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', true,  true,  now()),
 (11,1, 'COLABORADOR', 'Camila Duarte',         'camila@petplus.com.br',  '(11) 95555-0505', '$2a$10$Mev9K296Y5SrDy2JrxoDRu34znZUbAs3iyVXHKhJqlGaZStCcZbA6', false, true,  now());

-- ---------------------------------------------------------------------
-- ESPECIALIZAÇÕES (herança da classe abstrata Usuario)
-- ---------------------------------------------------------------------
INSERT INTO cliente (usuario_id, petshop_id, endereco, pontos_fidelidade) VALUES
 (1, 1, 'Rua das Flores, 123 — Vila Mariana, São Paulo/SP',        320),
 (2, 1, 'Av. Paulista, 900 — Bela Vista, São Paulo/SP',           145),
 (3, 1, 'Rua Harmonia, 45 — Vila Madalena, São Paulo/SP',          510),
 (4, 1, 'Rua do Bosque, 210 — Barra Funda, São Paulo/SP',           80),
 (5, 1, 'Rua Girassol, 780 — Vila Olímpia, São Paulo/SP',            0);

INSERT INTO gestor (usuario_id, petshop_id, cargo) VALUES (6, 1, 'Gerente Geral');

INSERT INTO colaborador (usuario_id, petshop_id, cargo, matricula) VALUES
 (7,  1, 'ATENDENTE',   'ATD-001'),
 (8,  1, 'TOSADOR',     'TOS-002'),
 (9,  1, 'BANHISTA',    'BAN-003'),
 (10, 1, 'VETERINARIO', 'VET-004'),
 (11, 1, 'BANHISTA',    'BAN-005');

-- ---------------------------------------------------------------------
-- DISPONIBILIDADE (RN08) — entidade fraca (colaborador, dia_semana)
-- Substitui o texto livre "Seg–Sex, 09h–18h" do protótipo: cada linha é
-- uma entidade; o texto exibido na tela é derivado destas linhas.
-- ---------------------------------------------------------------------
INSERT INTO disponibilidade_colaborador (petshop_id, colaborador_id, dia_semana, hora_inicio, hora_fim)
SELECT 1, d.col_id, d.dow, d.ini::time, d.fim::time
FROM (VALUES
  -- Juliana Ferreira (ATENDENTE) — Seg–Sáb 08h–18h
  (7, 1,'08:00','18:00'), (7, 2,'08:00','18:00'), (7, 3,'08:00','18:00'),
  (7, 4,'08:00','18:00'), (7, 5,'08:00','18:00'), (7, 6,'08:00','18:00'),
  -- Marcos Vinícius (TOSADOR) — Seg–Sex 09h–18h + Sábado 09h–12h
  (8, 1,'09:00','18:00'), (8, 2,'09:00','18:00'), (8, 3,'09:00','18:00'),
  (8, 4,'09:00','18:00'), (8, 5,'09:00','18:00'), (8, 6,'09:00','12:00'),
  -- Patrícia Gomes (BANHISTA) — Seg–Sáb 08h–17h
  (9, 1,'08:00','17:00'), (9, 2,'08:00','17:00'), (9, 3,'08:00','17:00'),
  (9, 4,'08:00','17:00'), (9, 5,'08:00','17:00'), (9, 6,'08:00','17:00'),
  -- Dr. Roberto Nogueira (VETERINÁRIO) — Seg–Sáb 08h–19h (clínica)
  (10,1,'08:00','19:00'), (10,2,'08:00','19:00'), (10,3,'08:00','19:00'),
  (10,4,'08:00','19:00'), (10,5,'08:00','19:00'), (10,6,'08:00','19:00'),
  -- Camila Duarte (BANHISTA, inativa) — Seg–Sex 10h–19h
  (11,1,'10:00','19:00'), (11,2,'10:00','19:00'), (11,3,'10:00','19:00'),
  (11,4,'10:00','19:00'), (11,5,'10:00','19:00')
) AS d(col_id, dow, ini, fim);

-- ---------------------------------------------------------------------
-- PETS
-- ---------------------------------------------------------------------
INSERT INTO pet (id, petshop_id, cliente_id, nome, especie, raca, porte, idade, observacoes_saude, ativo) VALUES
 (1, 1, 1, 'Bolinha', 'Cachorro', 'Poodle',        'Pequeno', 3, 'Alergia a pulgas; usar shampoo hiperalergênico.', true),
 (2, 1, 1, 'Mimi',    'Gato',     'SRD',           'Médio',   5, 'Estressada em banho; sugestão de sedação leve.',  true),
 (3, 1, 2, 'Thor',    'Cachorro', 'Labrador',      'Grande',  2, 'Sobrepeso — dieta recomendada.',                    true),
 (4, 1, 3, 'Pipoca',  'Coelho',   'Holland',       'Pequeno', 1, 'Vacinação em dia.',                                  true),
 (5, 1, 4, 'Rex',     'Cachorro', 'Pastor Alemão', 'Grande',  4, 'Displasia leve no quadril.',                         true),
 (6, 1, 5, 'Fumaça',  'Gato',     'Persa',         'Médio',   7, 'Pelo longo — escovação semanal.',                     true);

-- ---------------------------------------------------------------------
-- SERVIÇOS
-- ---------------------------------------------------------------------
INSERT INTO servico (id, petshop_id, nome, tipo, duracao, preco) VALUES
 (1, 1, 'Banho e Tosa Higiênica',   'tosa',     60,  65.00),
 (2, 1, 'Banho Simples',            'banho',    40,  45.00),
 (3, 1, 'Tosa da Raça (Padrão AKC)', 'tosa',     90,  95.00),
 (4, 1, 'Consulta Veterinária',     'consulta', 30, 150.00),
 (5, 1, 'Consulta + Vacina V4',     'consulta', 30, 190.00),
 (6, 1, 'Banho com Tratamento de Pele', 'banho', 60,  85.00);

-- ---------------------------------------------------------------------
-- AGENDAMENTOS
-- `data_hora` recebe o instante local do protótipo convertido para
-- timestamptz; `data_hora_fim` = início + duração do serviço.
-- ---------------------------------------------------------------------
INSERT INTO agendamento (id, petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                         data_hora, data_hora_fim, status, valor, criado_por,
                         cancelado_em, motivo_cancelamento) VALUES
 (1, 1, 1, 1, 8,  1,  petplus_para_ts('2026-09-12T09:00'), petplus_para_ts('2026-09-12T10:00'), 'confirmado',  65.00, 6, NULL, NULL),
 (2, 1, 3, 2, 9,  2,  petplus_para_ts('2026-09-12T10:00'), petplus_para_ts('2026-09-12T10:40'), 'confirmado',  45.00, 6, NULL, NULL),
 (3, 1, 5, 4, 10, 4,  petplus_para_ts('2026-09-12T14:00'), petplus_para_ts('2026-09-12T14:30'), 'confirmado', 150.00, 6, NULL, NULL),
 (4, 1, 2, 1, 9,  3,  petplus_para_ts('2026-09-12T15:30'), petplus_para_ts('2026-09-12T17:00'), 'concluído',  95.00, 6, NULL, NULL),
 (5, 1, 4, 3, 10, 5,  petplus_para_ts('2026-09-10T09:30'), petplus_para_ts('2026-09-10T10:00'), 'concluído', 190.00, 6, NULL, NULL),
 -- Cancelado: o CHECK exige cancelado_em já na inserção (RN04).
 (6, 1, 6, 5, 9,  2,  petplus_para_ts('2026-09-11T16:00'), petplus_para_ts('2026-09-11T16:40'), 'cancelado',  45.00, 6,
      petplus_para_ts('2026-09-10T11:00'), 'Cliente desistiu'),
 (7, 1, 3, 2, 8,  1,  petplus_para_ts('2026-09-14T11:00'), petplus_para_ts('2026-09-14T12:00'), 'confirmado',  65.00, 6, NULL, NULL),
 (8, 1, 1, 1, 9,  6,  petplus_para_ts('2026-09-14T15:00'), petplus_para_ts('2026-09-14T16:00'), 'confirmado',  85.00, 6, NULL, NULL),
 (9, 1, 5, 4, 10, 4,  petplus_para_ts('2026-09-16T10:30'), petplus_para_ts('2026-09-16T11:00'), 'confirmado', 150.00, 6, NULL, NULL),
 (10,1, 2, 1, 9,  1,  petplus_para_ts('2026-09-08T09:00'), petplus_para_ts('2026-09-08T10:00'), 'concluído',  65.00, 6, NULL, NULL);

-- ---------------------------------------------------------------------
-- BLOQUEIOS DE AGENDA (RF30 / RN12)
-- ---------------------------------------------------------------------
INSERT INTO bloqueio_agenda (id, petshop_id, colaborador_id, data_inicio, data_fim, motivo) VALUES
 (1, 1, 8,  '2026-09-20', '2026-09-27', 'Férias programadas'),
 (2, 1, 10, '2026-09-15', '2026-09-15', 'Folga (compensação)');

-- ---------------------------------------------------------------------
-- HISTÓRICO DE SAÚDE (RF11)
-- ---------------------------------------------------------------------
INSERT INTO registro_saude (id, petshop_id, pet_id, tipo, data, descricao, proximo_vencimento) VALUES
 (1,  1, 1, 'vacina',      '2026-06-10', 'V4 (quádrupla) — dose anual aplicada', '2027-06-10'),
 (2,  1, 1, 'banho',       '2026-08-02', 'Banho com tratamento de pele',        NULL),
 (3,  1, 1, 'atendimento', '2026-09-12', 'Consulta de rotina — ausculta e peso normais', NULL),
 (4,  1, 3, 'vacina',      '2026-07-18', 'Antirrábica — válida até 07/2027',    '2027-07-18'),
 (5,  1, 3, 'observação',  '2026-08-20', 'Orientação de dieta: ração light, 2x ao dia', NULL),
 (6,  1, 4, 'atendimento', '2026-09-10', 'Consulta + vacina V4 aplicada',       '2027-09-10'),
 (7,  1, 5, 'observação',  '2026-05-30', 'Avaliação ortopédica — displasia leve, acompanhamento', NULL),
 (8,  1, 5, 'atendimento', '2026-09-12', 'Consulta de acompanhamento ortopédico', NULL),
 (9,  1, 2, 'banho',       '2026-09-12', 'Tosa da raça — higiênica completa',   NULL),
 (10, 1, 6, 'vacina',      '2026-03-14', 'V4 + Antirrábica — reforço em 09/2026', '2026-09-14'),
 (11, 1, 6, 'observação',  '2026-02-01', 'Escovação e revisão de pelos',        NULL);

-- ---------------------------------------------------------------------
-- FORNECEDORES E PRODUTOS
-- ---------------------------------------------------------------------
INSERT INTO fornecedor (id, petshop_id, nome, cnpj, contato, email, telefone) VALUES
 (1, 1, 'Pet Food Distribuidora LTDA',    '12345678000190', 'Sr. Paulo',  'contato@petfood.com.br',      '(11) 3030-1010'),
 (2, 1, 'HigienePet Atacado',              '23456789000101', 'Sra. Ana',   'vendas@higienepet.com.br',    '(11) 3222-2020'),
 (3, 1, 'AgroPet Farmácia Veterinária',    '34567890000112', 'Dr. Ramos',  'contato@agrovet.com.br',      '(11) 3555-3030'),
 (4, 1, 'Acessórios & Cia ME',             '45678901000123', 'Sra. Lima',  'contato@acessorioscia.com.br','(11) 3888-4040');

-- Os produtos NASCEM com saldo zero: o estoque nunca é escrito à mão.
-- Ele é sempre a projeção da trilha `movimentacao_estoque` (RF08), e é a
-- movimentação de 'entrada' abaixo que constrói o saldo inicial.
INSERT INTO produto (id, petshop_id, fornecedor_id, nome, categoria, sku,
                     quantidade_estoque, estoque_minimo, validade, preco) VALUES
 (1, 1, 1, 'Ração Super Premium Cães Adultos 15kg', 'Alimentos',    'RAC-001', 0, 5, '2027-03-10', 189.90),
 (2, 1, 2, 'Shampoo Higienizador Neutro 500ml',     'Higiene',      'HIG-002', 0, 6, '2027-01-20',  32.50),
 (3, 1, 3, 'Antipulgas Simparic 10–20kg',           'Farmácia',     'FAR-003', 0, 4, '2026-10-05',  78.90),
 (4, 1, 3, 'Vermífugo Vermivet Plus 700mg',        'Farmácia',     'FAR-004', 0, 5, '2026-09-25',  45.00),
 (5, 1, 4, 'Brinquedo Bola Maciça G',                'Acessórios',   'ACE-005', 0, 4, NULL,          24.90),
 (6, 1, 4, 'Coleira Peitoral Ajustável M',          'Acessórios',   'ACE-006', 0, 3, NULL,          59.90),
 (7, 1, 2, 'Areia Higiênica Granulada 4kg',          'Higiene',      'HIG-007', 0, 8, NULL,          27.90),
 (8, 1, 1, 'Petisco Dental para Cães 100g',         'Alimentos',    'ALI-008', 0, 6, '2026-11-12',  19.90);

-- Entrada inicial de mercadoria: uma movimentação por produto. É ela que
-- define o saldo (o gatilho trg_movimentar_estoque soma em produto).
INSERT INTO movimentacao_estoque (petshop_id, produto_id, tipo, quantidade, usuario_id, observacao)
VALUES
 (1, 1, 'entrada', 14, 6, 'Carga inicial de demonstração'),
 (1, 2, 'entrada',  3, 6, 'Carga inicial de demonstração'),
 (1, 3, 'entrada',  9, 6, 'Carga inicial de demonstração'),
 (1, 4, 'entrada', 12, 6, 'Carga inicial de demonstração'),
 (1, 5, 'entrada', 20, 6, 'Carga inicial de demonstração'),
 (1, 6, 'entrada',  8, 6, 'Carga inicial de demonstração'),
 (1, 7, 'entrada',  2, 6, 'Carga inicial de demonstração'),
 (1, 8, 'entrada', 25, 6, 'Carga inicial de demonstração');

-- Lotes que dão origem ao saldo atual de estoque.
INSERT INTO lote (petshop_id, produto_id, fornecedor_id, quantidade, custo_unitario, validade)
SELECT 1, p.id, p.fornecedor_id, m.quantidade, round(p.preco * 0.78, 2), p.validade
  FROM produto p
  JOIN movimentacao_estoque m
    ON m.produto_id = p.id AND m.petshop_id = p.petshop_id AND m.tipo = 'entrada';

-- ---------------------------------------------------------------------
-- VENDAS (PDV) — RF10 / RF25 / RF26
-- `status = 'estornada'` exige estornado_em e estornado_por (CHECK + RN11).
-- ---------------------------------------------------------------------
INSERT INTO venda (id, petshop_id, cliente_id, data_hora, valor_total, desconto, status, usuario_id,
                   estornado_em, estornado_por, motivo_estorno) VALUES
 (1001, 1, 1, petplus_para_ts('2026-09-12T09:15'),  64.90,  0.00, 'finalizada', 6, NULL, NULL, NULL),
 (1002, 1, 2, petplus_para_ts('2026-09-12T10:40'), 189.90,  0.00, 'finalizada', 6, NULL, NULL, NULL),
 (1003, 1, 3, petplus_para_ts('2026-09-11T17:05'), 123.90,  0.00, 'estornada',   6,
        petplus_para_ts('2026-09-11T18:00'), 6, 'Produto devolvido pelo cliente'),
 (1004, 1, 4, petplus_para_ts('2026-09-11T11:22'), 105.80,  0.00, 'finalizada', 6, NULL, NULL, NULL),
 (1005, 1, 1, petplus_para_ts('2026-09-11T18:30'),  55.80,  0.00, 'finalizada', 6, NULL, NULL, NULL);

INSERT INTO item_venda (petshop_id, venda_id, produto_id, nome, quantidade, preco_unitario, subtotal) VALUES
 (1, 1001, 5, 'Brinquedo Bola Maciça G',       1, 24.90, 24.90),
 (1, 1001, 8, 'Petisco Dental para Cães 100g',2, 19.90, 39.80),
 (1, 1002, 1, 'Ração Super Premium Cães Adultos 15kg', 1, 189.90, 189.90),
 (1, 1003, 3, 'Antipulgas Simparic 10–20kg',    1, 78.90, 78.90),
 (1, 1003, 4, 'Vermífugo Vermivet Plus 700mg', 1, 45.00, 45.00),
 (1, 1004, 2, 'Shampoo Higienizador Neutro 500ml',  1, 32.50, 32.50),
 (1, 1004, 6, 'Coleira Peitoral Ajustável M',  1, 59.90, 59.90),
 (1, 1005, 8, 'Petisco Dental para Cães 100g',1, 19.90, 19.90),
 (1, 1005, 5, 'Brinquedo Bola Maciça G',       1, 24.90, 24.90);

-- RF25: pagamento combinado (venda 1005 = PIX 30,00 + dinheiro 25,80).
INSERT INTO pagamento (petshop_id, venda_id, forma_pagamento, valor, data_hora) VALUES
 (1, 1001, 'PIX',      64.90,  petplus_para_ts('2026-09-12T09:15')),
 (1, 1002, 'crédito', 189.90, petplus_para_ts('2026-09-12T10:40')),
 (1, 1003, 'débito',  123.90, petplus_para_ts('2026-09-11T17:05')),
 (1, 1004, 'dinheiro', 105.80, petplus_para_ts('2026-09-11T11:22')),
 (1, 1005, 'PIX',       30.00, petplus_para_ts('2026-09-11T18:30')),
 (1, 1005, 'dinheiro',  25.80, petplus_para_ts('2026-09-11T18:30'));

-- ---------------------------------------------------------------------
-- PACOTES / ASSINATURAS (RF29)
-- Catálogo normalizado: 2 planos. As 3 linhas de src/data.ts são
-- assinaturas (mesmo plano, clientes e pets diferentes).
-- ---------------------------------------------------------------------
INSERT INTO pacote_servico (id, petshop_id, nome, periodicidade, preco) VALUES
 (1, 1, 'Plano Banho & Tosa Mensal', 'Mensal', 120.00),
 (2, 1, 'Plano Saúde Filhote',       'Mensal',  99.00);

INSERT INTO pacote_servico_item (pacote_id, servico_id, petshop_id) VALUES
 (1, 2, 1), (1, 1, 1),   -- Plano Banho & Tosa: Banho Simples + Tosa Higiênica
 (2, 4, 1), (2, 2, 1);   -- Plano Saúde Filhote: Consulta + Banho Simples

INSERT INTO assinatura_pacote (id, petshop_id, pacote_id, cliente_id, pet_id, status, iniciada_em, encerrada_em) VALUES
 (1, 1, 1, 1, 1, 'ativo',     '2026-07-15T09:00:00', NULL),
 (2, 1, 2, 2, 3, 'ativo',     '2026-08-01T09:00:00', NULL),
 (3, 1, 1, 3, 4, 'cancelado', '2026-06-10T09:00:00', '2026-08-20T09:00:00');

-- ---------------------------------------------------------------------
-- AVALIAÇÕES (RF28)
-- ---------------------------------------------------------------------
INSERT INTO avaliacao (id, petshop_id, agendamento_id, cliente_id, nota, comentario, data) VALUES
 (1, 1, 4, 1, 5, 'Mimi saiu linda! Atendimento nota 10.',              petplus_para_ts('2026-09-12T16:30')),
 (2, 1, 5, 3, 4, 'Muito bom, mas achei um pouco demorado.',            petplus_para_ts('2026-09-10T11:00'));

-- ---------------------------------------------------------------------
-- NOTIFICAÇÕES (RF12 / RF13 / RF22)
-- ---------------------------------------------------------------------
INSERT INTO notificacao (id, petshop_id, usuario_id, canal, tipo, destinatario, mensagem, agendamento_id, data_envio, lida) VALUES
 (1, 1, 1, 'e-mail', 'lembrete_agendamento', 'cliente@petplus.com',
     'Lembrete: Banho e Tosa do Bolinha amanhã (12/09) às 09:00.', 1, petplus_para_ts('2026-09-11T09:00'), true),
 (2, 1, 1, 'push',   'vacina_proxima', 'Ana Beatriz Souza',
     'Vacina V4 do Mimi vence em 15 dias. Agende o reforço!', 2, petplus_para_ts('2026-09-10T08:00'), false),
 (3, 1, 3, 'e-mail', 'retorno', 'fer.ribeiro@email.com',
     'Está na hora do banho do Pipoca! Agende o retorno.', 5, petplus_para_ts('2026-09-10T10:00'), false),
 (4, 1, 4, 'e-mail', 'lembrete_agendamento', 'jp.martins@email.com',
     'Lembrete: Consulta do Rex hoje às 14:00.', 3, petplus_para_ts('2026-09-12T07:00'), false),
 (5, 1, 2, 'push',   'pacote_renovado', 'Carlos Eduardo Lima',
     'Seu pacote Plano Saúde Filhote foi renovado com sucesso.', 2, petplus_para_ts('2026-09-01T09:00'), true);

-- ---------------------------------------------------------------------
-- RELATÓRIOS (RF27)
-- ---------------------------------------------------------------------
INSERT INTO relatorio (id, petshop_id, tipo, formato, periodo, usuario_id, data_geracao) VALUES
 (1, 1, 'vendas',       'PDF',   '01/09/2026 – 12/09/2026', 6, petplus_para_ts('2026-09-12T08:30')),
 (2, 1, 'agendamentos', 'Excel', 'Setembro/2026',           6, petplus_para_ts('2026-09-08T14:00')),
 (3, 1, 'estoque',      'CSV',   'Setembro/2026',           6, petplus_para_ts('2026-09-01T09:00'));

-- Sequências: os ids explícitos acima não avançam os sequences.
SELECT setval(pg_get_serial_sequence('petshop','id'),           (SELECT max(id) FROM petshop));
SELECT setval(pg_get_serial_sequence('usuario','id'),           (SELECT max(id) FROM usuario));
SELECT setval(pg_get_serial_sequence('pet','id'),               (SELECT max(id) FROM pet));
SELECT setval(pg_get_serial_sequence('servico','id'),           (SELECT max(id) FROM servico));
SELECT setval(pg_get_serial_sequence('agendamento','id'),       (SELECT max(id) FROM agendamento));
SELECT setval(pg_get_serial_sequence('bloqueio_agenda','id'),   (SELECT max(id) FROM bloqueio_agenda));
SELECT setval(pg_get_serial_sequence('registro_saude','id'),    (SELECT max(id) FROM registro_saude));
SELECT setval(pg_get_serial_sequence('fornecedor','id'),        (SELECT max(id) FROM fornecedor));
SELECT setval(pg_get_serial_sequence('produto','id'),           (SELECT max(id) FROM produto));
SELECT setval(pg_get_serial_sequence('venda','id'),             (SELECT max(id) FROM venda));
SELECT setval(pg_get_serial_sequence('pacote_servico','id'),    (SELECT max(id) FROM pacote_servico));
SELECT setval(pg_get_serial_sequence('assinatura_pacote','id'), (SELECT max(id) FROM assinatura_pacote));
SELECT setval(pg_get_serial_sequence('avaliacao','id'),         (SELECT max(id) FROM avaliacao));
SELECT setval(pg_get_serial_sequence('notificacao','id'),       (SELECT max(id) FROM notificacao));
SELECT setval(pg_get_serial_sequence('relatorio','id'),         (SELECT max(id) FROM relatorio));

COMMIT;

-- Sanidade: os alertas de estoque mínimo (RN05) e validade (RN09) devem
-- refletir o que o protótipo já exibia.
SELECT 'estoque_minimo' AS alerta, count(*) AS itens FROM vw_alerta_estoque_minimo
UNION ALL
SELECT 'validade', count(*) FROM vw_alerta_validade;