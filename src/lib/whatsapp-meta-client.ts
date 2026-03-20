/**
 * Cliente HTTP para a WhatsApp Cloud API da Meta.
 *
 * Responsavel por:
 * - Enviar mensagens de texto ao contato
 * - Marcar mensagens como lidas (blue ticks)
 * - Baixar midia (audio/imagem) recebida
 *
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { logInfo, logError, logWarn } from "./logger.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_VERSION = process.env.META_WHATSAPP_API_VERSION || "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getAccessToken(): string {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("META_WHATSAPP_ACCESS_TOKEN nao configurado");
  return token;
}

function getPhoneNumberId(): string {
  const id = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("META_WHATSAPP_PHONE_NUMBER_ID nao configurado");
  return id;
}

/** Verifica se as credenciais Meta estao configuradas */
export function isMetaWhatsAppConfigured(): boolean {
  return !!(
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID
  );
}

// ---------------------------------------------------------------------------
// Enviar mensagem de texto
// ---------------------------------------------------------------------------

export interface SendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Envia uma mensagem de texto para um numero WhatsApp.
 *
 * @param to — numero do destinatario (formato internacional sem +, ex: "5585998725377")
 * @param text — texto da mensagem
 */
export async function sendTextMessage(to: string, text: string): Promise<SendTextResult> {
  const phoneNumberId = getPhoneNumberId();
  const token = getAccessToken();
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  logInfo("whatsapp_meta_send", {
    to,
    text_length: text.length,
    text_preview: text.slice(0, 80),
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg = JSON.stringify(data);
      logError("whatsapp_meta_send_error", new Error(errMsg), { to, status: res.status });
      return { success: false, error: errMsg };
    }

    const messages = data.messages as Array<{ id: string }> | undefined;
    const messageId = messages?.[0]?.id;

    logInfo("whatsapp_meta_send_ok", { to, message_id: messageId });
    return { success: true, messageId };
  } catch (err) {
    logError("whatsapp_meta_send_exception", err, { to });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Marcar mensagem como lida (blue ticks)
// ---------------------------------------------------------------------------

/**
 * Marca uma mensagem como "read" na conversa do WhatsApp.
 * Gera o double blue tick no aparelho do cliente.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const phoneNumberId = getPhoneNumberId();
  const token = getAccessToken();
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch (err) {
    // Nao critico — apenas loga
    logWarn("whatsapp_meta_mark_read_failed", {
      message_id: messageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Download de midia (audio, imagem)
// ---------------------------------------------------------------------------

/**
 * Baixa midia do WhatsApp Cloud API em dois passos:
 * 1. GET /media_id → obter URL temporaria
 * 2. GET URL → baixar binario
 *
 * Retorna a URL temporaria (valida por ~5min) que pode ser passada
 * diretamente para OpenAI Whisper (audio) ou Vision (imagem).
 */
export async function getMediaUrl(mediaId: string): Promise<string | null> {
  const token = getAccessToken();
  const url = `${BASE_URL}/${mediaId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      logError("whatsapp_meta_media_url_error", new Error(`Status ${res.status}`), { media_id: mediaId });
      return null;
    }

    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      logWarn("whatsapp_meta_media_no_url", { media_id: mediaId });
      return null;
    }

    logInfo("whatsapp_meta_media_url_ok", { media_id: mediaId });
    return data.url;
  } catch (err) {
    logError("whatsapp_meta_media_url_exception", err, { media_id: mediaId });
    return null;
  }
}

/**
 * Baixa o conteudo binario de uma media URL do WhatsApp (precisa do token).
 * Retorna o buffer ou null em caso de erro.
 */
export async function downloadMedia(mediaUrl: string): Promise<Buffer | null> {
  const token = getAccessToken();

  try {
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      logError("whatsapp_meta_download_error", new Error(`Status ${res.status}`), { url: mediaUrl.slice(0, 80) });
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    logInfo("whatsapp_meta_download_ok", { size_bytes: buffer.length });
    return buffer;
  } catch (err) {
    logError("whatsapp_meta_download_exception", err);
    return null;
  }
}
