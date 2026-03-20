# BASE DE CONTEXTO - EVA PLACE (Backend)

## O que e esta pasta

Contém os dados estruturados que alimentam o backend de atendimento automatizado da EVA PLACE via WhatsApp (ManyChat + OpenAI).

**Esta pasta NAO e o backend.** E a base de contexto que o backend vai consumir.

## Fonte de verdade

| Tipo de dado | Fonte oficial | Arquivo |
|-------------|---------------|---------|
| Produtos, precos, cores, estoque | **WooCommerce REST API** | `catalogo_produtos.json` (gerado por `scripts/sync-catalog.ts`) |
| Zonas de frete, valores | Regras locais | `regras_frete.json` |
| Perguntas frequentes | Regras locais | `faq.json` |
| Parcelamento, desconto, persona | Regras locais | `regras_negocio.json` |
| Campos ManyChat (referencia) | Configuracao | `campos_tags_manychat.json` |

> **IMPORTANTE:** `catalogo_produtos.json` NAO deve ser editado manualmente.
> Para atualizar precos/cores/estoque, rodar `npm run sync:catalog` que puxa do WooCommerce.

## Arquitetura da operacao

```
Trafego Pago (Meta) -> WhatsApp -> ManyChat (interface)
                                       |
                                  Backend proprio (nucleo)
                                       |
                               +-------+--------+
                               |                |
                          OpenAI            WooCommerce
                       (inteligencia)    (catalogo/precos)
                               |                |
                          Base de Contexto (esta pasta)
```

## Arquivos

| Arquivo | Conteudo | Fonte |
|---------|----------|-------|
| `catalogo_produtos.json` | Produtos, precos, cores, estoque | WooCommerce (sincronizado) |
| `regras_frete.json` | Zonas, cidades, valores, protocolo moto vs carro | Regras locais |
| `faq.json` | Perguntas frequentes | Regras locais |
| `regras_negocio.json` | Desconto pix, parcelamento, persona, horarios | Regras locais |
| `campos_tags_manychat.json` | Custom fields e tags sugeridos para ManyChat | Configuracao |

## Status

- **Catalogo:** v3.0.0 — sincronizado do WooCommerce (32 produtos, 175 variacoes)
- **Ultima sync:** ver campo `sincronizado_em` no `_meta` do catalogo
- **Para re-sincronizar:** `npm run sync:catalog`
