import type { ManyChatInboundPayload } from "../types/index.js";
import { logInfo, logWarn } from "./logger.js";

/**
 * Payload bruto do ManyChat — campos possiveis tanto no formato flat
 * (JSON manual no body) quanto dentro de `subscriber` (Add Full Contact Data).
 *
 * Referencia: https://support.manychat.com/support/solutions/articles/36000191805
 */
interface ManyChatRawFlat {
  // Campos que normalmente vem do ManyChat
  id?: string | number;
  key?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  whatsapp_phone?: string;

  // Mensagem pode vir em diferentes campos
  last_input_text?: string;
  message?: string;
  text?: string;
  user_input?: string;

  // Midia
  last_input_audio?: string;
  audio_url?: string;
  last_input_image?: string;
  image_url?: string;

  // Tags e custom fields
  tags?: Array<string | { name?: string; [k: string]: unknown }>;
  custom_fields?: Record<string, unknown> | Array<{ name?: string; value?: unknown; [k: string]: unknown }>;

  // Qualquer outro campo
  [key: string]: unknown;
}

/**
 * Formato nativo do ManyChat quando se usa "Add Full Contact Data".
 * Tudo vem dentro de `subscriber`.
 */
interface ManyChatNativePayload {
  version?: string;
  subscriber: ManyChatRawFlat;
  [key: string]: unknown;
}

/**
 * Detecta se o payload e nativo (com `subscriber`) ou flat (campos na raiz).
 * Retorna os campos flat para processamento uniforme.
 */
function flattenPayload(raw: Record<string, unknown>): { flat: ManyChatRawFlat; format: "native" | "flat" } {
  // Formato nativo: tem objeto `subscriber` com pelo menos `id` ou `key`
  if (
    raw.subscriber &&
    typeof raw.subscriber === "object" &&
    !Array.isArray(raw.subscriber)
  ) {
    const sub = raw.subscriber as ManyChatRawFlat;
    // Confirma que parece um subscriber valido
    if (sub.id !== undefined || sub.key !== undefined || sub.whatsapp_phone !== undefined) {
      return { flat: sub, format: "native" };
    }
  }
  // Formato flat: campos direto na raiz
  return { flat: raw as ManyChatRawFlat, format: "flat" };
}

/**
 * Extrai tags como array de strings, lidando com o formato nativo
 * (que pode vir como array de objetos com { name: "tag" }).
 */
function extractTags(raw: ManyChatRawFlat): string[] | undefined {
  if (!raw.tags || !Array.isArray(raw.tags)) return undefined;
  return raw.tags.map((t) => {
    if (typeof t === "string") return t;
    if (typeof t === "object" && t !== null && typeof t.name === "string") return t.name;
    return String(t);
  });
}

/**
 * Extrai custom_fields como Record<string, string|number|null>.
 * ManyChat nativo pode enviar como array de { name, value } ou como objeto.
 */
function extractCustomFields(raw: ManyChatRawFlat): Record<string, string | number | null> | undefined {
  if (!raw.custom_fields) return undefined;

  // Se ja for objeto plano
  if (!Array.isArray(raw.custom_fields)) {
    const result: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(raw.custom_fields)) {
      result[k] = v === null || v === undefined ? null : typeof v === "number" ? v : String(v);
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Se for array de { name, value }
  const result: Record<string, string | number | null> = {};
  for (const item of raw.custom_fields) {
    if (typeof item === "object" && item !== null && typeof item.name === "string") {
      const v = item.value;
      result[item.name] = v === null || v === undefined ? null : typeof v === "number" ? v : String(v);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Normaliza o payload bruto do ManyChat para o formato interno do backend.
 *
 * Aceita dois formatos:
 * 1. **Nativo** ("Add Full Contact Data"): `{ subscriber: { id, name, last_input_text, ... } }`
 * 2. **Flat** (JSON manual no body): `{ id, full_name, last_input_text, ... }`
 *
 * Loga o formato detectado e campos extraidos para facilitar debug.
 */
export function parseManyChatPayload(raw: Record<string, unknown>): ManyChatInboundPayload {
  const { flat, format } = flattenPayload(raw);

  // Log do formato detectado (sem dados sensiveis, apenas estrutura)
  logInfo("manychat_parser", {
    format,
    has_id: flat.id !== undefined,
    has_key: flat.key !== undefined,
    has_last_input_text: !!flat.last_input_text,
    has_message: !!flat.message,
    has_audio: !!(flat.last_input_audio || flat.audio_url),
    has_image: !!(flat.last_input_image || flat.image_url),
    has_tags: !!flat.tags,
    has_custom_fields: !!flat.custom_fields,
    raw_keys: Object.keys(flat).slice(0, 20),
  });

  // Subscriber ID: tentar varias opcoes
  const subscriberId = String(
    flat.id ?? flat.key ?? flat.whatsapp_phone ?? flat.phone ?? "unknown"
  );

  // Nome: tentar varias combinacoes
  const name =
    flat.full_name ??
    flat.name ??
    (flat.first_name && flat.last_name
      ? `${flat.first_name} ${flat.last_name}`
      : flat.first_name ?? "?");

  // Telefone
  const phone = flat.whatsapp_phone ?? flat.phone ?? undefined;

  // Mensagem de texto: tentar varias fontes
  const message =
    flat.last_input_text ??
    flat.message ??
    flat.text ??
    flat.user_input ??
    undefined;

  // Audio URL
  const audioUrl =
    flat.last_input_audio ??
    flat.audio_url ??
    undefined;

  // Image URL
  const imageUrl =
    flat.last_input_image ??
    flat.image_url ??
    undefined;

  // Tags e custom fields
  const tags = extractTags(flat);
  const customFields = extractCustomFields(flat);

  // Warn se nao encontrou mensagem, audio ou imagem
  if (!message && !audioUrl && !imageUrl) {
    logWarn("manychat_parser_no_content", {
      subscriber_id: subscriberId,
      format,
      hint: "Payload sem last_input_text, audio ou imagem. Verifique configuracao no ManyChat.",
      available_keys: Object.keys(flat).filter(k =>
        !["id", "key", "name", "first_name", "last_name", "full_name", "phone", "whatsapp_phone",
          "tags", "custom_fields", "profile_pic", "locale", "language", "timezone",
          "gender", "status", "page_id", "live_chat_url", "subscribed",
          "last_interaction", "last_seen", "is_followup_enabled"].includes(k)
      ),
    });
  }

  return {
    subscriber_id: subscriberId,
    name: String(name),
    message: message ? String(message) : undefined,
    phone: phone ? String(phone) : undefined,
    audio_url: audioUrl ? String(audioUrl) : undefined,
    image_url: imageUrl ? String(imageUrl) : undefined,
    custom_fields: customFields,
    tags,
  };
}
