import { getContext } from "./context-loader.js";
import { getRecentTurns } from "./memory.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

/**
 * Monta o system prompt com persona + regras + contexto relevante.
 * Injeta dados compactos do catalogo, frete e regras de negocio
 * para que o modelo responda com base em dados reais.
 */
export function buildSystemPrompt(): string {
  const ctx = getContext();
  const persona = ctx.regras.persona as Record<string, unknown>;
  const empresa = ctx.regras.empresa;

  // Resumo compacto do catalogo (nomes + precos de referencia)
  const catalogoResumo = ctx.catalogo.categorias
    .map((cat) => {
      if (cat.variantes?.length) {
        const precos = cat.variantes
          .map((v) => {
            const preco = v.tabela_precos?.[0]?.preco_unitario ?? (v as any).preco_unitario ?? "?";
            return `${v.espessura_mm}mm: R$${preco}`;
          })
          .join(", ");
        return `- ${cat.nome}: ${precos}`;
      }
      if (cat.produtos?.length) {
        const items = cat.produtos
          .slice(0, 3)
          .map((p) => `${p.modelo} R$${p.preco ?? (cat as any).preco_unico ?? "?"}`)
          .join(", ");
        return `- ${cat.nome}: ${items}`;
      }
      return `- ${cat.nome}`;
    })
    .join("\n");

  // Zonas de frete
  const freteResumo = ctx.frete.zonas
    .map((z) => `Zona ${z.zona} (${z.cidades.join("/")}): R$${z.valor} ${z.tipo_padrao}`)
    .join("\n");

  // Regras de parcelamento
  const parcResumo = `Ate ${ctx.regras.parcelamento.sem_juros_ate}x sem juros. Ate ${ctx.regras.parcelamento.maximo_parcelas}x com taxa.`;

  const naoFazer = Array.isArray(persona.nao_fazer)
    ? (persona.nao_fazer as string[]).map((r) => `- ${r}`).join("\n")
    : "";

  return `Voce e o Assistente Virtual Especialista da ${empresa.nome_fantasia}, uma loja de EVA em Fortaleza.

PERSONA E TOM:
- Tom: ${persona.tom ?? "Vendedor experiente de balcao, pratico e agil"}
- Linguagem: Use "Amigo", "Opa", "Show". Emojis moderados.
- Modo: Consultor, nao tirador de pedido. Sempre ancore o valor.
- Nunca responda preco "seco". Sugira kits maiores quando fizer sentido.
- Formatacao WhatsApp: negrito com *um asterisco*, listas com emojis, max 3-4 linhas por bloco.

O QUE NAO FAZER:
${naoFazer}

CATALOGO RESUMIDO:
${catalogoResumo}

FRETE (Grande Fortaleza):
${freteResumo}
Retirada gratis: ${ctx.frete.retirada.endereco} (${ctx.frete.retirada.horario_semana})
Fora da regiao: redirecionar para o site.

PAGAMENTO:
- Pix/Dinheiro: ${ctx.regras.desconto_pix.percentual}% de desconto sobre produtos
- Chave Pix: ${empresa.chave_pix} (${empresa.banco_pix}) - ${empresa.razao_social}
- Cartao: ${parcResumo}

FECHAMENTO (ordem obrigatoria):
1. Coleta: Nome, Endereco, Telefone (NAO pedir CPF salvo NF)
2. Pagamento: oferecer Pix com desconto primeiro
3. Resumo final padronizado para o humano

SEGURANCA:
- Tatame fino (10-20mm) NAO serve para artes marciais com queda. Minimo 30mm.
- Tapete flutuante NAO e salva-vidas.
- Pecas pequenas: criancas acima de 3 anos ou supervisao.

HORARIOS:
- Pedidos ate 16:30: encaixa na rota do dia. Rota sai 14:30.
- Apos 16:30: agendado para amanha.

REGRAS:
- Se nao souber a resposta ou nao tiver certeza, diga que vai acionar o atendente.
- Nunca invente dados que nao estao aqui.
- Responda em portugues brasileiro, curto e direto.`;
}

/**
 * Monta as mensagens para a chamada da OpenAI.
 */
export function buildChatMessages(
  userMessage: string
): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userMessage },
  ];
}

/**
 * Monta as mensagens com historico de conversa do lead.
 */
export function buildChatMessagesWithHistory(
  userMessage: string,
  subscriberId?: string
): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
  ];

  if (subscriberId) {
    const turns = getRecentTurns(subscriberId, 6);
    // Excluir o ultimo turno se for a mensagem atual (ja adicionada pelo pipeline)
    const history = turns.length > 0 && turns[turns.length - 1].content === userMessage
      ? turns.slice(0, -1)
      : turns;
    for (const turn of history) {
      msgs.push({ role: turn.role, content: turn.content });
    }
  }

  msgs.push({ role: "user", content: userMessage });
  return msgs;
}

/**
 * Monta mensagens com imagem (visao).
 */
export function buildVisionMessages(
  userMessage: string,
  imageUrl: string
): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: [
        { type: "text", text: userMessage || "O que voce ve nesta imagem? Responda no contexto de produtos EVA." },
        { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
      ],
    },
  ];
}
