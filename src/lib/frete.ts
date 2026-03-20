import { getContext } from "./context-loader.js";
import type { ManyChatResponse, ZonaFrete } from "../types/index.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Detecta se a mensagem é sobre frete */
export function isFreteQuestion(message: string): boolean {
  const q = normalize(message);

  // Termos diretos
  const directTerms = [
    "frete", "entrega", "envio", "motoboy", "retirada", "retirar", "buscar",
  ];
  if (directTerms.some((t) => q.includes(t))) return true;

  // Frases compostas sobre frete/entrega
  const frasesFrete = [
    /\bvalor\s*(da|do|de)?\s*(entrega|frete)\b/,
    /\bquanto\s*(custa|e|fica|sai)\s*(a|o)?\s*(entrega|frete)\b/,
    /\bqual\s*(e|o)?\s*(valor|preco|custo)\s*(da|do|de)?\s*(entrega|frete)\b/,
    /\bpreco\s*(da|do|de)?\s*(entrega|frete)\b/,
    /\bcusto\s*(da|do|de)?\s*(entrega|frete)\b/,
    /\btaxa\s*(de)?\s*entrega\b/,
    /\bentreg(a|am)\s+(em|pra|para|no|na)\b/,
    /\bzona\s*(de)?\s*(frete|entrega)\b/,
  ];
  if (frasesFrete.some((r) => r.test(q))) return true;

  return false;
}

/** Detecta cidade mencionada e retorna zona */
export function detectZone(message: string): ZonaFrete | null {
  const ctx = getContext();
  const q = normalize(message);

  for (const zona of ctx.frete.zonas) {
    for (const cidade of zona.cidades) {
      if (q.includes(normalize(cidade))) {
        return zona;
      }
    }
  }
  return null;
}

/** Detecta se o cliente é de fora da região */
export function isForaDaRegiao(message: string): boolean {
  const q = normalize(message);
  const cidadesFora = [
    "sobral", "juazeiro", "crato", "iguatu", "quixada", "caninde",
    "sao paulo", "rio de janeiro", "recife", "salvador", "brasilia",
    "belem", "manaus", "curitiba", "belo horizonte", "teresina",
    "interior", "outro estado",
  ];
  return cidadesFora.some((c) => q.includes(c));
}

/** Gera resposta sobre frete */
export function buildFreteReply(message: string): ManyChatResponse {
  const ctx = getContext();

  // Fora da região?
  if (isForaDaRegiao(message)) {
    return {
      reply: ctx.frete.fora_da_regiao.script,
      action: "redirect_site",
      add_tags: ["fora_da_regiao"],
      _debug: { matched_intent: "frete_fora_regiao", source: "regras_frete", confidence: "high" },
    };
  }

  // Retirada?
  const q = normalize(message);
  if (q.includes("retirar") || q.includes("retirada") || q.includes("buscar na loja")) {
    const ret = ctx.frete.retirada;
    return {
      reply: [
        `A retirada e gratis! 🎉`,
        ``,
        `📍 Endereco: ${ret.endereco}`,
        `⏰ ${ret.horario_semana}`,
        `⏰ ${ret.horario_sabado}`,
        `🚫 ${ret.domingo}`,
      ].join("\n"),
      action: "reply",
      add_tags: ["retirada_loja"],
      set_fields: { tipo_frete: "RETIRADA", valor_frete: 0 },
      _debug: { matched_intent: "frete_retirada", source: "regras_frete", confidence: "high" },
    };
  }

  // Zona detectada?
  const zona = detectZone(message);
  if (zona) {
    return {
      reply: [
        `Pra ${zona.cidades.join("/")} o frete e R$ ${zona.valor.toFixed(2)} (${zona.tipo_padrao}) 🚀`,
        ``,
        `Saida a partir das 14:30h. Entrega na mesma tarde!`,
      ].join("\n"),
      action: "reply",
      set_fields: { zona_frete: zona.zona, valor_frete: zona.valor, tipo_frete: "MOTO" },
      _debug: { matched_intent: `frete_zona_${zona.zona}`, source: "regras_frete", confidence: "high" },
    };
  }

  // Genérico sobre frete
  return {
    reply: [
      `Nosso frete e por zona:`,
      `👉 Fortaleza/Maracanau: R$ 10`,
      `👉 Maranguape/Eusebio: R$ 20`,
      `👉 Aquiraz/Caucaia: R$ 30`,
      `👉 Retirada na loja: Gratis!`,
      ``,
      `Qual sua cidade/bairro?`,
    ].join("\n"),
    action: "reply",
    _debug: { matched_intent: "frete_generico", source: "regras_frete", confidence: "medium" },
  };
}
