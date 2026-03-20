import type { ManyChatInboundPayload } from "../types/index.js";

/**
 * Payload bruto do ManyChat (External Request / JSON API Action).
 * O ManyChat envia custom fields diretamente no body.
 * A estrutura exata depende de como o flow foi configurado.
 *
 * Referencia: https://support.manychat.com/support/solutions/articles/36000191805
 */
interface ManyChatRawPayload {
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

  // Custom fields (podem ter qualquer nome)
  [key: string]: unknown;
}

/**
 * Normaliza o payload bruto do ManyChat para o formato interno do backend.
 * Lida com variações de nomenclatura entre diferentes configurações de flow.
 */
export function parseManyChatPayload(raw: ManyChatRawPayload): ManyChatInboundPayload {
  // Subscriber ID: tentar varias opcoes
  const subscriberId = String(
    raw.id ?? raw.key ?? raw.whatsapp_phone ?? raw.phone ?? "unknown"
  );

  // Nome: tentar varias combinacoes
  const name =
    raw.full_name ??
    raw.name ??
    (raw.first_name && raw.last_name
      ? `${raw.first_name} ${raw.last_name}`
      : raw.first_name ?? "?");

  // Telefone
  const phone = raw.whatsapp_phone ?? raw.phone ?? undefined;

  // Mensagem de texto: tentar varias fontes
  const message =
    raw.last_input_text ??
    raw.message ??
    raw.text ??
    raw.user_input ??
    undefined;

  // Audio URL
  const audioUrl =
    raw.last_input_audio ??
    raw.audio_url ??
    undefined;

  // Image URL
  const imageUrl =
    raw.last_input_image ??
    raw.image_url ??
    undefined;

  return {
    subscriber_id: subscriberId,
    name: String(name),
    message: message ? String(message) : undefined,
    phone: phone ? String(phone) : undefined,
    audio_url: audioUrl ? String(audioUrl) : undefined,
    image_url: imageUrl ? String(imageUrl) : undefined,
  };
}
