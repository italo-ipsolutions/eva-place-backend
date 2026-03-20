# Plano de Analise — Conversas Reais do WhatsApp

**Data:** 2026-03-20
**Objetivo:** Mapear perguntas, objecoes, intencoes e linguagem real dos clientes para afinar o bot

---

## 1. Por que analisar conversas reais?

O bot esta respondendo com base em regras e matchers que foram escritos "de cabeca".
As conversas reais mostram:
- Como o cliente realmente pergunta (linguagem natural, erros, abreviacoes)
- Quais perguntas se repetem mais (e devem ser matchers locais)
- Quais objecoes aparecem (e como o atendente humano resolve)
- Quais trocas de assunto sao comuns (produto → frete → pagamento)
- Quais respostas do bot geraram confusao ou re-pergunta

---

## 2. Como exportar as conversas

### Opcao A — Export do ManyChat (RECOMENDADA)
1. ManyChat > Live Chat > selecionar contatos recentes
2. Copiar a conversa inteira (ou screenshot)
3. Colar em arquivo texto

### Opcao B — Export do WhatsApp direto
1. Abrir WhatsApp Web ou App
2. Conversa > 3 pontos > "Exportar conversa" (sem midia)
3. Salvar o .txt gerado

### Opcao C — Copiar/colar manual
Se nao tiver export automatico, copiar trechos significativos manualmente.

---

## 3. Formato esperado

Salvar os arquivos em:
```
EVA_PLACE_BACKEND_REPO/data/conversas/
```

Formatos aceitos (qualquer um serve):
- `.txt` — export do WhatsApp (formato padrao: `[data, hora] Nome: mensagem`)
- `.csv` — se tiver export tabulado
- `.json` — se vier do ManyChat API
- `.md` — copiar/colar organizado

### Nomeacao sugerida:
```
conversa_2026-03-15_cliente_tatame_bebe.txt
conversa_2026-03-18_cliente_frete_eusebio.txt
conversa_2026-03-20_cliente_jiu_jitsu.txt
```

---

## 4. Quantidade minima recomendada

| Periodo | Conversas | Cobertura |
|---------|-----------|-----------|
| Ultimos 7 dias | 5-10 conversas | Minimo viavel |
| Ultimos 30 dias | 20-30 conversas | Ideal |

Priorizar conversas que:
- Resultaram em VENDA (entender fluxo de sucesso)
- Tiveram DUVIDA REPETIDA (perguntas frequentes)
- Tiveram OBJECAO (preco caro, frete caro, demora)
- Tiveram TROCA DE ASSUNTO (produto → frete → pagamento)
- Tiveram CONFUSAO com resposta do bot (se ja estava no ar)

---

## 5. O que vou extrair de cada conversa

1. **Intencoes**: o que o cliente queria (comprar tatame, saber frete, comparar cores, etc.)
2. **Linguagem**: como ele expressa (gírias, abreviacoes, erros comuns)
3. **Objecoes**: "e caro", "frete caro", "demora", "tem desconto?"
4. **Perguntas frequentes**: as que se repetem entre conversas diferentes
5. **Fluxo de compra**: ordem tipica de assuntos na conversa
6. **Respostas do humano que funcionam**: scripts que converteram

---

## 6. Resultado esperado

Depois de processar as conversas, vou gerar:

1. **Mapa de intencoes reais** — atualizar `intent.ts` e matchers
2. **FAQ atualizado** — adicionar perguntas que o bot nao cobre hoje
3. **Glossario de linguagem** — termos e gírias do cliente cearense
4. **Fluxo tipico de conversa** — para ajustar a ordem do pipeline
5. **Scripts de resposta** — copiar respostas do humano que converteram

---

## 7. Proximo passo exato

> **Voce (Italo) precisa:**
> 1. Criar a pasta `data/conversas/` no repo (ou me dizer onde quer)
> 2. Exportar 5-10 conversas recentes do WhatsApp/ManyChat
> 3. Salvar na pasta no formato que tiver (txt, md, csv)
> 4. Me avisar quando estiverem la
>
> Eu processo automaticamente e gero as melhorias.
