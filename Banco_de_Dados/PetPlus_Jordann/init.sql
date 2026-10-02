-- Tabela de Tutores / Clientes
CREATE TABLE IF NOT EXISTS tutores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20),
  email VARCHAR(100)
);

-- Tabela de Pets
CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  especie VARCHAR(50) NOT NULL,
  raca VARCHAR(100),
  idade INT,
  tutor_id INT REFERENCES tutores(id) ON DELETE CASCADE
);

-- Tabela de Agendamentos (banho, tosa, vacina)
CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY,
  pet_id INT REFERENCES pets(id) ON DELETE CASCADE,
  servico VARCHAR(100) NOT NULL,
  data_hora TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente'
);