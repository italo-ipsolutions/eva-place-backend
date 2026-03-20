# LOGICA DE ESTRUTURACAO - Base de Contexto EVA PLACE

## Criterios de decisao

### 1. Separacao por dominio funcional

Os dados foram divididos em 5 JSONs distintos para que o backend possa carregar apenas o que precisa em cada momento da conversa:

- **catalogo_produtos.json** - Consultado quando o cliente pergunta sobre produto, preco, cor, espessura
- **regras_frete.json** - Consultado quando precisa calcular frete ou identificar zona
- **faq.json** - Consultado para perguntas genericas de manutencao, durabilidade, seguranca
- **regras_negocio.json** - Consultado no fechamento, calculo de desconto/parcela, escalamento
- **campos_tags_manychat.json** - Usado na configuracao do ManyChat (nao em runtime da IA)

### 2. Formato dos precos

- Tabela de precos regressiva do tatame 50x50 mantida como array de faixas
- Cada faixa tem `preco_total` (quando aplicavel) e `preco_unitario`
- Para Kit 20+, `preco_total` e null pois e calculado (Qtd x preco_unitario)

### 3. Cores

- Separadas em `cores_disponiveis` e `cores_em_falta`
- Cores em falta refletem o documento fonte na data de extracao
- **ATENCAO:** Estoque de cores muda frequentemente. Marcar como pendente_validacao periodicamente.

### 4. Regras de seguranca como dados

- Restricoes de produto (ex: "nao vender 20mm para Jiu-Jitsu") estao dentro do catalogo E nas regras de negocio
- Duplicacao intencional: o backend pode checar em ambos os momentos (apresentacao e fechamento)

### 5. Escalamento para humano

- Listado em `regras_negocio.json` como array de situacoes
- Cada situacao tem motivo claro para o backend decidir quando acionar humano

### 6. Persona e tom de voz

- Incluidos em `regras_negocio.json` dentro de `persona`
- Sera injetado no system prompt da OpenAI pelo backend

### 7. ManyChat como camada de interface

- `campos_tags_manychat.json` define a estrutura sugerida
- Custom fields guardam dados do cliente durante a conversa
- Tags marcam o estagio do funil
- Etapas do fluxo mapeiam a jornada completa

## O que NAO esta nesta base (e por que)

| Item | Motivo |
|------|--------|
| Fluxo visual do ManyChat | Sera construido na fase de implementacao |
| Codigo do backend | Esta e apenas a base de dados/contexto |
| Webhooks/API endpoints | Definidos na arquitetura do backend |
| Credenciais (API keys) | Nunca devem estar em arquivos de contexto |
| Historico de conversas | Sera gerido pelo backend em runtime |

## Lacunas marcadas como `pendente_validacao`

1. **Link exato do site** para redirecionamento de clientes fora da regiao
2. **Valor de frete por carro** - nao existe tabela fixa no documento
3. **FAQ "Pode colocar peso em cima?"** - resposta tecnica ausente no documento
4. **Cartela Relogio/Profissoes** - estoque visual a verificar
5. **Timeout de abandono** - nao definido nos documentos (sugestao: 24h ou 48h)
6. **Fluxo de pos-venda** - nao descrito nos documentos atuais
7. **Cores de tatame** - podem ter mudado desde a ultima atualizacao do Prompt Mestre

## Fonte de verdade (atualizado 2026-03-20)

A partir da v3.0.0, o `catalogo_produtos.json` e gerado automaticamente pelo
script `scripts/sync-catalog.ts` que puxa dados do WooCommerce REST API.

**WooCommerce e a fonte oficial para:** precos, cores, estoque, SKU, variantes.
**Regras locais continuam validas para:** argumentacao comercial, uso recomendado,
restricoes, frete, tabela de kits (calculada sobre preco avulso do Woo).

NAO editar `catalogo_produtos.json` manualmente. Rodar `npm run sync:catalog`.

## Proximos passos recomendados

1. Validar todas as lacunas `pendente_validacao` com a equipe
2. Agendar `npm run sync:catalog` como parte do deploy
3. Monitorar produtos novos no WooCommerce que nao tem mapeamento no bot
