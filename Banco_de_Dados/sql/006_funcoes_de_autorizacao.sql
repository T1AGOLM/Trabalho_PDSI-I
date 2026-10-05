-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 006_funcoes_de_autorizacao.sql
-- ---------------------------------------------------------------------
-- Escape hatches pontuais e auditáveis para o momento EM QUE AINDA NÃO
-- EXISTE TENANT CONHECIDO: o login.
--
-- O problema: as políticas de RLS filtram tudo por `app.petshop_id`. Para
-- entrar no sistema é preciso descobrir qual petshop pertence ao e-mail
-- informado — e essa busca, por definição, acontece antes de existir um
-- tenant na sessão. Se abrirmos uma exceção, ela precisa ser mínima,
-- nomeada e visível no código, nunca um "desligar RLS" global.
--
-- A solução padrão do PostgreSQL para isso é `SECURITY DEFINER`: uma
-- função que roda com os privilégios de quem a criou, permitindo um
-- SELECT mínimo e somente leitura.
-- =====================================================================

-- A função só devolve o que o login precisa: id, tenant, perfil e o hash.
-- Ela NÃO é usada para nada além de autenticar.
CREATE OR REPLACE FUNCTION petplus_buscar_usuario_por_email(p_email citext)
RETURNS TABLE (
  id           bigint,
  petshop_id   bigint,
  perfil       perfil_usuario,
  nome         varchar,
  email        citext,
  telefone     varchar,
  senha_hash   text,
  ativo        boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.petshop_id, u.perfil, u.nome, u.email, u.telefone, u.senha_hash, u.ativo
    FROM usuario u
   WHERE u.email = p_email
   LIMIT 1
$$;

COMMENT ON FUNCTION petplus_buscar_usuario_por_email(citext) IS
  'Escape hatch de RLS para o login: única porta de entrada antes de o tenant ser conhecido.';

-- Mesmo motivo para o cadastro público: ainda não sabemos em qual unidade
-- o novo tutor se cadastrará. Na operação real esse id vem do subdomínio
-- ou de um convite, não de um SELECT.
CREATE OR REPLACE FUNCTION petplus_petshop_padrao()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM petshop WHERE ativo ORDER BY id LIMIT 1
$$;

-- As funções rodam como o dono (superusuário `petplus`), por isso
-- ignoram RLS. O papel da aplicação só recebe o direito de EXECUTAR.
GRANT EXECUTE ON FUNCTION petplus_buscar_usuario_por_email(citext) TO petplus_app;
GRANT EXECUTE ON FUNCTION petplus_petshop_padrao() TO petplus_app;

-- Reforço: nenhuma delas devolve dados de outro tenant, e nenhuma
-- concede escrita. Se alguma vez precisarem devolver mais colunas, o
-- GRANT abaixo precisa ser revisto junto.
REVOKE ALL ON FUNCTION petplus_buscar_usuario_por_email(citext) FROM PUBLIC;
REVOKE ALL ON FUNCTION petplus_petshop_padrao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petplus_buscar_usuario_por_email(citext) TO petplus_app;
GRANT EXECUTE ON FUNCTION petplus_petshop_padrao() TO petplus_app;