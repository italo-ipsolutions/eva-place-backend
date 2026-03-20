import { getContext } from "./context-loader.js";
import type { CategoriaProduto, ManyChatResponse } from "../types/index.js";

/** Normaliza texto para busca: lowercase, sem acentos */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Checa se o termo aparece como palavra inteira (frases usam includes) */
function termMatches(query: string, term: string): boolean {
  if (term.includes(" ")) return query.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`).test(query);
}

/** Busca categorias/produtos que casam com a mensagem */
export function findProduct(message: string): CategoriaProduto | null {
  const ctx = getContext();
  const q = normalize(message);

  // Mapeamento de termos comuns para IDs de categoria
  const termMap: Record<string, string[]> = {
    tatame_50x50: ["tatame", "tapete eva", "50x50", "bebe", "engatinhar", "piso eva"],
    tatame_1x1m: ["1x1", "profissional", "jiu-jitsu", "jiu jitsu", "jiujitsu", "judo", "karate", "dojo", "luta"],
    tapetes_encaixe_kids: ["alfabeto", "letras", "numeros", "animais", "amarelinha", "pedagogico", "educativo", "escola"],
    rolos_esteiras: ["rolo", "esteira", "pista de carrinho", "mesversario"],
    miudezas: ["saco de letras", "pote de letras", "letras soltas"],
    cartelas_avulsas: ["cartela", "jogo da velha", "tangram", "tabuada", "domino", "jogo de memoria", "dama", "resta um"],
    yoga_mat: ["yoga", "tapete yoga"],
    cantoneira: ["cantoneira", "protecao quina", "protecao de canto"],
    step_eva: ["step eva", "step de exercicio"],
    flutuante: ["flutuante", "tapete piscina", "boia eva"],
    prancha_natacao: ["prancha natacao", "prancha de nadar"],
    protetor_porta: ["protetor de porta", "bichinho de porta"],
  };

  for (const [catId, terms] of Object.entries(termMap)) {
    if (terms.some((t) => termMatches(q, t))) {
      const cat = ctx.catalogo.categorias.find((c) => c.id === catId);
      if (cat) return cat;
    }
  }

  return null;
}

/** Gera resposta sobre produto encontrado */
export function buildProductReply(cat: CategoriaProduto): ManyChatResponse {
  // Tatame 50x50 com variantes e tabela de preco
  if (cat.variantes?.length) {
    const v = cat.variantes[0]; // mostra o mais basico primeiro (10mm)
    const kitSugerido = v.tabela_precos.find((t) => t.faixa === "Kit 12");
    const avulso = v.tabela_precos[0];

    const reply = [
      `Opa! Temos sim o ${cat.nome} 😊`,
      ``,
      `O de ${v.espessura_mm}mm e ideal pra ${v.uso_recomendado}.`,
      `👉 Avulso: R$ ${avulso.preco_unitario.toFixed(2)} cada`,
      kitSugerido
        ? `👉 Kit 12: R$ ${kitSugerido.preco_total?.toFixed(2)} (R$ ${kitSugerido.preco_unitario.toFixed(2)} cada — compensa mais!)`
        : "",
      ``,
      `Temos ${v.cores_disponiveis.length} cores disponiveis.`,
      v.cores_em_falta.length ? `(${v.cores_em_falta.join(", ")} estao em falta no momento)` : "",
      ``,
      `Quantas pecas voce precisa? Posso simular o melhor kit pra voce!`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      reply,
      action: "reply",
      add_tags: ["lead_qualificado"],
      _debug: { matched_intent: "produto_tatame_50x50", source: "catalogo", confidence: "high" },
    };
  }

  // Produtos simples (Kids, rolos, etc)
  if (cat.produtos?.length) {
    const items = cat.produtos.slice(0, 3);
    const lines = items.map((p) => {
      const preco = p.preco ?? (cat as any).preco_unico;
      return `👉 ${p.modelo}: R$ ${preco?.toFixed(2) ?? "consulte"} — ${p.argumento_comercial ?? p.argumento ?? ""}`;
    });

    const reply = [`Temos sim! ${cat.nome} 🎉`, ``, ...lines, ``, `Qual te interessa?`].join("\n");

    return {
      reply,
      action: "reply",
      add_tags: ["lead_qualificado"],
      _debug: { matched_intent: `produto_${cat.id}`, source: "catalogo", confidence: "high" },
    };
  }

  return {
    reply: `Temos ${cat.nome}! Quer que eu te mostre as opcoes e precos?`,
    action: "reply",
    _debug: { matched_intent: `produto_${cat.id}`, source: "catalogo", confidence: "medium" },
  };
}
