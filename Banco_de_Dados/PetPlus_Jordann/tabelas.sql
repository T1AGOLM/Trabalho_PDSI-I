-- Apaga tudo se já existir (pra começar limpo)
DROP TABLE IF EXISTS agendamentos;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS tutores;
DROP TABLE IF EXISTS servicos;

-- 1. Tutores
CREATE TABLE tutores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20),
  email VARCHAR(100),
  endereco VARCHAR(200),
  criado_em TIMESTAMP DEFAULT NOW()
);

-- 2. Pets
CREATE TABLE pets (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  especie VARCHAR(50) NOT NULL,
  raca VARCHAR(100),
  idade INT,
  peso DECIMAL(5,2),
  tutor_id INT REFERENCES tutores(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- 3. Serviços (Banho, Tosa, Vacina)
CREATE TABLE servicos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  preco DECIMAL(10,2) NOT NULL,
  duracao_min INT DEFAULT 60,
  descricao TEXT
);

-- 4. Agendamentos
CREATE TABLE agendamentos (
  id SERIAL PRIMARY KEY,
  pet_id INT REFERENCES pets(id) ON DELETE CASCADE,
  servico_id INT REFERENCES servicos(id),
  data_agendada DATE NOT NULL,
  hora_agendada TIME NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente',
  observacoes TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

-- Inserir serviços padrão
INSERT INTO servicos (nome, preco, duracao_min) VALUES
('Banho', 40.00, 60),
('Tosa', 50.00, 90),
('Banho e Tosa', 80.00, 120),
('Vacinação', 100.00, 30),
('Consulta', 120.00, 60);

SELECT 'TABELAS CRIADAS COM SUCESSO!' as status;