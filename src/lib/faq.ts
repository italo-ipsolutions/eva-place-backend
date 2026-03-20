import { getContext } from "./context-loader.js";
import type { ManyChatResponse } from "../types/index.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Termos que mapeiam para IDs do FAQ */
const FAQ_TERM_MAP: Record<string, string[]> = {
  faq_001: ["como limpar", "como limpo", "limpa", "limpo", "lavar", "limpeza", "sabao"],
  faq_002: ["sol", "chuva", "molhar", "area externa", "quintal"],
  faq_004: ["flutuante lavar", "cloro", "piscina lavar"],
  faq_005: ["durabilidade", "dura quanto", "vida util"],
  faq_006: ["que horas chega", "horario entrega", "quando chega", "previsao"],
  faq_007: ["fora de fortaleza", "interior", "outro estado", "entrega fora"],
  faq_008: ["idade", "crianca", "bebe pode", "recomendado"],
  faq_009: ["jiu-jitsu", "jiu jitsu", "luta", "judo", "karate", "arte marcial"],
  faq_010: ["desconto pix", "pix desconto", "desconto"],
  faq_011: ["parcela", "parcelamento", "quantas vezes", "cartao"],
  faq_012: ["nota fiscal", "emitir nf", "preciso de nf", "cnpj", "cpf na nota"],
  faq_013: ["onde fica", "endereco loja", "retirar", "loja fisica"],
  faq_014: ["quanto mede", "area montado", "tamanho montado"],
  faq_015: ["salva-vidas", "salva vidas", "flutuante seguro"],
};

/** Checa se o termo aparece na mensagem como palavra (evita falso positivo de substring) */
function termMatches(query: string, term: string): boolean {
  // Termos com multiplas palavras (frases): includes basta
  if (term.includes(" ")) {
    return query.includes(term);
  }
  // Termos de uma palavra: exigir word boundary para evitar "quantidade" casar com "idade"
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`);
  return regex.test(query);
}

/** Tenta encontrar uma resposta no FAQ */
export function matchFaq(message: string): ManyChatResponse | null {
  const ctx = getContext();
  const q = normalize(message);

  for (const [faqId, terms] of Object.entries(FAQ_TERM_MAP)) {
    if (terms.some((t) => termMatches(q, t))) {
      const item = ctx.faq.perguntas.find((p) => p.id === faqId);
      if (!item) continue;

      if (!item.resolve_automaticamente) {
        return {
          reply: `Boa pergunta! Vou acionar nosso atendente pra te responder isso com mais detalhe, tudo bem? So um minutinho 😉`,
          action: "escalate",
          add_tags: ["escalar_humano"],
          _debug: { matched_intent: faqId, source: "faq", confidence: "high" },
        };
      }

      return {
        reply: item.resposta_curta,
        action: item.acao_adicional === "redirecionar_site" ? "redirect_site" : "reply",
        _debug: { matched_intent: faqId, source: "faq", confidence: "high" },
      };
    }
  }

  return null;
}
