// --- Payloads ManyChat ---

export interface ManyChatInboundPayload {
  /** ID do subscriber no ManyChat */
  subscriber_id: string;
  /** Nome do subscriber */
  name: string;
  /** Mensagem enviada pelo cliente (texto livre) */
  message?: string;
  /** Telefone (formato WhatsApp) */
  phone?: string;
  /** URL de audio enviado pelo cliente */
  audio_url?: string;
  /** URL de imagem enviada pelo cliente */
  image_url?: string;
  /** Custom fields do ManyChat */
  custom_fields?: Record<string, string | number | null>;
  /** Tags atuais do subscriber */
  tags?: string[];
}

export interface ManyChatResponse {
  /** Texto de resposta para o ManyChat devolver ao cliente */
  reply: string;
  /** Acao para o ManyChat executar */
  action: "reply" | "escalate" | "redirect_site";
  /** Tags para adicionar no ManyChat */
  add_tags?: string[];
  /** Custom fields para atualizar */
  set_fields?: Record<string, string | number>;
  /** Metadados internos (debug) */
  _debug?: {
    matched_intent: string;
    source: string;
    confidence: "high" | "medium" | "low";
  };
}

// --- Base de Contexto ---

export interface TabelaPreco {
  faixa: string;
  preco_total: number | null;
  preco_unitario: number;
  nota?: string;
}

export interface VarianteTatame50 {
  espessura_mm: number;
  uso_recomendado: string;
  argumento_comercial: string;
  tabela_precos: TabelaPreco[];
  cores_disponiveis: string[];
  cores_em_falta: string[];
  restricoes: string[];
}

export interface ProdutoSimples {
  modelo: string;
  preco?: number;
  argumento_comercial?: string;
  argumento?: string;
  cores_disponiveis?: string[];
  tamanho?: string;
  espessura_mm?: number;
  [key: string]: unknown;
}

export interface CategoriaProduto {
  id: string;
  nome: string;
  descricao?: string;
  variantes?: VarianteTatame50[];
  produtos?: ProdutoSimples[];
  preco_unico?: number;
  [key: string]: unknown;
}

export interface CatalogoDB {
  _meta: Record<string, string>;
  categorias: CategoriaProduto[];
}

export interface ZonaFrete {
  zona: number;
  valor: number;
  cidades: string[];
  tipo_padrao: string;
}

export interface FreteDB {
  _meta: Record<string, string>;
  area_atendimento: string;
  zonas: ZonaFrete[];
  retirada: {
    valor: number;
    endereco: string;
    horario_semana: string;
    horario_sabado: string;
    domingo: string;
  };
  protocolo_moto_vs_carro: Array<{
    tipo_produto: string;
    frete: string;
    condicao?: string;
    acao: string;
    script?: string;
  }>;
  fora_da_regiao: {
    acao: string;
    redirecionar_para: string;
    script: string;
    link_site: string;
  };
}

export interface FaqItem {
  id: string;
  pergunta: string;
  resposta_curta: string;
  categoria: string;
  resolve_automaticamente: boolean;
  escalar_para?: string;
  acao_adicional?: string;
}

export interface FaqDB {
  _meta: Record<string, string>;
  perguntas: FaqItem[];
}

export interface FatorParcela {
  parcelas: number;
  taxa_percentual: number;
  fator: number;
}

export interface RegrasNegocioDB {
  _meta: Record<string, string>;
  empresa: Record<string, string>;
  desconto_pix: { percentual: number; aplica_sobre: string; inclui_frete: boolean };
  parcelamento: { sem_juros_ate: number; maximo_parcelas: number; fatores: FatorParcela[] };
  escalar_para_humano: Array<{ situacao: string; motivo: string }>;
  persona: Record<string, unknown>;
  [key: string]: unknown;
}
