# BASE DE CONTEXTO - EVA PLACE (Backend)

## O que e esta pasta

Contém os dados estruturados que alimentam o backend de atendimento automatizado da EVA PLACE via WhatsApp (ManyChat + OpenAI).

**Esta pasta NAO e o backend.** E a base de contexto que o backend vai consumir.

## Arquitetura da operacao

```
Trafego Pago (Meta) -> WhatsApp -> ManyChat (interface)
                                       |
                                  Backend proprio (nucleo)
                                       |
                                  OpenAI (inteligencia: texto, audio, imagem)
                                       |
                                  Base de Contexto (esta pasta)
```

## Arquivos

| Arquivo | Conteudo |
|---------|----------|
| `catalogo_produtos.json` | Todos os produtos, precos, cores, variantes, restricoes e argumentos comerciais |
| `regras_frete.json` | Zonas, cidades, valores, protocolo moto vs carro, regras fora da regiao |
| `faq.json` | Perguntas frequentes com respostas, categoria e se resolve automaticamente |
| `regras_negocio.json` | Desconto pix, parcelamento, fatores, fechamento, persona, horarios, escalamento |
| `campos_tags_manychat.json` | Custom fields, tags e etapas do fluxo sugeridos para ManyChat |
| `LOGICA_ESTRUTURACAO.md` | Decisoes tomadas na estruturacao e criterios usados |

## Praca de operacao

- **Cidade:** Fortaleza e regiao metropolitana (Grande Fortaleza)
- **Zonas:** Fortaleza/Maracanau (R$10), Maranguape/Eusebio (R$20), Aquiraz/Caucaia (R$30)
- **Fora da regiao:** Redirecionar para o site (transportadora/Correios)

## Status

- **Fase:** 1 - Estruturacao da base de contexto
- **Proximo passo:** Construcao do backend que consome estes JSONs
- **Lacunas:** Marcadas como `pendente_validacao` dentro dos JSONs

## Fonte dos dados

- `00_PROMPT_MESTRE_CONSOLIDADO.docx`
- `01_MOD_Identidade_e_Logistica.docx`
- `02_MOD_Catalogo_Produtos_COMPLETO.docx`
- `03_MOD_Financeiro_e_Fechamento.docx`
- `04_MOD_Formatacao_e_UX.docx`
- `05_MOD_Cenarios_de_Teste.docx`

## Regra importante

Nenhum dado foi inventado. Onde havia lacuna ou desatualizacao, foi marcado explicitamente como `pendente_validacao`.
