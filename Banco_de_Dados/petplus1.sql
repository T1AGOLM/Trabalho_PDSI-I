--
-- PostgreSQL database cluster dump
--

-- Started on 2026-10-01 15:29:41

\restrict H1lX3jQEdM1L4wWPwmXtJecRRTBSE33VRz5amXilli7rxnBvNbfyUsoQiIw3qp4

SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

--
-- Roles
--

CREATE ROLE postgres;
ALTER ROLE postgres WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD 'SCRAM-SHA-256$4096:5WPMxxW12GRaCNW3xKo52A==$DB0jphEOdnNygtX4IHi/gY/3YD1bIqHFinYW6BXriuE=:CaG1Ox/jIwvC45GdTob9k0NTxm4SuUgElLt+CEL0cOE=';

--
-- User Configurations
--








\unrestrict H1lX3jQEdM1L4wWPwmXtJecRRTBSE33VRz5amXilli7rxnBvNbfyUsoQiIw3qp4

--
-- Databases
--

--
-- Database "template1" dump
--

\connect template1

--
-- PostgreSQL database dump
--

\restrict vfVdSl9E9OqB8JJJtMbA2YD7PMfh3Ay7gkwjeWAWoLsKacX1o9jYc82A2TbMEjp

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

-- Started on 2026-10-01 15:29:42

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Completed on 2026-10-01 15:29:45

--
-- PostgreSQL database dump complete
--

\unrestrict vfVdSl9E9OqB8JJJtMbA2YD7PMfh3Ay7gkwjeWAWoLsKacX1o9jYc82A2TbMEjp

--
-- Database "petplus" dump
--

--
-- PostgreSQL database dump
--

\restrict DJP29a6Kw76Alpx0eF0xUMNNCaMztwf9IHxJbgAmuHrAkaR19n69MYqaDMhMtRb

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

-- Started on 2026-10-01 15:29:45

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5072 (class 1262 OID 16386)
-- Name: petplus; Type: DATABASE; Schema: -; Owner: postgres
--

CREATE DATABASE petplus WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'Portuguese_Brazil.1252';


ALTER DATABASE petplus OWNER TO postgres;

\unrestrict DJP29a6Kw76Alpx0eF0xUMNNCaMztwf9IHxJbgAmuHrAkaR19n69MYqaDMhMtRb
\connect petplus
\restrict DJP29a6Kw76Alpx0eF0xUMNNCaMztwf9IHxJbgAmuHrAkaR19n69MYqaDMhMtRb

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 238 (class 1259 OID 16876)
-- Name: agendamento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agendamento (
    id_agendamento bigint NOT NULL,
    id_petshop bigint NOT NULL,
    id_pet bigint NOT NULL,
    id_servico bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    data_hora_inicio timestamp without time zone NOT NULL,
    data_hora_fim timestamp without time zone NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    observacoes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    CONSTRAINT agendamento_check CHECK ((data_hora_fim > data_hora_inicio)),
    CONSTRAINT agendamento_status_check CHECK (((status)::text = ANY ((ARRAY['em_andamento'::character varying, 'cancelado'::character varying, 'concluido'::character varying, 'confirmado'::character varying, 'pendente'::character varying])::text[])))
);


ALTER TABLE public.agendamento OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16875)
-- Name: agendamento_id_agendamento_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.agendamento_id_agendamento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agendamento_id_agendamento_seq OWNER TO postgres;

--
-- TOC entry 5073 (class 0 OID 0)
-- Dependencies: 237
-- Name: agendamento_id_agendamento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.agendamento_id_agendamento_seq OWNED BY public.agendamento.id_agendamento;


--
-- TOC entry 240 (class 1259 OID 16889)
-- Name: bloqueio_agenda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bloqueio_agenda (
    id_bloqueio bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    data_hora_inicio timestamp without time zone NOT NULL,
    data_hora_fim timestamp without time zone NOT NULL,
    motivo character varying(100),
    CONSTRAINT bloqueio_agenda_check CHECK ((data_hora_fim > data_hora_inicio))
);


ALTER TABLE public.bloqueio_agenda OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 16888)
-- Name: bloqueio_agenda_id_bloqueio_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bloqueio_agenda_id_bloqueio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bloqueio_agenda_id_bloqueio_seq OWNER TO postgres;

--
-- TOC entry 5074 (class 0 OID 0)
-- Dependencies: 239
-- Name: bloqueio_agenda_id_bloqueio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bloqueio_agenda_id_bloqueio_seq OWNED BY public.bloqueio_agenda.id_bloqueio;


--
-- TOC entry 224 (class 1259 OID 16789)
-- Name: categoria_produto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categoria_produto (
    id_categoria bigint NOT NULL,
    id_petshop bigint NOT NULL,
    nome character varying(100) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL
);


ALTER TABLE public.categoria_produto OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16788)
-- Name: categoria_produto_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categoria_produto_id_categoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categoria_produto_id_categoria_seq OWNER TO postgres;

--
-- TOC entry 5075 (class 0 OID 0)
-- Dependencies: 223
-- Name: categoria_produto_id_categoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categoria_produto_id_categoria_seq OWNED BY public.categoria_produto.id_categoria;


--
-- TOC entry 228 (class 1259 OID 16810)
-- Name: cliente; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cliente (
    id_cliente bigint NOT NULL,
    id_usuario bigint NOT NULL,
    id_petshop bigint NOT NULL,
    nome character varying(100) NOT NULL,
    telefone character varying(20),
    email character varying(100),
    endereco text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.cliente OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16809)
-- Name: cliente_id_cliente_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cliente_id_cliente_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cliente_id_cliente_seq OWNER TO postgres;

--
-- TOC entry 5076 (class 0 OID 0)
-- Dependencies: 227
-- Name: cliente_id_cliente_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cliente_id_cliente_seq OWNED BY public.cliente.id_cliente;


--
-- TOC entry 230 (class 1259 OID 16823)
-- Name: colaborador; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colaborador (
    id_colaborador bigint NOT NULL,
    id_usuario bigint NOT NULL,
    id_petshop bigint NOT NULL,
    nome character varying(100) NOT NULL,
    tipo character varying(30),
    telefone character varying(20),
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.colaborador OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16822)
-- Name: colaborador_id_colaborador_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.colaborador_id_colaborador_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.colaborador_id_colaborador_seq OWNER TO postgres;

--
-- TOC entry 5077 (class 0 OID 0)
-- Dependencies: 229
-- Name: colaborador_id_colaborador_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.colaborador_id_colaborador_seq OWNED BY public.colaborador.id_colaborador;


--
-- TOC entry 242 (class 1259 OID 16897)
-- Name: disponibilidade_colaborador; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.disponibilidade_colaborador (
    id_disponibilidade bigint NOT NULL,
    id_colaborador bigint NOT NULL,
    dia_semana character varying(10) NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fim time without time zone NOT NULL,
    CONSTRAINT disponibilidade_colaborador_check CHECK ((hora_fim > hora_inicio)),
    CONSTRAINT disponibilidade_colaborador_dia_semana_check CHECK (((dia_semana)::text = ANY ((ARRAY['domingo'::character varying, 'sabado'::character varying, 'sexta'::character varying, 'quinta'::character varying, 'quarta'::character varying, 'terca'::character varying, 'segunda'::character varying])::text[])))
);


ALTER TABLE public.disponibilidade_colaborador OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 16896)
-- Name: disponibilidade_colaborador_id_disponibilidade_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.disponibilidade_colaborador_id_disponibilidade_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.disponibilidade_colaborador_id_disponibilidade_seq OWNER TO postgres;

--
-- TOC entry 5078 (class 0 OID 0)
-- Dependencies: 241
-- Name: disponibilidade_colaborador_id_disponibilidade_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.disponibilidade_colaborador_id_disponibilidade_seq OWNED BY public.disponibilidade_colaborador.id_disponibilidade;


--
-- TOC entry 226 (class 1259 OID 16799)
-- Name: fornecedor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fornecedor (
    id_fornecedor bigint NOT NULL,
    id_petshop bigint NOT NULL,
    nome character varying(150) NOT NULL,
    cnpj character varying(18),
    telefone character varying(20),
    email character varying(100),
    endereco text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fornecedor OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16798)
-- Name: fornecedor_id_fornecedor_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fornecedor_id_fornecedor_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.fornecedor_id_fornecedor_seq OWNER TO postgres;

--
-- TOC entry 5079 (class 0 OID 0)
-- Dependencies: 225
-- Name: fornecedor_id_fornecedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fornecedor_id_fornecedor_seq OWNED BY public.fornecedor.id_fornecedor;


--
-- TOC entry 244 (class 1259 OID 16906)
-- Name: historico_pet; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.historico_pet (
    id_historico bigint NOT NULL,
    id_pet bigint NOT NULL,
    id_colaborador bigint,
    tipo character varying(50) NOT NULL,
    descricao text NOT NULL,
    data_registro timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.historico_pet OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 16905)
-- Name: historico_pet_id_historico_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.historico_pet_id_historico_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.historico_pet_id_historico_seq OWNER TO postgres;

--
-- TOC entry 5080 (class 0 OID 0)
-- Dependencies: 243
-- Name: historico_pet_id_historico_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.historico_pet_id_historico_seq OWNED BY public.historico_pet.id_historico;


--
-- TOC entry 248 (class 1259 OID 16931)
-- Name: item_venda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_venda (
    id_item_venda bigint NOT NULL,
    id_venda bigint NOT NULL,
    id_produto bigint NOT NULL,
    quantidade integer NOT NULL,
    preco_unitario numeric(10,2) NOT NULL,
    CONSTRAINT item_venda_preco_unitario_check CHECK ((preco_unitario >= (0)::numeric)),
    CONSTRAINT item_venda_quantidade_check CHECK ((quantidade > 0))
);


ALTER TABLE public.item_venda OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 16930)
-- Name: item_venda_id_item_venda_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.item_venda_id_item_venda_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.item_venda_id_item_venda_seq OWNER TO postgres;

--
-- TOC entry 5081 (class 0 OID 0)
-- Dependencies: 247
-- Name: item_venda_id_item_venda_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.item_venda_id_item_venda_seq OWNED BY public.item_venda.id_item_venda;


--
-- TOC entry 250 (class 1259 OID 16940)
-- Name: movimentacao_estoque; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movimentacao_estoque (
    id_movimentacao bigint NOT NULL,
    id_produto bigint NOT NULL,
    tipo character varying(10) NOT NULL,
    quantidade integer NOT NULL,
    motivo character varying(150),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT movimentacao_estoque_quantidade_check CHECK ((quantidade > 0)),
    CONSTRAINT movimentacao_estoque_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['saida'::character varying, 'entrada'::character varying])::text[])))
);


ALTER TABLE public.movimentacao_estoque OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 16939)
-- Name: movimentacao_estoque_id_movimentacao_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.movimentacao_estoque_id_movimentacao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.movimentacao_estoque_id_movimentacao_seq OWNER TO postgres;

--
-- TOC entry 5082 (class 0 OID 0)
-- Dependencies: 249
-- Name: movimentacao_estoque_id_movimentacao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.movimentacao_estoque_id_movimentacao_seq OWNED BY public.movimentacao_estoque.id_movimentacao;


--
-- TOC entry 252 (class 1259 OID 16950)
-- Name: notificacao; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notificacao (
    id_notificacao bigint NOT NULL,
    id_usuario bigint NOT NULL,
    titulo character varying(150) NOT NULL,
    mensagem text NOT NULL,
    tipo character varying(50) NOT NULL,
    lida boolean DEFAULT false NOT NULL,
    data_leitura timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notificacao OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 16949)
-- Name: notificacao_id_notificacao_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notificacao_id_notificacao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notificacao_id_notificacao_seq OWNER TO postgres;

--
-- TOC entry 5083 (class 0 OID 0)
-- Dependencies: 251
-- Name: notificacao_id_notificacao_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notificacao_id_notificacao_seq OWNED BY public.notificacao.id_notificacao;


--
-- TOC entry 254 (class 1259 OID 16961)
-- Name: pagamento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagamento (
    id_pagamento bigint NOT NULL,
    id_venda bigint NOT NULL,
    valor numeric(10,2) NOT NULL,
    forma_pagamento character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    data_pagamento timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT pagamento_forma_pagamento_check CHECK (((forma_pagamento)::text = ANY ((ARRAY['transferencia'::character varying, 'debito'::character varying, 'credito'::character varying, 'pix'::character varying, 'dinheiro'::character varying])::text[]))),
    CONSTRAINT pagamento_status_check CHECK (((status)::text = ANY ((ARRAY['estornado'::character varying, 'recusado'::character varying, 'aprovado'::character varying, 'pendente'::character varying])::text[]))),
    CONSTRAINT pagamento_valor_check CHECK ((valor > (0)::numeric))
);


ALTER TABLE public.pagamento OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 16960)
-- Name: pagamento_id_pagamento_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagamento_id_pagamento_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagamento_id_pagamento_seq OWNER TO postgres;

--
-- TOC entry 5084 (class 0 OID 0)
-- Dependencies: 253
-- Name: pagamento_id_pagamento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagamento_id_pagamento_seq OWNED BY public.pagamento.id_pagamento;


--
-- TOC entry 218 (class 1259 OID 16762)
-- Name: perfil; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.perfil (
    id_perfil bigint NOT NULL,
    nome character varying(50) NOT NULL
);


ALTER TABLE public.perfil OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16761)
-- Name: perfil_id_perfil_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.perfil_id_perfil_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.perfil_id_perfil_seq OWNER TO postgres;

--
-- TOC entry 5085 (class 0 OID 0)
-- Dependencies: 217
-- Name: perfil_id_perfil_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.perfil_id_perfil_seq OWNED BY public.perfil.id_perfil;


--
-- TOC entry 232 (class 1259 OID 16834)
-- Name: pet; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pet (
    id_pet bigint NOT NULL,
    id_cliente bigint NOT NULL,
    nome character varying(100) NOT NULL,
    especie character varying(50) NOT NULL,
    raca character varying(100),
    porte character varying(20),
    data_nascimento date,
    observacoes_saude text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.pet OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16833)
-- Name: pet_id_pet_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pet_id_pet_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pet_id_pet_seq OWNER TO postgres;

--
-- TOC entry 5086 (class 0 OID 0)
-- Dependencies: 231
-- Name: pet_id_pet_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pet_id_pet_seq OWNED BY public.pet.id_pet;


--
-- TOC entry 220 (class 1259 OID 16769)
-- Name: petshop; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.petshop (
    id_petshop bigint NOT NULL,
    razao_social character varying(100) NOT NULL,
    nome_fantasia character varying(100) NOT NULL,
    cnpj character varying(18),
    telefone character varying(20),
    email character varying(100),
    endereco text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.petshop OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16768)
-- Name: petshop_id_petshop_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.petshop_id_petshop_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.petshop_id_petshop_seq OWNER TO postgres;

--
-- TOC entry 5087 (class 0 OID 0)
-- Dependencies: 219
-- Name: petshop_id_petshop_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.petshop_id_petshop_seq OWNED BY public.petshop.id_petshop;


--
-- TOC entry 236 (class 1259 OID 16858)
-- Name: produto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.produto (
    id_produto bigint NOT NULL,
    id_petshop bigint NOT NULL,
    id_categoria bigint NOT NULL,
    id_fornecedor bigint,
    nome character varying(150) NOT NULL,
    descricao text,
    codigo_barras character varying(50),
    preco_custo numeric(10,2) DEFAULT 0 NOT NULL,
    preco_venda numeric(10,2) NOT NULL,
    quantidade_estoque integer DEFAULT 0 NOT NULL,
    estoque_minimo integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    CONSTRAINT produto_estoque_minimo_check CHECK ((estoque_minimo >= 0)),
    CONSTRAINT produto_preco_custo_check CHECK ((preco_custo >= (0)::numeric)),
    CONSTRAINT produto_preco_venda_check CHECK ((preco_venda >= (0)::numeric)),
    CONSTRAINT produto_quantidade_estoque_check CHECK ((quantidade_estoque >= 0))
);


ALTER TABLE public.produto OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16857)
-- Name: produto_id_produto_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.produto_id_produto_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.produto_id_produto_seq OWNER TO postgres;

--
-- TOC entry 5088 (class 0 OID 0)
-- Dependencies: 235
-- Name: produto_id_produto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.produto_id_produto_seq OWNED BY public.produto.id_produto;


--
-- TOC entry 234 (class 1259 OID 16845)
-- Name: servico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.servico (
    id_servico bigint NOT NULL,
    id_petshop bigint NOT NULL,
    nome character varying(100) NOT NULL,
    descricao text,
    duracao_minutos integer NOT NULL,
    preco numeric(10,2) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT servico_duracao_minutos_check CHECK ((duracao_minutos > 0)),
    CONSTRAINT servico_preco_check CHECK ((preco >= (0)::numeric))
);


ALTER TABLE public.servico OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16844)
-- Name: servico_id_servico_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.servico_id_servico_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.servico_id_servico_seq OWNER TO postgres;

--
-- TOC entry 5089 (class 0 OID 0)
-- Dependencies: 233
-- Name: servico_id_servico_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.servico_id_servico_seq OWNED BY public.servico.id_servico;


--
-- TOC entry 255 (class 1259 OID 16972)
-- Name: servico_produto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.servico_produto (
    id_servico bigint NOT NULL,
    id_produto bigint NOT NULL,
    quantidade numeric(10,3) DEFAULT 1 NOT NULL,
    CONSTRAINT servico_produto_quantidade_check CHECK ((quantidade > (0)::numeric))
);


ALTER TABLE public.servico_produto OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 16780)
-- Name: usuario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuario (
    id_usuario bigint NOT NULL,
    id_petshop bigint NOT NULL,
    id_perfil bigint NOT NULL,
    email character varying(100) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.usuario OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16779)
-- Name: usuario_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuario_id_usuario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuario_id_usuario_seq OWNER TO postgres;

--
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 221
-- Name: usuario_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuario_id_usuario_seq OWNED BY public.usuario.id_usuario;


--
-- TOC entry 246 (class 1259 OID 16917)
-- Name: venda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venda (
    id_venda bigint NOT NULL,
    id_petshop bigint NOT NULL,
    id_cliente bigint,
    id_usuario bigint NOT NULL,
    data_venda timestamp without time zone DEFAULT now() NOT NULL,
    valor_total numeric(10,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    observacoes text,
    CONSTRAINT venda_status_check CHECK (((status)::text = ANY ((ARRAY['cancelada'::character varying, 'concluida'::character varying, 'pendente'::character varying])::text[]))),
    CONSTRAINT venda_valor_total_check CHECK ((valor_total >= (0)::numeric))
);


ALTER TABLE public.venda OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 16916)
-- Name: venda_id_venda_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.venda_id_venda_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.venda_id_venda_seq OWNER TO postgres;

--
-- TOC entry 5091 (class 0 OID 0)
-- Dependencies: 245
-- Name: venda_id_venda_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.venda_id_venda_seq OWNED BY public.venda.id_venda;


--
-- TOC entry 4765 (class 2604 OID 16879)
-- Name: agendamento id_agendamento; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento ALTER COLUMN id_agendamento SET DEFAULT nextval('public.agendamento_id_agendamento_seq'::regclass);


--
-- TOC entry 4768 (class 2604 OID 16892)
-- Name: bloqueio_agenda id_bloqueio; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bloqueio_agenda ALTER COLUMN id_bloqueio SET DEFAULT nextval('public.bloqueio_agenda_id_bloqueio_seq'::regclass);


--
-- TOC entry 4742 (class 2604 OID 16792)
-- Name: categoria_produto id_categoria; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categoria_produto ALTER COLUMN id_categoria SET DEFAULT nextval('public.categoria_produto_id_categoria_seq'::regclass);


--
-- TOC entry 4747 (class 2604 OID 16813)
-- Name: cliente id_cliente; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente ALTER COLUMN id_cliente SET DEFAULT nextval('public.cliente_id_cliente_seq'::regclass);


--
-- TOC entry 4750 (class 2604 OID 16826)
-- Name: colaborador id_colaborador; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colaborador ALTER COLUMN id_colaborador SET DEFAULT nextval('public.colaborador_id_colaborador_seq'::regclass);


--
-- TOC entry 4769 (class 2604 OID 16900)
-- Name: disponibilidade_colaborador id_disponibilidade; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilidade_colaborador ALTER COLUMN id_disponibilidade SET DEFAULT nextval('public.disponibilidade_colaborador_id_disponibilidade_seq'::regclass);


--
-- TOC entry 4744 (class 2604 OID 16802)
-- Name: fornecedor id_fornecedor; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor ALTER COLUMN id_fornecedor SET DEFAULT nextval('public.fornecedor_id_fornecedor_seq'::regclass);


--
-- TOC entry 4770 (class 2604 OID 16909)
-- Name: historico_pet id_historico; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historico_pet ALTER COLUMN id_historico SET DEFAULT nextval('public.historico_pet_id_historico_seq'::regclass);


--
-- TOC entry 4777 (class 2604 OID 16934)
-- Name: item_venda id_item_venda; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_venda ALTER COLUMN id_item_venda SET DEFAULT nextval('public.item_venda_id_item_venda_seq'::regclass);


--
-- TOC entry 4778 (class 2604 OID 16943)
-- Name: movimentacao_estoque id_movimentacao; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movimentacao_estoque ALTER COLUMN id_movimentacao SET DEFAULT nextval('public.movimentacao_estoque_id_movimentacao_seq'::regclass);


--
-- TOC entry 4780 (class 2604 OID 16953)
-- Name: notificacao id_notificacao; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacao ALTER COLUMN id_notificacao SET DEFAULT nextval('public.notificacao_id_notificacao_seq'::regclass);


--
-- TOC entry 4783 (class 2604 OID 16964)
-- Name: pagamento id_pagamento; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamento ALTER COLUMN id_pagamento SET DEFAULT nextval('public.pagamento_id_pagamento_seq'::regclass);


--
-- TOC entry 4735 (class 2604 OID 16765)
-- Name: perfil id_perfil; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.perfil ALTER COLUMN id_perfil SET DEFAULT nextval('public.perfil_id_perfil_seq'::regclass);


--
-- TOC entry 4753 (class 2604 OID 16837)
-- Name: pet id_pet; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pet ALTER COLUMN id_pet SET DEFAULT nextval('public.pet_id_pet_seq'::regclass);


--
-- TOC entry 4736 (class 2604 OID 16772)
-- Name: petshop id_petshop; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petshop ALTER COLUMN id_petshop SET DEFAULT nextval('public.petshop_id_petshop_seq'::regclass);


--
-- TOC entry 4759 (class 2604 OID 16861)
-- Name: produto id_produto; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produto ALTER COLUMN id_produto SET DEFAULT nextval('public.produto_id_produto_seq'::regclass);


--
-- TOC entry 4756 (class 2604 OID 16848)
-- Name: servico id_servico; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico ALTER COLUMN id_servico SET DEFAULT nextval('public.servico_id_servico_seq'::regclass);


--
-- TOC entry 4739 (class 2604 OID 16783)
-- Name: usuario id_usuario; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuario_id_usuario_seq'::regclass);


--
-- TOC entry 4773 (class 2604 OID 16920)
-- Name: venda id_venda; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda ALTER COLUMN id_venda SET DEFAULT nextval('public.venda_id_venda_seq'::regclass);


--
-- TOC entry 5049 (class 0 OID 16876)
-- Dependencies: 238
-- Data for Name: agendamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agendamento (id_agendamento, id_petshop, id_pet, id_servico, id_colaborador, data_hora_inicio, data_hora_fim, status, observacoes, created_at, updated_at) FROM stdin;
1	1	1	1	2	2026-10-02 15:06:24.050481	2026-10-02 16:06:24.050481	confirmado	\N	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5051 (class 0 OID 16889)
-- Dependencies: 240
-- Data for Name: bloqueio_agenda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bloqueio_agenda (id_bloqueio, id_colaborador, data_hora_inicio, data_hora_fim, motivo) FROM stdin;
\.


--
-- TOC entry 5035 (class 0 OID 16789)
-- Dependencies: 224
-- Data for Name: categoria_produto; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categoria_produto (id_categoria, id_petshop, nome, descricao, ativo) FROM stdin;
1	1	Rações	Rações para cães e gatos	t
2	1	Medicamentos	Vermífugos, antibióticos	t
3	1	Higiene	Shampoo, perfumes	t
\.


--
-- TOC entry 5039 (class 0 OID 16810)
-- Dependencies: 228
-- Data for Name: cliente; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cliente (id_cliente, id_usuario, id_petshop, nome, telefone, email, endereco, ativo, created_at, updated_at) FROM stdin;
1	3	1	João Silva	(89) 99911-2233	joao@email.com	\N	t	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5041 (class 0 OID 16823)
-- Dependencies: 230
-- Data for Name: colaborador; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.colaborador (id_colaborador, id_usuario, id_petshop, nome, tipo, telefone, ativo, created_at, updated_at) FROM stdin;
1	2	1	Dra. Ana Veterinária	veterinario	(89) 99922-3344	t	2026-10-01 15:06:24.050481	\N
2	4	1	Carlos Tosador	tosador	(89) 99933-4455	t	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5053 (class 0 OID 16897)
-- Dependencies: 242
-- Data for Name: disponibilidade_colaborador; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.disponibilidade_colaborador (id_disponibilidade, id_colaborador, dia_semana, hora_inicio, hora_fim) FROM stdin;
1	1	segunda	08:00:00	18:00:00
2	1	terca	08:00:00	18:00:00
3	2	segunda	08:00:00	12:00:00
\.


--
-- TOC entry 5037 (class 0 OID 16799)
-- Dependencies: 226
-- Data for Name: fornecedor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fornecedor (id_fornecedor, id_petshop, nome, cnpj, telefone, email, endereco, ativo, created_at) FROM stdin;
1	1	Distribuidora Pet Nordeste	98.765.432/0001-10	(86) 98888-8888	\N	\N	t	2026-10-01 15:06:24.050481
\.


--
-- TOC entry 5055 (class 0 OID 16906)
-- Dependencies: 244
-- Data for Name: historico_pet; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.historico_pet (id_historico, id_pet, id_colaborador, tipo, descricao, data_registro, created_at) FROM stdin;
\.


--
-- TOC entry 5059 (class 0 OID 16931)
-- Dependencies: 248
-- Data for Name: item_venda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.item_venda (id_item_venda, id_venda, id_produto, quantidade, preco_unitario) FROM stdin;
1	1	1	1	135.00
2	1	3	1	25.00
\.


--
-- TOC entry 5061 (class 0 OID 16940)
-- Dependencies: 250
-- Data for Name: movimentacao_estoque; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.movimentacao_estoque (id_movimentacao, id_produto, tipo, quantidade, motivo, created_at) FROM stdin;
\.


--
-- TOC entry 5063 (class 0 OID 16950)
-- Dependencies: 252
-- Data for Name: notificacao; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notificacao (id_notificacao, id_usuario, titulo, mensagem, tipo, lida, data_leitura, created_at) FROM stdin;
\.


--
-- TOC entry 5065 (class 0 OID 16961)
-- Dependencies: 254
-- Data for Name: pagamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagamento (id_pagamento, id_venda, valor, forma_pagamento, status, data_pagamento, created_at) FROM stdin;
1	1	160.00	pix	aprovado	2026-10-01 15:06:24.050481	2026-10-01 15:06:24.050481
\.


--
-- TOC entry 5029 (class 0 OID 16762)
-- Dependencies: 218
-- Data for Name: perfil; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.perfil (id_perfil, nome) FROM stdin;
1	Administrador
2	Veterinario
3	Colaborador
4	Cliente
\.


--
-- TOC entry 5043 (class 0 OID 16834)
-- Dependencies: 232
-- Data for Name: pet; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pet (id_pet, id_cliente, nome, especie, raca, porte, data_nascimento, observacoes_saude, ativo, created_at, updated_at) FROM stdin;
1	1	Rex	Cachorro	Labrador	Grande	2022-05-10	\N	t	2026-10-01 15:06:24.050481	\N
2	1	Mimi	Gato	Persa	Pequeno	2023-01-15	\N	t	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5031 (class 0 OID 16769)
-- Dependencies: 220
-- Data for Name: petshop; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.petshop (id_petshop, razao_social, nome_fantasia, cnpj, telefone, email, endereco, ativo, created_at) FROM stdin;
1	PetPlus Picos LTDA	PetPlus Picos	12.345.678/0001-99	(89) 99999-9999	contato@petplus.com	Rua São Sebastião, 100 - Picos/PI	t	2026-10-01 15:06:24.050481
\.


--
-- TOC entry 5047 (class 0 OID 16858)
-- Dependencies: 236
-- Data for Name: produto; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.produto (id_produto, id_petshop, id_categoria, id_fornecedor, nome, descricao, codigo_barras, preco_custo, preco_venda, quantidade_estoque, estoque_minimo, ativo, created_at, updated_at) FROM stdin;
1	1	1	1	Ração Golden 15kg	\N	\N	90.00	135.00	20	5	t	2026-10-01 15:06:24.050481	\N
2	1	2	1	Vermífugo Petzi	\N	\N	12.00	25.00	50	10	t	2026-10-01 15:06:24.050481	\N
3	1	3	1	Shampoo Neutro 500ml	\N	\N	15.00	32.50	30	5	t	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5045 (class 0 OID 16845)
-- Dependencies: 234
-- Data for Name: servico; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.servico (id_servico, id_petshop, nome, descricao, duracao_minutos, preco, ativo, created_at) FROM stdin;
1	1	Banho e Tosa	Banho completo + tosa higiênica	60	80.00	t	2026-10-01 15:06:24.050481
2	1	Consulta Veterinária	Consulta clínica geral	30	120.00	t	2026-10-01 15:06:24.050481
\.


--
-- TOC entry 5066 (class 0 OID 16972)
-- Dependencies: 255
-- Data for Name: servico_produto; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.servico_produto (id_servico, id_produto, quantidade) FROM stdin;
\.


--
-- TOC entry 5033 (class 0 OID 16780)
-- Dependencies: 222
-- Data for Name: usuario; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuario (id_usuario, id_petshop, id_perfil, email, senha_hash, ativo, created_at, updated_at) FROM stdin;
1	1	1	admin@petplus.com	hash_admin	t	2026-10-01 15:06:24.050481	\N
2	1	2	vet@petplus.com	hash_vet	t	2026-10-01 15:06:24.050481	\N
3	1	4	cliente@petplus.com	hash_cliente	t	2026-10-01 15:06:24.050481	\N
4	1	3	colab@petplus.com	hash_colab	t	2026-10-01 15:06:24.050481	\N
\.


--
-- TOC entry 5057 (class 0 OID 16917)
-- Dependencies: 246
-- Data for Name: venda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venda (id_venda, id_petshop, id_cliente, id_usuario, data_venda, valor_total, status, observacoes) FROM stdin;
1	1	1	1	2026-10-01 15:06:24.050481	160.00	concluida	\N
\.


--
-- TOC entry 5092 (class 0 OID 0)
-- Dependencies: 237
-- Name: agendamento_id_agendamento_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.agendamento_id_agendamento_seq', 1, true);


--
-- TOC entry 5093 (class 0 OID 0)
-- Dependencies: 239
-- Name: bloqueio_agenda_id_bloqueio_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bloqueio_agenda_id_bloqueio_seq', 1, false);


--
-- TOC entry 5094 (class 0 OID 0)
-- Dependencies: 223
-- Name: categoria_produto_id_categoria_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categoria_produto_id_categoria_seq', 3, true);


--
-- TOC entry 5095 (class 0 OID 0)
-- Dependencies: 227
-- Name: cliente_id_cliente_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cliente_id_cliente_seq', 1, true);


--
-- TOC entry 5096 (class 0 OID 0)
-- Dependencies: 229
-- Name: colaborador_id_colaborador_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.colaborador_id_colaborador_seq', 2, true);


--
-- TOC entry 5097 (class 0 OID 0)
-- Dependencies: 241
-- Name: disponibilidade_colaborador_id_disponibilidade_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.disponibilidade_colaborador_id_disponibilidade_seq', 3, true);


--
-- TOC entry 5098 (class 0 OID 0)
-- Dependencies: 225
-- Name: fornecedor_id_fornecedor_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.fornecedor_id_fornecedor_seq', 1, true);


--
-- TOC entry 5099 (class 0 OID 0)
-- Dependencies: 243
-- Name: historico_pet_id_historico_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.historico_pet_id_historico_seq', 1, false);


--
-- TOC entry 5100 (class 0 OID 0)
-- Dependencies: 247
-- Name: item_venda_id_item_venda_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.item_venda_id_item_venda_seq', 2, true);


--
-- TOC entry 5101 (class 0 OID 0)
-- Dependencies: 249
-- Name: movimentacao_estoque_id_movimentacao_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.movimentacao_estoque_id_movimentacao_seq', 1, false);


--
-- TOC entry 5102 (class 0 OID 0)
-- Dependencies: 251
-- Name: notificacao_id_notificacao_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notificacao_id_notificacao_seq', 1, false);


--
-- TOC entry 5103 (class 0 OID 0)
-- Dependencies: 253
-- Name: pagamento_id_pagamento_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagamento_id_pagamento_seq', 1, true);


--
-- TOC entry 5104 (class 0 OID 0)
-- Dependencies: 217
-- Name: perfil_id_perfil_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.perfil_id_perfil_seq', 4, true);


--
-- TOC entry 5105 (class 0 OID 0)
-- Dependencies: 231
-- Name: pet_id_pet_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pet_id_pet_seq', 2, true);


--
-- TOC entry 5106 (class 0 OID 0)
-- Dependencies: 219
-- Name: petshop_id_petshop_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.petshop_id_petshop_seq', 1, true);


--
-- TOC entry 5107 (class 0 OID 0)
-- Dependencies: 235
-- Name: produto_id_produto_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.produto_id_produto_seq', 3, true);


--
-- TOC entry 5108 (class 0 OID 0)
-- Dependencies: 233
-- Name: servico_id_servico_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.servico_id_servico_seq', 2, true);


--
-- TOC entry 5109 (class 0 OID 0)
-- Dependencies: 221
-- Name: usuario_id_usuario_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuario_id_usuario_seq', 4, true);


--
-- TOC entry 5110 (class 0 OID 0)
-- Dependencies: 245
-- Name: venda_id_venda_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.venda_id_venda_seq', 1, true);


--
-- TOC entry 4833 (class 2606 OID 16887)
-- Name: agendamento agendamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT agendamento_pkey PRIMARY KEY (id_agendamento);


--
-- TOC entry 4835 (class 2606 OID 16895)
-- Name: bloqueio_agenda bloqueio_agenda_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bloqueio_agenda
    ADD CONSTRAINT bloqueio_agenda_pkey PRIMARY KEY (id_bloqueio);


--
-- TOC entry 4815 (class 2606 OID 16797)
-- Name: categoria_produto categoria_produto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categoria_produto
    ADD CONSTRAINT categoria_produto_pkey PRIMARY KEY (id_categoria);


--
-- TOC entry 4819 (class 2606 OID 16821)
-- Name: cliente cliente_id_usuario_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_id_usuario_key UNIQUE (id_usuario);


--
-- TOC entry 4821 (class 2606 OID 16819)
-- Name: cliente cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT cliente_pkey PRIMARY KEY (id_cliente);


--
-- TOC entry 4823 (class 2606 OID 16832)
-- Name: colaborador colaborador_id_usuario_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colaborador
    ADD CONSTRAINT colaborador_id_usuario_key UNIQUE (id_usuario);


--
-- TOC entry 4825 (class 2606 OID 16830)
-- Name: colaborador colaborador_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colaborador
    ADD CONSTRAINT colaborador_pkey PRIMARY KEY (id_colaborador);


--
-- TOC entry 4837 (class 2606 OID 16904)
-- Name: disponibilidade_colaborador disponibilidade_colaborador_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilidade_colaborador
    ADD CONSTRAINT disponibilidade_colaborador_pkey PRIMARY KEY (id_disponibilidade);


--
-- TOC entry 4817 (class 2606 OID 16808)
-- Name: fornecedor fornecedor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor
    ADD CONSTRAINT fornecedor_pkey PRIMARY KEY (id_fornecedor);


--
-- TOC entry 4839 (class 2606 OID 16915)
-- Name: historico_pet historico_pet_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historico_pet
    ADD CONSTRAINT historico_pet_pkey PRIMARY KEY (id_historico);


--
-- TOC entry 4843 (class 2606 OID 16938)
-- Name: item_venda item_venda_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_venda
    ADD CONSTRAINT item_venda_pkey PRIMARY KEY (id_item_venda);


--
-- TOC entry 4845 (class 2606 OID 16948)
-- Name: movimentacao_estoque movimentacao_estoque_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_pkey PRIMARY KEY (id_movimentacao);


--
-- TOC entry 4847 (class 2606 OID 16959)
-- Name: notificacao notificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacao
    ADD CONSTRAINT notificacao_pkey PRIMARY KEY (id_notificacao);


--
-- TOC entry 4849 (class 2606 OID 16971)
-- Name: pagamento pagamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamento
    ADD CONSTRAINT pagamento_pkey PRIMARY KEY (id_pagamento);


--
-- TOC entry 4809 (class 2606 OID 16767)
-- Name: perfil perfil_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.perfil
    ADD CONSTRAINT perfil_pkey PRIMARY KEY (id_perfil);


--
-- TOC entry 4827 (class 2606 OID 16843)
-- Name: pet pet_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pet
    ADD CONSTRAINT pet_pkey PRIMARY KEY (id_pet);


--
-- TOC entry 4811 (class 2606 OID 16778)
-- Name: petshop petshop_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.petshop
    ADD CONSTRAINT petshop_pkey PRIMARY KEY (id_petshop);


--
-- TOC entry 4831 (class 2606 OID 16874)
-- Name: produto produto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT produto_pkey PRIMARY KEY (id_produto);


--
-- TOC entry 4829 (class 2606 OID 16856)
-- Name: servico servico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico
    ADD CONSTRAINT servico_pkey PRIMARY KEY (id_servico);


--
-- TOC entry 4851 (class 2606 OID 16978)
-- Name: servico_produto servico_produto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico_produto
    ADD CONSTRAINT servico_produto_pkey PRIMARY KEY (id_servico, id_produto);


--
-- TOC entry 4813 (class 2606 OID 16787)
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id_usuario);


--
-- TOC entry 4841 (class 2606 OID 16929)
-- Name: venda venda_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT venda_pkey PRIMARY KEY (id_venda);


--
-- TOC entry 4865 (class 2606 OID 17059)
-- Name: agendamento fk_agendamento_colaborador; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT fk_agendamento_colaborador FOREIGN KEY (id_colaborador) REFERENCES public.colaborador(id_colaborador);


--
-- TOC entry 4866 (class 2606 OID 17049)
-- Name: agendamento fk_agendamento_pet; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT fk_agendamento_pet FOREIGN KEY (id_pet) REFERENCES public.pet(id_pet);


--
-- TOC entry 4867 (class 2606 OID 17044)
-- Name: agendamento fk_agendamento_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT fk_agendamento_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4868 (class 2606 OID 17054)
-- Name: agendamento fk_agendamento_servico; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agendamento
    ADD CONSTRAINT fk_agendamento_servico FOREIGN KEY (id_servico) REFERENCES public.servico(id_servico);


--
-- TOC entry 4869 (class 2606 OID 17064)
-- Name: bloqueio_agenda fk_bloqueio_colaborador; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bloqueio_agenda
    ADD CONSTRAINT fk_bloqueio_colaborador FOREIGN KEY (id_colaborador) REFERENCES public.colaborador(id_colaborador);


--
-- TOC entry 4854 (class 2606 OID 16989)
-- Name: categoria_produto fk_categoria_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categoria_produto
    ADD CONSTRAINT fk_categoria_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4856 (class 2606 OID 16999)
-- Name: cliente fk_cliente_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT fk_cliente_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4857 (class 2606 OID 17004)
-- Name: cliente fk_cliente_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente
    ADD CONSTRAINT fk_cliente_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- TOC entry 4858 (class 2606 OID 17009)
-- Name: colaborador fk_colaborador_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colaborador
    ADD CONSTRAINT fk_colaborador_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4859 (class 2606 OID 17014)
-- Name: colaborador fk_colaborador_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colaborador
    ADD CONSTRAINT fk_colaborador_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- TOC entry 4870 (class 2606 OID 17069)
-- Name: disponibilidade_colaborador fk_disponibilidade_colaborador; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilidade_colaborador
    ADD CONSTRAINT fk_disponibilidade_colaborador FOREIGN KEY (id_colaborador) REFERENCES public.colaborador(id_colaborador);


--
-- TOC entry 4855 (class 2606 OID 16994)
-- Name: fornecedor fk_fornecedor_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fornecedor
    ADD CONSTRAINT fk_fornecedor_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4871 (class 2606 OID 17079)
-- Name: historico_pet fk_historico_colaborador; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historico_pet
    ADD CONSTRAINT fk_historico_colaborador FOREIGN KEY (id_colaborador) REFERENCES public.colaborador(id_colaborador);


--
-- TOC entry 4872 (class 2606 OID 17074)
-- Name: historico_pet fk_historico_pet; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historico_pet
    ADD CONSTRAINT fk_historico_pet FOREIGN KEY (id_pet) REFERENCES public.pet(id_pet);


--
-- TOC entry 4876 (class 2606 OID 17104)
-- Name: item_venda fk_item_venda_produto; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_venda
    ADD CONSTRAINT fk_item_venda_produto FOREIGN KEY (id_produto) REFERENCES public.produto(id_produto);


--
-- TOC entry 4877 (class 2606 OID 17099)
-- Name: item_venda fk_item_venda_venda; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_venda
    ADD CONSTRAINT fk_item_venda_venda FOREIGN KEY (id_venda) REFERENCES public.venda(id_venda);


--
-- TOC entry 4878 (class 2606 OID 17109)
-- Name: movimentacao_estoque fk_movimentacao_produto; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movimentacao_estoque
    ADD CONSTRAINT fk_movimentacao_produto FOREIGN KEY (id_produto) REFERENCES public.produto(id_produto);


--
-- TOC entry 4879 (class 2606 OID 17114)
-- Name: notificacao fk_notificacao_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacao
    ADD CONSTRAINT fk_notificacao_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


--
-- TOC entry 4880 (class 2606 OID 17119)
-- Name: pagamento fk_pagamento_venda; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamento
    ADD CONSTRAINT fk_pagamento_venda FOREIGN KEY (id_venda) REFERENCES public.venda(id_venda);


--
-- TOC entry 4860 (class 2606 OID 17019)
-- Name: pet fk_pet_cliente; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pet
    ADD CONSTRAINT fk_pet_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- TOC entry 4862 (class 2606 OID 17034)
-- Name: produto fk_produto_categoria; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT fk_produto_categoria FOREIGN KEY (id_categoria) REFERENCES public.categoria_produto(id_categoria);


--
-- TOC entry 4863 (class 2606 OID 17039)
-- Name: produto fk_produto_fornecedor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT fk_produto_fornecedor FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id_fornecedor);


--
-- TOC entry 4864 (class 2606 OID 17029)
-- Name: produto fk_produto_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT fk_produto_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4861 (class 2606 OID 17024)
-- Name: servico fk_servico_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico
    ADD CONSTRAINT fk_servico_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4881 (class 2606 OID 17129)
-- Name: servico_produto fk_servico_produto_produto; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico_produto
    ADD CONSTRAINT fk_servico_produto_produto FOREIGN KEY (id_produto) REFERENCES public.produto(id_produto);


--
-- TOC entry 4882 (class 2606 OID 17124)
-- Name: servico_produto fk_servico_produto_servico; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.servico_produto
    ADD CONSTRAINT fk_servico_produto_servico FOREIGN KEY (id_servico) REFERENCES public.servico(id_servico);


--
-- TOC entry 4852 (class 2606 OID 16984)
-- Name: usuario fk_usuario_perfil; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT fk_usuario_perfil FOREIGN KEY (id_perfil) REFERENCES public.perfil(id_perfil);


--
-- TOC entry 4853 (class 2606 OID 16979)
-- Name: usuario fk_usuario_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuario
    ADD CONSTRAINT fk_usuario_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4873 (class 2606 OID 17089)
-- Name: venda fk_venda_cliente; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT fk_venda_cliente FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente);


--
-- TOC entry 4874 (class 2606 OID 17084)
-- Name: venda fk_venda_petshop; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT fk_venda_petshop FOREIGN KEY (id_petshop) REFERENCES public.petshop(id_petshop);


--
-- TOC entry 4875 (class 2606 OID 17094)
-- Name: venda fk_venda_usuario; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT fk_venda_usuario FOREIGN KEY (id_usuario) REFERENCES public.usuario(id_usuario);


-- Completed on 2026-10-01 15:29:47

--
-- PostgreSQL database dump complete
--

\unrestrict DJP29a6Kw76Alpx0eF0xUMNNCaMztwf9IHxJbgAmuHrAkaR19n69MYqaDMhMtRb

--
-- Database "postgres" dump
--

\connect postgres

--
-- PostgreSQL database dump
--

\restrict r6hJoLR9oFAYpGQwLhOXYF8ReLauvokKhVC2NuwcmHknRmWpq6QbGrQ2Fnt3Xgv

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

-- Started on 2026-10-01 15:29:47

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Completed on 2026-10-01 15:29:53

--
-- PostgreSQL database dump complete
--

\unrestrict r6hJoLR9oFAYpGQwLhOXYF8ReLauvokKhVC2NuwcmHknRmWpq6QbGrQ2Fnt3Xgv

-- Completed on 2026-10-01 15:29:53

--
-- PostgreSQL database cluster dump complete
--

