import type {
  Agendamento, Avaliacao, BloqueioAgenda, Cliente, Colaborador, Fornecedor,
  Notificacao, PacoteServico, Pet, Produto, RegistroSaude, Relatorio, Servico, Venda,
} from './types'

// ===== Dados fictícios em memória — sem persistência, sem rede =====

export const db = {
  clientes: [
    { id: 1, nome: 'Ana Beatriz Souza', email: 'ana.souza@email.com', telefone: '(11) 98877-1234', endereco: 'Rua das Flores, 123 — Vila Mariana, São Paulo/SP', pontosFidelidade: 320, ativo: true },
    { id: 2, nome: 'Carlos Eduardo Lima', email: 'carlos.lima@email.com', telefone: '(11) 99123-4567', endereco: 'Av. Paulista, 900 — Bela Vista, São Paulo/SP', pontosFidelidade: 145, ativo: true },
    { id: 3, nome: 'Fernanda Ribeiro', email: 'fer.ribeiro@email.com', telefone: '(11) 97766-3322', endereco: 'Rua Harmonia, 45 — Vila Madalena, São Paulo/SP', pontosFidelidade: 510, ativo: true },
    { id: 4, nome: 'João Pedro Martins', email: 'jp.martins@email.com', telefone: '(11) 96555-9090', endereco: 'Rua do Bosque, 210 — Barra Funda, São Paulo/SP', pontosFidelidade: 80, ativo: true },
    { id: 5, nome: 'Larissa Costa', email: 'lari.costa@email.com', telefone: '(11) 98080-2211', endereco: 'Rua Girassol, 780 — Vila Olimpia, São Paulo/SP', pontosFidelidade: 0, ativo: false },
  ] as Cliente[],

  pets: [
    { id: 1, clienteId: 1, nome: 'Bolinha', especie: 'Cachorro', raca: 'Poodle', porte: 'Pequeno', idade: 3, observacoesSaude: 'Alergia a pulgas; usar shampoo hiperalergênico.', ativo: true },
    { id: 2, clienteId: 1, nome: 'Mimi', especie: 'Gato', raca: 'SRD', porte: 'Médio', idade: 5, observacoesSaude: 'Estressada em banho; sugestão de sedação leve.', ativo: true },
    { id: 3, clienteId: 2, nome: 'Thor', especie: 'Cachorro', raca: 'Labrador', porte: 'Grande', idade: 2, observacoesSaude: 'Sobrepeso — dieta recomendada.', ativo: true },
    { id: 4, clienteId: 3, nome: 'Pipoca', especie: 'Coelho', raca: 'Holland', porte: 'Pequeno', idade: 1, observacoesSaude: 'Vacinação em dia.', ativo: true },
    { id: 5, clienteId: 4, nome: 'Rex', especie: 'Cachorro', raca: 'Pastor Alemão', porte: 'Grande', idade: 4, observacoesSaude: 'Displasia leve no quadril.', ativo: true },
    { id: 6, clienteId: 5, nome: 'Fumaça', especie: 'Gato', raca: 'Persa', porte: 'Médio', idade: 7, observacoesSaude: 'Pelo longo — escovação semanal.', ativo: true },
  ] as Pet[],

  colaboradores: [
    { id: 1, nome: 'Juliana Ferreira', cargo: 'ATENDENTE', telefone: '(11) 91111-0101', email: 'juliana@petplus.com.br', disponibilidade: 'Seg–Sáb, 08h–18h', ativo: true },
    { id: 2, nome: 'Marcos Vinícius', cargo: 'TOSADOR', telefone: '(11) 92222-0202', email: 'marcos@petplus.com.br', disponibilidade: 'Seg–Sex, 09h–18h', ativo: true },
    { id: 3, nome: 'Patrícia Gomes', cargo: 'BANHISTA', telefone: '(11) 93333-0303', email: 'patricia@petplus.com.br', disponibilidade: 'Ter–Sáb, 08h–17h', ativo: true },
    { id: 4, nome: 'Dr. Roberto Nogueira', cargo: 'VETERINARIO', telefone: '(11) 94444-0404', email: 'roberto@petplus.com.br', disponibilidade: 'Seg–Qua–Sex, 13h–19h', ativo: true },
    { id: 5, nome: 'Camila Duarte', cargo: 'BANHISTA', telefone: '(11) 95555-0505', email: 'camila@petplus.com.br', disponibilidade: 'Seg–Sex, 10h–19h', ativo: false },
  ] as Colaborador[],

  servicos: [
    { id: 1, nome: 'Banho e Tosa Higiênica', tipo: 'tosa', duracao: 60, preco: 65 },
    { id: 2, nome: 'Banho Simples', tipo: 'banho', duracao: 40, preco: 45 },
    { id: 3, nome: 'Tosa da Raça (Padrão AKC)', tipo: 'tosa', duracao: 90, preco: 95 },
    { id: 4, nome: 'Consulta Veterinária', tipo: 'consulta', duracao: 30, preco: 150 },
    { id: 5, nome: 'Consulta + Vacina V4', tipo: 'consulta', duracao: 30, preco: 190 },
    { id: 6, nome: 'Banho com Tratamento de Pele', tipo: 'banho', duracao: 60, preco: 85 },
  ] as Servico[],

  agendamentos: [
    { id: 1, petId: 1, clienteId: 1, colaboradorId: 2, servicoId: 1, dataHora: '2026-09-12T09:00', status: 'confirmado' },
    { id: 2, petId: 3, clienteId: 2, colaboradorId: 3, servicoId: 2, dataHora: '2026-09-12T10:00', status: 'confirmado' },
    { id: 3, petId: 5, clienteId: 4, colaboradorId: 4, servicoId: 4, dataHora: '2026-09-12T14:00', status: 'confirmado' },
    { id: 4, petId: 2, clienteId: 1, colaboradorId: 3, servicoId: 3, dataHora: '2026-09-12T15:30', status: 'concluído' },
    { id: 5, petId: 4, clienteId: 3, colaboradorId: 4, servicoId: 5, dataHora: '2026-09-10T09:30', status: 'concluído' },
    { id: 6, petId: 6, clienteId: 5, colaboradorId: 3, servicoId: 2, dataHora: '2026-09-11T16:00', status: 'cancelado' },
    { id: 7, petId: 3, clienteId: 2, colaboradorId: 2, servicoId: 1, dataHora: '2026-09-14T11:00', status: 'confirmado' },
    { id: 8, petId: 1, clienteId: 1, colaboradorId: 3, servicoId: 6, dataHora: '2026-09-14T15:00', status: 'confirmado' },
    { id: 9, petId: 5, clienteId: 4, colaboradorId: 4, servicoId: 4, dataHora: '2026-09-16T10:30', status: 'confirmado' },
    { id: 10, petId: 2, clienteId: 1, colaboradorId: 3, servicoId: 1, dataHora: '2026-09-08T09:00', status: 'concluído' },
  ] as Agendamento[],

  bloqueios: [
    { id: 1, colaboradorId: 2, dataInicio: '2026-09-20', dataFim: '2026-09-27', motivo: 'Férias programadas' },
    { id: 2, colaboradorId: 4, dataInicio: '2026-09-15', dataFim: '2026-09-15', motivo: 'Folga (compensação)' },
  ] as BloqueioAgenda[],

  produtos: [
    { id: 1, nome: 'Ração Super Premium Cães Adultos 15kg', categoria: 'Alimentos', quantidadeEstoque: 14, estoqueMinimo: 5, validade: '2027-03-10', preco: 189.9, fornecedorId: 1 },
    { id: 2, nome: 'Shampoo Higienizador Neutro 500ml', categoria: 'Higiene', quantidadeEstoque: 3, estoqueMinimo: 6, validade: '2027-01-20', preco: 32.5, fornecedorId: 2 },
    { id: 3, nome: 'Antipulgas Simparic 10–20kg', categoria: 'Farmácia', quantidadeEstoque: 9, estoqueMinimo: 4, validade: '2026-10-05', preco: 78.9, fornecedorId: 3 },
    { id: 4, nome: 'Vermífugo Vermivet Plus 700mg', categoria: 'Farmácia', quantidadeEstoque: 12, estoqueMinimo: 5, validade: '2026-09-25', preco: 45.0, fornecedorId: 3 },
    { id: 5, nome: 'Brinquedo Bola Maciça G', categoria: 'Acessórios', quantidadeEstoque: 20, estoqueMinimo: 4, validade: '', preco: 24.9, fornecedorId: 4 },
    { id: 6, nome: 'Coleira Peitoral Ajustável M', categoria: 'Acessórios', quantidadeEstoque: 8, estoqueMinimo: 3, validade: '', preco: 59.9, fornecedorId: 4 },
    { id: 7, nome: 'Areia Higiênica Granulada 4kg', categoria: 'Higiene', quantidadeEstoque: 2, estoqueMinimo: 8, validade: '', preco: 27.9, fornecedorId: 2 },
    { id: 8, nome: 'Petisco Dental para Cães 100g', categoria: 'Alimentos', quantidadeEstoque: 25, estoqueMinimo: 6, validade: '2026-11-12', preco: 19.9, fornecedorId: 1 },
  ] as Produto[],

  fornecedores: [
    { id: 1, nome: 'Pet Food Distribuidora LTDA', cnpj: '12.345.678/0001-90', contato: '(11) 3030-1010' },
    { id: 2, nome: 'HigienePet Atacado', cnpj: '23.456.789/0001-01', contato: '(11) 3222-2020' },
    { id: 3, nome: 'AgroPet Farmácia Veterinária', cnpj: '34.567.890/0001-12', contato: '(11) 3555-3030' },
    { id: 4, nome: 'Acessórios & Cia ME', cnpj: '45.678.901/0001-23', contato: '(11) 3888-4040' },
  ] as Fornecedor[],

  vendas: [
    { id: 1001, dataHora: '2026-09-12T09:15', clienteId: 1, status: 'finalizada', valorTotal: 64.9, itens: [{ produtoId: 5, nome: 'Brinquedo Bola Maciça G', quantidade: 1, precoUnitario: 24.9 }, { produtoId: 8, nome: 'Petisco Dental para Cães 100g', quantidade: 2, precoUnitario: 19.9 }], pagamentos: [{ formaPagamento: 'PIX', valor: 64.9 }] },
    { id: 1002, dataHora: '2026-09-12T10:40', clienteId: 2, status: 'finalizada', valorTotal: 189.9, itens: [{ produtoId: 1, nome: 'Ração Super Premium Cães Adultos 15kg', quantidade: 1, precoUnitario: 189.9 }], pagamentos: [{ formaPagamento: 'crédito', valor: 189.9 }] },
    { id: 1003, dataHora: '2026-09-11T17:05', clienteId: 3, status: 'estornada', valorTotal: 123.9, itens: [{ produtoId: 3, nome: 'Antipulgas Simparic 10–20kg', quantidade: 1, precoUnitario: 78.9 }, { produtoId: 4, nome: 'Vermífugo Vermivet Plus 700mg', quantidade: 1, precoUnitario: 45.0 }], pagamentos: [{ formaPagamento: 'débito', valor: 123.9 }] },
    { id: 1004, dataHora: '2026-09-11T11:22', clienteId: 4, status: 'finalizada', valorTotal: 105.8, itens: [{ produtoId: 2, nome: 'Shampoo Higienizador Neutro 500ml', quantidade: 1, precoUnitario: 32.5 }, { produtoId: 6, nome: 'Coleira Peitoral Ajustável M', quantidade: 1, precoUnitario: 59.9 }], pagamentos: [{ formaPagamento: 'dinheiro', valor: 105.8 }] },
    { id: 1005, dataHora: '2026-09-11T18:30', clienteId: 1, status: 'finalizada', valorTotal: 55.8, itens: [{ produtoId: 8, nome: 'Petisco Dental para Cães 100g', quantidade: 1, precoUnitario: 19.9 }, { produtoId: 5, nome: 'Brinquedo Bola Maciça G', quantidade: 1, precoUnitario: 24.9 }], pagamentos: [{ formaPagamento: 'PIX', valor: 30 }, { formaPagamento: 'dinheiro', valor: 25.8 }] },
  ] as Venda[],

  registrosSaude: [
    { id: 1, petId: 1, data: '2026-06-10', tipo: 'vacina', descricao: 'V4 (quádrupla) — dose anual aplicada' },
    { id: 2, petId: 1, data: '2026-08-02', tipo: 'banho', descricao: 'Banho com tratamento de pele' },
    { id: 3, petId: 1, data: '2026-09-12', tipo: 'atendimento', descricao: 'Consulta de rotina — ausculta e peso normais' },
    { id: 4, petId: 3, data: '2026-07-18', tipo: 'vacina', descricao: 'Antirrábica — válida até 07/2027' },
    { id: 5, petId: 3, data: '2026-08-20', tipo: 'observação', descricao: 'Orientação de dieta: ração light, 2x ao dia' },
    { id: 6, petId: 4, data: '2026-09-10', tipo: 'atendimento', descricao: 'Consulta + vacina V4 aplicada' },
    { id: 7, petId: 5, data: '2026-05-30', tipo: 'observação', descricao: 'Avaliação ortopédica — displasia leve, acompanhamento' },
    { id: 8, petId: 5, data: '2026-09-12', tipo: 'atendimento', descricao: 'Consulta de acompanhamento ortopédico' },
    { id: 9, petId: 2, data: '2026-09-12', tipo: 'banho', descricao: 'Tosa da raça — higiênica completa' },
    { id: 10, petId: 6, data: '2026-03-14', tipo: 'vacina', descricao: 'V4 + Antirrábica — reforço em 09/2026 (próximo do vencimento!)' },
    { id: 11, petId: 6, data: '2026-02-01', tipo: 'observação', descricao: 'Escovação e revisão de pelos' },
  ] as RegistroSaude[],

  pacotes: [
    { id: 1, nome: 'Plano Banho & Tosa Mensal', periodicidade: 'Mensal', preco: 120, servicos: ['Banho Simples', 'Tosa Higiênica'], clienteId: 1, petId: 1, status: 'ativo' },
    { id: 2, nome: 'Plano Saúde Filhote', periodicidade: 'Mensal', preco: 99, servicos: ['Consulta Veterinária', 'Banho Simples'], clienteId: 2, petId: 3, status: 'ativo' },
    { id: 3, nome: 'Plano Banho & Tosa Mensal', periodicidade: 'Mensal', preco: 120, servicos: ['Banho Simples', 'Tosa Higiênica'], clienteId: 3, petId: 4, status: 'cancelado' },
  ] as PacoteServico[],

  avaliacoes: [
    { id: 1, agendamentoId: 4, clienteId: 1, nota: 5, comentario: 'Mimi saiu linda! Atendimento nota 10.', data: '2026-09-12T16:30' },
    { id: 2, agendamentoId: 5, clienteId: 3, nota: 4, comentario: 'Muito bom, mas achei um pouco demorado.', data: '2026-09-10T11:00' },
  ] as Avaliacao[],

  notificacoes: [
    { id: 1, canal: 'e-mail', destinatario: 'ana.souza@email.com', mensagem: 'Lembrete: Banho e Tosa do Bolinha amanhã (12/09) às 09:00.', dataEnvio: '2026-09-11T09:00', lida: true },
    { id: 2, canal: 'push', destinatario: 'Ana Beatriz Souza', mensagem: 'Vacina V4 do Mimi vence em 15 dias. Agende o reforço!', dataEnvio: '2026-09-10T08:00', lida: false },
    { id: 3, canal: 'e-mail', destinatario: 'fer.ribeiro@email.com', mensagem: 'Está na hora do banho do Pipoca! Agende o retorno.', dataEnvio: '2026-09-10T10:00', lida: false },
    { id: 4, canal: 'e-mail', destinatario: 'jp.martins@email.com', mensagem: 'Lembrete: Consulta do Rex hoje às 14:00.', dataEnvio: '2026-09-12T07:00', lida: false },
    { id: 5, canal: 'push', destinatario: 'Carlos Eduardo Lima', mensagem: 'Seu pacote Plano Saúde Filhote foi renovado com sucesso.', dataEnvio: '2026-09-01T09:00', lida: true },
  ] as Notificacao[],

  relatorios: [
    { id: 1, tipo: 'vendas', formato: 'PDF', periodo: '01/09/2026 – 12/09/2026', dataGeracao: '2026-09-12T08:30', usuario: 'Marcos Ruan (Gestor)' },
    { id: 2, tipo: 'agendamentos', formato: 'Excel', periodo: 'Setembro/2026', dataGeracao: '2026-09-08T14:00', usuario: 'Marcos Ruan (Gestor)' },
    { id: 3, tipo: 'estoque', formato: 'CSV', periodo: 'Setembro/2026', dataGeracao: '2026-09-01T09:00', usuario: 'Marcos Ruan (Gestor)' },
  ] as Relatorio[],
}

// Usuários de acesso ao protótipo (um por perfil)
export const usuarios = [
  { email: 'gestor@petplus.com', senha: '123', perfil: 'GESTOR', nome: 'Marcos Ruan' },
  { email: 'colab@petplus.com', senha: '123', perfil: 'COLABORADOR', nome: 'Juliana Ferreira' },
  { email: 'cliente@petplus.com', senha: '123', perfil: 'CLIENTE', nome: 'Ana Beatriz Souza' },
]

export const currentUserIdCliente = 1 // Cliente logado no protótipo (Ana)
export const currentUserIdColaborador = 1 // Colaborador logado no protótipo (Juliana)
