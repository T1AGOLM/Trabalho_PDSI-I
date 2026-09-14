# 🐾 PetPlus — Protótipo Navegável

Protótipo **100% front-end e interativo** do sistema de gestão para petshops **PetPlus**, construído a partir da Especificação da Aplicação, do Documento de Requisitos (RF/RNF/RN) e dos diagramas de Classes e de Casos de Uso.

> ⚠️ **Sem banco de dados, sem back-end e sem comunicação com a web.** Todos os dados são fictícios, vivem em memória (`src/data.ts`) e são recriados a cada recarga da página. Nenhuma requisição de rede é feita.

## ▶️ Como executar

```bash
npm install
npm run dev
```

Abra **http://localhost:5173**.

## 🔑 Acessos do protótipo (senha: `123`)

| Perfil | E-mail | O que vê |
|---|---|---|
| 👑 Gestor | `gestor@petplus.com` | Dashboard, agenda geral, clientes, colaboradores, estoque, fornecedores, PDV, vendas, relatórios, pacotes, avaliações, configurações |
| ✂️ Colaborador | `colab@petplus.com` | Minha agenda, atendimentos do dia, histórico do pet, clientes & pets, estoque, bloqueios de agenda |
| 🐶 Cliente | `cliente@petplus.com` | Início, agendar online (3 passos), meus agendamentos, meus pets, histórico de saúde, fidelidade, perfil |

Também há botões de **acesso rápido** na própria tela de login.

## 🗺️ Mapa de telas (26 telas)

**Públicas (6):** Landing · Login · Recuperar senha · Redefinir senha · Cadastro de cliente (2 etapas) · 404

**Gestor (12):** Dashboard (RF14/15) · Agenda semanal (UC05–07) · Clientes & Pets (UC03/04) · Colaboradores (UC17) · Estoque (UC08/10/21) · Fornecedores (UC26) · PDV (UC11/RF25) · Histórico de Vendas + estorno (UC12) · Relatórios (UC22) · Pacotes (UC24) · Avaliações (UC23) · Configurações (LGPD/backup/multi-tenant)

**Colaborador (6):** Minha Agenda (UC18) · Atendimentos de hoje · Histórico do Pet (UC13) · Clientes & Pets · Estoque · Bloqueios de Agenda (UC25)

**Cliente (7):** Início · Agendar Online (UC19, 3 passos) · Meus Agendamentos (UC07/UC23) · Meus Pets · Histórico de Saúde (UC20) · Fidelidade (RF20) · Meu Perfil

Mais: comprovante de venda, modais de detalhe/edição, alertas de estoque/validade, **acesso negado** (troca de perfil) e **404**.

## ✅ Regras de negócio simuladas

- **RN01** conflito de agenda (mesmo profissional/horário) — no novo agendamento e na remarcação
- **RN02** venda bloqueada por estoque insuficiente
- **RN03/RN10** acesso por perfil (guardas de rota + tela de acesso negado)
- **RN04** cancelamento libera o horário
- **RN05/RN09** alertas de estoque mínimo e validade ≤ 30 dias
- **RN07** resgate de fidelidade exige saldo
- **RN11** estorno apenas pelo gestor
- **RN12** bloqueio de agenda não pode sobrepor agendamentos confirmados

## 🧱 Tecnologias

React 18 + TypeScript + Vite — sem bibliotecas externas de UI, sem router externo, zero dependências de rede em runtime.
