/**
 * Classificador de intencao leve.
 * Roda ANTES do pipeline para decidir a ordem de prioridade dos matchers.
 * Evita contaminacao cruzada (ex: memoria de produto poluindo resposta de frete).
 */

export type IntentType = "frete" | "produto" | "pagamento" | "saudacao" | "faq" | "geral";

export interface DetectedIntent {
  primary: IntentType;
  confidence: "high" | "medium" | "low";
  /** Dimensoes do espaco, se detectadas (ex: "4x3" -> 4m x 3m) */
  dimensions?: { widthM: number; heightM: number; totalPieces50x50: number };
  /** Caso de uso detectado (bebe, jiu-jitsu, escola, etc.) */
  useCase?: string;
  /** Espessura sugerida com base no uso (pode ser sobrescrita por explicitThicknessMm) */
  suggestedThicknessMm?: number;
  /** Quantidade de pecas mencionada (ex: "12 pecas") */
  quantity?: number;
  /** Tamanho EXPLICITO do produto mencionado (ex: "1x1", "50x50", "1 metro") */
  explicitSize?: "50x50" | "1x1";
  /** Espessura EXPLICITA mencionada (ex: "20mm", "30mm") — tem prioridade sobre suggestedThicknessMm */
  explicitThicknessMm?: number;
  /** Se a mensagem e uma pergunta de disponibilidade ("tem?", "voces tem?") */
  isAvailabilityQuestion?: boolean;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ---- Padroes de frete ----
const FRETE_PATTERNS: RegExp[] = [
  /\bfrete\b/,
  /\bentrega\b/,
  /\benvio\b/,
  /\bmotoboy\b/,
  /\bretirada\b/,
  /\bretirar\b/,
  /\bbuscar\b/,
  /\bzona\b/,
  /\bvalor\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bquanto\s*(custa|e|fica|sai)\s*(a|o)?\s*(entrega|frete)\b/,
  /\bqual\s*(e|o)?\s*(valor|preco|custo)\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bpreco\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\bcusto\s*(da|do|de)?\s*(entrega|frete)\b/,
  /\btaxa\s*(de)?\s*entrega\b/,
  /\bentrega\s+pra\b/,
  /\bentreg(a|am)\s+(em|pra|para|no|na)\b/,
];

// ---- Padroes de produto ----
const PRODUTO_PATTERNS: RegExp[] = [
  /\btatame\b/,
  /\btapete\s*(eva|de encaixe)?\b/,
  /\beva\b/,
  /\bpiso\s*eva\b/,
  /\b50\s*x\s*50\b/,
  /\b1\s*x\s*1\s*m?\b/,
  /\bquero\s*(comprar|um|uma|o|a)?\b/,
  /\bprecis[oa]\b/,
  /\btem\s*(tatame|tapete|piso)\b/,
  /\bpreco\s*(do|da|de)?\s*(tatame|tapete|piso)\b/,
  /\bquant[oa]\s*(custa|e|fica|sai)\s*(o|a)?\s*(tatame|tapete|piso)\b/,
  /\bvalor\s*(do|da|de)?\s*(tatame|tapete|piso)\b/,
  /\byoga\b/,
  /\bflutuante\b/,
  /\bstep\b/,
  /\bprancha\b/,
  /\bcantoneira\b/,
  /\bamarelinha\b/,
  /\balfabeto\b/,
];

// ---- Padroes de pagamento ----
const PAGAMENTO_PATTERNS: RegExp[] = [
  /\bpix\b/,
  /\bparcela(r|mento|s)?\b/,
  /\bcartao\b/,
  /\bpagamento\b/,
  /\bformas?\s*(de)?\s*pag(ar|amento)\b/,
  /\bdesconto\b/,
  /\bboleto\b/,
  /\bquantas\s*vezes\b/,
];

// ---- Padroes de saudacao ----
const SAUDACAO_PATTERNS: RegExp[] = [
  /^(oi|ola|bom\s*dia|boa\s*tarde|boa\s*noite|eai|e\s*ai|hey|hello|hi|opa)\b/,
];

// ---- Deteccao de TAMANHO EXPLICITO do produto ----
// Estas regex detectam quando o usuario esta falando do TAMANHO do produto, nao do espaco.
const EXPLICIT_SIZE_1x1: RegExp[] = [
  /\b1\s*x\s*1\s*m?\b/,                       // 1x1, 1x1m
  /\b100\s*x\s*100\b/,                         // 100x100
  /\b1\s*metro\b/,                             // 1 metro
  /\bum\s*metro\b/,                            // um metro
  /\bplaca\s*(de)?\s*1/,                       // placa de 1...
  /\bprofissional\b/,                          // profissional (sempre 1x1)
];

const EXPLICIT_SIZE_50x50: RegExp[] = [
  /\b50\s*x\s*50\b/,                           // 50x50
];

// ---- Deteccao de ESPESSURA EXPLICITA ----
const EXPLICIT_THICKNESS_REGEX = /\b(\d+)\s*mm\b/i;

// ---- Deteccao de pergunta de disponibilidade ----
const AVAILABILITY_PATTERNS: RegExp[] = [
  /\btem\b/,
  /\bvoces?\s*tem\b/,
  /\bteria\b/,
  /\bexiste\b/,
  /\bdispon[ií]vel\b/,
  /\btem\s+em\s+estoque\b/,
  /\bestoque\b/,
];

// ---- Deteccao de dimensoes de ESPACO (ex: "4x3", "meu espaco tem 4x3") ----
// IMPORTANTE: NxN onde N <= 1 NAO e dimensao de espaco, e tamanho de produto
const DIMENSION_REGEX = /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:x|por)\s*(\d+(?:[.,]\d+)?)\s*(?:m(?:etros?)?)?\b/i;

// Contexto que indica que a dimensao e de espaco (nao de produto)
const SPACE_CONTEXT_PATTERNS: RegExp[] = [
  /\bespaco\b/,
  /\bquarto\b/,
  /\bsala\b/,
  /\barea\b/,
  /\bambiente\b/,
  /\bcomodo\b/,
  /\bdojo\b/,
  /\bacademia\b/,
  /\bescola\b/,
  /\bmeu\s/,
  /\bminha\s/,
  /\bmede\b/,
  /\btamanho\s*(do|da|de)\b/,
];

// ---- Deteccao de quantidade (ex: "12 pecas", "quero 20") ----
const QUANTITY_REGEX = /\b(\d+)\s*(?:pecas?|unidades?|placas?|tatames?|pecas)\b/i;
const QUANTITY_PREFIX_REGEX = /\bquer[oa]?\s+(\d+)\b/i;

// ---- Mapeamento de uso -> espessura ----
const USE_CASE_MAP: Array<{ patterns: RegExp[]; useCase: string; thicknessMm: number; productSize: "50x50" | "1x1" }> = [
  {
    patterns: [/\bbeb[eê]\b/, /\bengatinha/, /\bnem[eê]m\b/, /\binfantil\b/, /\bcrianca\b/],
    useCase: "bebe",
    thicknessMm: 10,
    productSize: "50x50",
  },
  {
    patterns: [/\bescola\b/, /\bpedagogic[oa]\b/, /\bsala\s*de\s*aula\b/],
    useCase: "escola",
    thicknessMm: 10,
    productSize: "50x50",
  },
  {
    patterns: [/\bacademia\b/, /\bpilates\b/, /\bfuncional\b/, /\bginastica\b/],
    useCase: "academia",
    thicknessMm: 20,
    productSize: "1x1",
  },
  {
    patterns: [/\bjiu[\s-]*jitsu\b/, /\bjudo\b/, /\bkarate\b/, /\bluta\b/, /\bdojo\b/, /\barte\s*marcial\b/],
    useCase: "artes_marciais",
    thicknessMm: 30,
    productSize: "1x1",
  },
  {
    patterns: [/\bplayground\b/, /\bpular\b/, /\bcorrer\b/, /\bbrincar\b/, /\bbrincadeira\b/, /\bparquinho\b/],
    useCase: "playground",
    thicknessMm: 20,
    productSize: "50x50",
  },
  {
    patterns: [/\bquarto\b/, /\bsala\b/, /\bespaco\b/],
    useCase: "ambiente",
    thicknessMm: 10,
    productSize: "50x50",
  },
];

function countMatches(q: string, patterns: RegExp[]): number {
  return patterns.filter((p) => p.test(q)).length;
}

/**
 * Detecta tamanho explicito do produto na mensagem.
 * "1x1" ou "100x100" ou "1 metro" → tamanho 1x1m
 * "50x50" → tamanho 50x50cm
 */
function detectExplicitSize(q: string): "50x50" | "1x1" | undefined {
  if (EXPLICIT_SIZE_50x50.some((p) => p.test(q))) return "50x50";
  if (EXPLICIT_SIZE_1x1.some((p) => p.test(q))) return "1x1";
  return undefined;
}

/**
 * Detecta espessura explicita na mensagem.
 * "20mm" → 20, "30mm" → 30, etc.
 */
function detectExplicitThickness(q: string): number | undefined {
  const match = q.match(EXPLICIT_THICKNESS_REGEX);
  if (!match) return undefined;
  const mm = parseInt(match[1], 10);
  // Somente espessuras que existem no catalogo
  if ([5, 8, 10, 15, 20, 30, 40].includes(mm)) return mm;
  return undefined;
}

/**
 * Extrai dimensoes do ESPACO mencionadas na mensagem.
 * "meu espaco tem 4x3" → 4m x 3m → 48 pecas de 50x50cm
 *
 * IMPORTANTE: Se NxN parece ser um tamanho de PRODUTO (1x1, 50x50, 100x100),
 * retorna undefined — nao e dimensao de espaco.
 */
function parseDimensions(q: string): DetectedIntent["dimensions"] | undefined {
  const match = q.match(DIMENSION_REGEX);
  if (!match) return undefined;

  const w = parseFloat(match[1].replace(",", "."));
  const h = parseFloat(match[2].replace(",", "."));

  // Ignorar dimensoes absurdas (> 20m) ou muito pequenas (< 0.5m)
  if (w < 0.5 || h < 0.5 || w > 20 || h > 20) return undefined;

  // Se ambos os lados sao <= 1m, provavelmente e tamanho de produto (1x1m), NAO espaco
  if (w <= 1 && h <= 1) return undefined;

  // Se os numeros parecem cm de produto (50x50, 100x100), nao e espaco
  if ((w === 50 && h === 50) || (w === 100 && h === 100) || (w === 30 && h === 30)) return undefined;

  // Se nao tem contexto de espaco E parece spec de produto, ignorar
  const hasSpaceContext = SPACE_CONTEXT_PATTERNS.some((p) => p.test(q));
  // Dimensoes pequenas (2x2, 2x3) sem contexto de espaco podem ser ambiguas
  // Mas dimensoes maiores (4x3, 6x6) geralmente sao espacos
  if (w <= 2 && h <= 2 && !hasSpaceContext) return undefined;

  const cols = Math.ceil(w * 2);
  const rows = Math.ceil(h * 2);
  return { widthM: w, heightM: h, totalPieces50x50: cols * rows };
}

/**
 * Extrai quantidade de pecas mencionada na mensagem.
 */
function parseQuantity(q: string): number | undefined {
  const match = q.match(QUANTITY_REGEX) || q.match(QUANTITY_PREFIX_REGEX);
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  return n > 0 && n < 1000 ? n : undefined;
}

/**
 * Detecta caso de uso (bebe, academia, etc.)
 */
function detectUseCase(q: string): { useCase: string; thicknessMm: number; productSize: "50x50" | "1x1" } | undefined {
  for (const entry of USE_CASE_MAP) {
    if (entry.patterns.some((p) => p.test(q))) {
      return { useCase: entry.useCase, thicknessMm: entry.thicknessMm, productSize: entry.productSize };
    }
  }
  return undefined;
}

/**
 * Detecta se a mensagem e uma pergunta de disponibilidade.
 */
function isAvailabilityQuestion(q: string): boolean {
  return AVAILABILITY_PATTERNS.some((p) => p.test(q));
}

/**
 * Classifica a intencao principal da mensagem.
 *
 * PRIORIDADE DE DETECCAO:
 * 1. Tamanho/espessura EXPLICITOS (ex: "1x1 20mm") → prioridade maxima
 * 2. Caso de uso (ex: "jiu-jitsu") → sugere tamanho/espessura
 * 3. Dimensoes de espaco (ex: "4x3") → calcula pecas
 * 4. Termos genericos (ex: "tatame") → fallback
 */
export function detectIntent(message: string): DetectedIntent {
  const q = normalize(message);

  // Saudacao (so se for inicio de frase e curta)
  if (q.length < 30 && SAUDACAO_PATTERNS.some((p) => p.test(q))) {
    const withoutGreeting = q.replace(SAUDACAO_PATTERNS[0], "").trim();
    if (withoutGreeting.length < 5) {
      return { primary: "saudacao", confidence: "high" };
    }
  }

  // ---- Deteccoes explicitas (prioridade maxima) ----
  const explicitSize = detectExplicitSize(q);
  const explicitThicknessMm = detectExplicitThickness(q);
  const availability = isAvailabilityQuestion(q);

  const freteScore = countMatches(q, FRETE_PATTERNS);
  const produtoScore = countMatches(q, PRODUTO_PATTERNS);
  const pagamentoScore = countMatches(q, PAGAMENTO_PATTERNS);

  const dimensions = parseDimensions(q);
  const quantity = parseQuantity(q);
  const useCaseResult = detectUseCase(q);

  // Determinar espessura final: explicita > uso > default
  // Determinar tamanho final: explicito > uso > nenhum
  let finalThicknessMm = explicitThicknessMm ?? useCaseResult?.thicknessMm;
  const finalSize = explicitSize ?? useCaseResult?.productSize;

  // Se tem spec explicita de tamanho ou espessura, e produto com certeza
  const hasExplicitSpec = explicitSize !== undefined || explicitThicknessMm !== undefined;

  // ---- Frete ----
  if (freteScore > 0 && produtoScore === 0 && !hasExplicitSpec) {
    return {
      primary: "frete",
      confidence: freteScore >= 2 ? "high" : "medium",
      dimensions,
      quantity,
      useCase: useCaseResult?.useCase,
      suggestedThicknessMm: finalThicknessMm,
      explicitSize: finalSize,
      explicitThicknessMm,
      isAvailabilityQuestion: availability,
    };
  }

  if (freteScore > 0 && produtoScore > 0 && !hasExplicitSpec) {
    if (freteScore >= produtoScore) {
      return {
        primary: "frete",
        confidence: "high",
        dimensions,
        quantity,
        useCase: useCaseResult?.useCase,
        suggestedThicknessMm: finalThicknessMm,
        explicitSize: finalSize,
        explicitThicknessMm,
        isAvailabilityQuestion: availability,
      };
    }
  }

  // ---- Pagamento ----
  if (pagamentoScore > 0 && produtoScore === 0 && freteScore === 0 && !hasExplicitSpec) {
    return { primary: "pagamento", confidence: pagamentoScore >= 2 ? "high" : "medium" };
  }

  // ---- Produto (spec explicita OU termos OU uso OU dimensoes) ----
  if (hasExplicitSpec || produtoScore > 0 || dimensions || useCaseResult) {
    return {
      primary: "produto",
      confidence: hasExplicitSpec ? "high" : (produtoScore >= 2 || dimensions ? "high" : "medium"),
      dimensions,
      quantity,
      useCase: useCaseResult?.useCase,
      suggestedThicknessMm: finalThicknessMm,
      explicitSize: finalSize,
      explicitThicknessMm,
      isAvailabilityQuestion: availability,
    };
  }

  return { primary: "geral", confidence: "low" };
}
