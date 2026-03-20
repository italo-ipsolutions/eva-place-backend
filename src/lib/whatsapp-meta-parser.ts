/**
 * Parser para payloads da WhatsApp Cloud API (Meta).
 *
 * Transforma o payload oficial de webhook da Meta no formato interno
 * `ManyChatInboundPayload` — permitindo que o mesmo pipeline de
 * atendimento (catalogo, frete, FAQ, OpenAI) processe a mensagem.
 *
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import type { ManyChatInboundPayload } from "../types/index.js";
import { logInfo, logWarn } from "./logger.js";

// ---------------------------------------------------------------------------
// Tipos do payload webhook da Meta
// ---------------------------------------------------------------------------

export interface MetaWebhookPayload {
  object: string; // "whatsapp_business_account"
  entry: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  value: MetaChangeValue;
  field: string; // "messages"
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface MetaContact {
  profile: { name: string };
  wa_id: string;
}

export interface MetaMessage {
  from: string;          // numero do remetente (ex: "5585998725377")
  id: string;            // wamid.xxx — ID unico da mensagem
  timestamp: string;     // unix timestamp como string
  type: MetaMessageType;

  // Conteudo por tipo
  text?: { body: string };
  image?: MetaMediaPayload;
  audio?: MetaMediaPayload;
  video?: MetaMediaPayload;
  document?: MetaMediaPayload & { filename?: string };
  sticker?: MetaMediaPayload;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  interactive?: { type: string; [k: string]: unknown };
  button?: { text: string; payload: string };
  reaction?: { message_id: string; emoji: string };

  // Contexto (mensagem em resposta a outra)
  context?: { from: string; id: string };
}

type MetaMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "reaction"
  | "unknown";

interface MetaMediaPayload {
  mime_type: string;
  sha256: string;
  id: string;
  caption?: string;
}

interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

// ---------------------------------------------------------------------------
// Resultado do parse
// ---------------------------------------------------------------------------

export interface MetaParseResult {
  /** Payload normalizado no formato interno (mesmo que ManyChat) */
  payload: ManyChatInboundPayload;
  /** ID original da mensagem do WhatsApp (para marcar como lida) */
  wamid: string;
  /** Numero do remetente (formato internacional sem +) */
  from: string;
  /** Tipo original da mensagem */
  originalType: MetaMessageType;
  /** ID da midia (se for audio/imagem/video) */
  mediaId?: string;
  /** MIME type da midia */
  mediaMimeType?: string;
  /** Se e uma notificacao de status (nao e mensagem) */
  isStatus: false;
}

export interface MetaStatusResult {
  isStatus: true;
  status: string;
  messageId: string;
  recipientId: string;
  errors?: Array<{ code: number; title: string }>;
}

export type MetaWebhookResult = MetaParseResult | MetaStatusResult;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Extrai as mensagens do payload webhook da Meta.
 * Retorna array (pode ter mais de uma mensagem por webhook, embora raro).
 * Retorna array vazio se for payload sem mensagens (ex: apenas statuses).
 */
export function parseMetaWebhook(raw: Record<string, unknown>): MetaWebhookResult[] {
  const payload = raw as unknown as MetaWebhookPayload;

  if (payload.object !== "whatsapp_business_account") {
    logWarn("meta_parser_unknown_object", { object: payload.object });
    return [];
  }

  const results: MetaWebhookResult[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // Processar status updates (delivery receipts, etc)
      if (value.statuses?.length) {
        for (const s of value.statuses) {
          results.push({
            isStatus: true,
            status: s.status,
            messageId: s.id,
            recipientId: s.recipient_id,
            errors: s.errors,
          });
        }
      }

      // Processar mensagens inbound
      if (!value.messages?.length) continue;

      const contactMap = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        contactMap.set(c.wa_id, c.profile.name);
      }

      for (const msg of value.messages) {
        const parsed = parseOneMessage(msg, contactMap);
        if (parsed) results.push(parsed);
      }
    }
  }

  logInfo("meta_parser_result", {
    total_results: results.length,
    messages: results.filter((r) => !r.isStatus).length,
    statuses: results.filter((r) => r.isStatus).length,
  });

  return results;
}

/**
 * Converte UMA mensagem do payload Meta para o formato interno.
 */
function parseOneMessage(
  msg: MetaMessage,
  contacts: Map<string, string>
): MetaParseResult | null {
  const from = msg.from;
  const name = contacts.get(from) ?? "?";
  const wamid = msg.id;

  logInfo("meta_parser_message", {
    from,
    type: msg.type,
    wamid,
    has_context: !!msg.context,
  });

  // Base do payload interno
  const base: ManyChatInboundPayload = {
    subscriber_id: `wa_${from}`,  // Prefixo para distinguir de IDs ManyChat
    name,
    phone: from,
  };

  let mediaId: string | undefined;
  let mediaMimeType: string | undefined;

  switch (msg.type) {
    case "text":
      base.message = msg.text?.body;
      break;

    case "image":
      mediaId = msg.image?.id;
      mediaMimeType = msg.image?.mime_type;
      // Caption da imagem serve como mensagem de contexto
      base.message = msg.image?.caption;
      // image_url sera preenchida pela rota apos download
      break;

    case "audio":
      mediaId = msg.audio?.id;
      mediaMimeType = msg.audio?.mime_type;
      // audio_url sera preenchida pela rota apos download
      break;

    case "video":
      // Tratar video como se fosse imagem (pegar caption, se tiver)
      mediaId = msg.video?.id;
      mediaMimeType = msg.video?.mime_type;
      base.message = msg.video?.caption ?? "[video]";
      break;

    case "document":
      base.message = `[documento: ${msg.document?.filename ?? "arquivo"}]`;
      break;

    case "sticker":
      base.message = "[sticker]";
      break;

    case "location":
      base.message = msg.location?.address
        ? `[localizacao: ${msg.location.address}]`
        : `[localizacao: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
      break;

    case "button":
      // Resposta de botao interativo
      base.message = msg.button?.text ?? msg.button?.payload;
      break;

    case "interactive":
      // Resposta de lista/botoes interativos
      const intType = msg.interactive?.type;
      if (intType === "button_reply") {
        base.message = (msg.interactive as Record<string, unknown>)?.button_reply
          ? String(((msg.interactive as Record<string, unknown>).button_reply as Record<string, unknown>)?.title)
          : "[interativo]";
      } else if (intType === "list_reply") {
        base.message = (msg.interactive as Record<string, unknown>)?.list_reply
          ? String(((msg.interactive as Record<string, unknown>).list_reply as Record<string, unknown>)?.title)
          : "[interativo]";
      } else {
        base.message = "[interativo]";
      }
      break;

    case "reaction":
      // Reacoes sao ignoradas pelo pipeline de atendimento
      logInfo("meta_parser_skip_reaction", { wamid, emoji: msg.reaction?.emoji });
      return null;

    default:
      base.message = `[${msg.type}]`;
      logWarn("meta_parser_unknown_type", { type: msg.type, wamid });
  }

  return {
    payload: base,
    wamid,
    from,
    originalType: msg.type,
    mediaId,
    mediaMimeType,
    isStatus: false,
  };
}
