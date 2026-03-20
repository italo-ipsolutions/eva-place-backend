/**
 * Rotas de webhook para a WhatsApp Cloud API (Meta).
 *
 * Substitui o ManyChat como orquestrador — o backend recebe mensagens
 * diretamente da Meta e responde pela API oficial.
 *
 * Rotas:
 * - GET  /webhooks/whatsapp  — verificacao do webhook (hub.verify_token)
 * - POST /webhooks/whatsapp  — receber mensagens inbound + enviar resposta
 *
 * O pipeline de atendimento e o MESMO usado pelo ManyChat:
 * intent → matchers (frete, FAQ, catalogo) → OpenAI → fallback
 */

import type { FastifyInstance } from "fastify";
import type { ManyChatResponse } from "../types/index.js";
import { parseMetaWebhook } from "../lib/whatsapp-meta-parser.js";
import {
  sendTextMessage,
  markAsRead,
  getMediaUrl,
  isMetaWhatsAppConfigured,
} from "../lib/whatsapp-meta-client.js";
import { getLeadMemory, addUserTurn, addAssistantTurn } from "../lib/memory.js";
import { logInbound, logOutbound, logError, logInfo, logWarn } from "../lib/logger.js";
import { isFreteQuestion, buildFreteReply } from "../lib/frete.js";
import { matchFaq } from "../lib/faq.js";
import { findProduct, buildProductReply } from "../lib/catalog.js";
import { handleWithAI, buildFallbackReply } from "../lib/rules.js";
import { transcribeAudio, analyzeImage } from "../lib/media.js";
import { isOpenAIConfigured } from "../lib/openai-client.js";
import { detectIntent } from "../lib/intent.js";

export async function whatsappMetaRoutes(app: FastifyInstance) {
  // =========================================================================
  // GET /webhooks/whatsapp — Verificacao do webhook (Meta challenge)
  // =========================================================================
  app.get("/webhooks/whatsapp", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN;

    logInfo("whatsapp_meta_verify_attempt", {
      mode,
      has_token: !!token,
      has_challenge: !!challenge,
      has_expected_token: !!expectedToken,
    });

    if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
      logInfo("whatsapp_meta_verify_ok", { challenge: challenge?.slice(0, 20) });
      // Meta espera o challenge como texto plano, status 200
      return reply.status(200).send(challenge);
    }

    logWarn("whatsapp_meta_verify_failed", { mode, token_match: token === expectedToken });
    return reply.status(403).send({ error: "Verificacao falhou" });
  });

  // =========================================================================
  // POST /webhooks/whatsapp — Receber mensagens + processar + responder
  // =========================================================================
  app.post("/webhooks/whatsapp", async (req, reply) => {
    // Meta exige 200 rapidamente — processar em background
    // Mas como Fastify e async, vamos processar e retornar 200 no final

    const rawBody = req.body as Record<string, unknown>;

    logInfo("whatsapp_meta_webhook_raw", {
      object: rawBody.object,
      has_entry: !!rawBody.entry,
    });

    // Parse do payload Meta
    const results = parseMetaWebhook(rawBody);

    if (results.length === 0) {
      // Payload valido mas sem mensagens (pode ser status update vazio)
      return reply.status(200).send("OK");
    }

    // Processar cada resultado
    for (const result of results) {
      // Status updates (delivery receipts) — apenas logar
      if (result.isStatus) {
        logInfo("whatsapp_meta_status", {
          status: result.status,
          message_id: result.messageId,
          recipient: result.recipientId,
          has_errors: !!result.errors?.length,
        });
        continue;
      }

      // Mensagem inbound — processar no pipeline
      try {
        await processInboundMessage(result.payload, result.wamid, result.from, result.originalType, result.mediaId, result.mediaMimeType);
      } catch (err) {
        logError("whatsapp_meta_process_error", err, {
          wamid: result.wamid,
          from: result.from,
        });
        // Tentar enviar fallback
        try {
          await sendTextMessage(
            result.from,
            "Opa! Tive um probleminha por aqui. Pode tentar de novo em alguns segundos? 😊"
          );
        } catch {
          // Falha total — apenas logar
        }
      }
    }

    // Meta exige resposta 200 rapida
    return reply.status(200).send("OK");
  });
}

// ---------------------------------------------------------------------------
// Pipeline de processamento (reutiliza toda a logica existente)
// ---------------------------------------------------------------------------

async function processInboundMessage(
  payload: import("../types/index.js").ManyChatInboundPayload,
  wamid: string,
  from: string,
  originalType: string,
  mediaId?: string,
  mediaMimeType?: string,
): Promise<void> {
  const subId = payload.subscriber_id;
  const name = payload.name;
  const phone = payload.phone;

  // Inicializar/recuperar memoria do lead
  getLeadMemory(subId, name, phone);

  // Marcar como lida (blue ticks)
  markAsRead(wamid).catch(() => {}); // fire-and-forget

  // --- IMAGEM ---
  if (originalType === "image" && mediaId) {
    logInbound(subId, "image", payload.message);

    if (!isOpenAIConfigured()) {
      const resp = noOpenAIResponse("image");
      logOutbound(subId, resp._debug!.matched_intent, resp._debug!.source, resp.action);
      await sendTextMessage(from, resp.reply);
      return;
    }

    try {
      // Obter URL da midia para passar ao OpenAI Vision
      const imageUrl = await getMediaUrl(mediaId);
      if (!imageUrl) {
        await sendTextMessage(from, "Recebi a imagem mas nao consegui abrir. Pode tentar de novo? 😊");
        return;
      }

      addUserTurn(subId, payload.message ?? "[imagem]", "image");
      const response = await analyzeImage(imageUrl, payload.message);
      addAssistantTurn(subId, response.reply, "openai_vision");
      logOutbound(subId, response._debug!.matched_intent, response._debug!.source, response.action, response.reply);
      await sendTextMessage(from, response.reply);
    } catch (err) {
      logError("whatsapp_meta_image_error", err, { subscriber_id: subId });
      const fb = buildFallbackReply();
      await sendTextMessage(from, fb.reply);
    }
    return;
  }

  // --- AUDIO ---
  let message = payload.message?.trim() ?? "";

  if (originalType === "audio" && mediaId) {
    logInbound(subId, "audio");

    if (!isOpenAIConfigured()) {
      const resp = noOpenAIResponse("audio");
      logOutbound(subId, resp._debug!.matched_intent, resp._debug!.source, resp.action);
      await sendTextMessage(from, resp.reply);
      return;
    }

    try {
      // Obter URL da midia
      const audioUrl = await getMediaUrl(mediaId);
      if (!audioUrl) {
        await sendTextMessage(from, "Recebi o audio mas nao consegui abrir. Pode digitar pra mim? 😊");
        return;
      }

      const transcription = await transcribeAudio(audioUrl);
      if (!transcription) {
        await sendTextMessage(from, "Recebi seu audio mas nao consegui entender. Pode digitar pra mim? 😊");
        logOutbound(subId, "audio_empty", "media", "reply");
        return;
      }
      message = transcription;
      addUserTurn(subId, message, "audio");
    } catch (err) {
      logError("whatsapp_meta_audio_error", err, { subscriber_id: subId });
      const fb = buildFallbackReply();
      await sendTextMessage(from, fb.reply);
      return;
    }
  } else if (message) {
    addUserTurn(subId, message, "text");
  }

  // --- TEXTO: pipeline com classificacao de intencao ---
  if (!message) {
    logWarn("whatsapp_meta_no_content", { subscriber_id: subId, type: originalType });
    await sendTextMessage(from, "Nao recebi sua mensagem. Pode tentar de novo? 😊");
    return;
  }

  logInbound(subId, "text", message);

  // Classificar intencao
  const intent = detectIntent(message);
  logInfo("whatsapp_meta_intent", {
    subscriber_id: subId,
    primary: intent.primary,
    confidence: intent.confidence,
    useCase: intent.useCase,
    explicitSize: intent.explicitSize,
    explicitThicknessMm: intent.explicitThicknessMm,
  });

  let response: ManyChatResponse | null = null;

  // ---- Pipeline baseado em intencao (identico ao ManyChat) ----

  if (intent.primary === "frete") {
    if (isFreteQuestion(message)) {
      response = buildFreteReply(message);
    }
    if (!response) {
      response = matchFaq(message);
    }
  } else if (intent.primary === "produto") {
    const product = findProduct(message, intent);
    if (product) {
      response = buildProductReply(product, intent);
    }
    if (!response) {
      response = matchFaq(message);
    }
  } else if (intent.primary === "pagamento") {
    response = matchFaq(message);
  } else if (intent.primary === "saudacao") {
    response = {
      reply: "Opa! Tudo bem? 😊 Sou o assistente da EVA PLACE! Como posso te ajudar hoje?",
      action: "reply",
      _debug: { matched_intent: "saudacao", source: "rules", confidence: "high" },
    };
  } else {
    if (isFreteQuestion(message)) {
      response = buildFreteReply(message);
    }
    if (!response) {
      response = matchFaq(message);
    }
    if (!response) {
      const product = findProduct(message, intent);
      if (product) {
        response = buildProductReply(product, intent);
      }
    }
  }

  // OpenAI (com historico do lead)
  if (!response) {
    response = await handleWithAI(message, subId);
  }

  // Fallback
  if (!response) {
    response = buildFallbackReply();
  }

  // Registrar resposta na memoria
  addAssistantTurn(subId, response.reply, response._debug?.source);

  logOutbound(
    subId,
    response._debug?.matched_intent ?? "?",
    response._debug?.source ?? "?",
    response.action,
    response.reply
  );

  // Enviar resposta diretamente pela API do WhatsApp
  const sendResult = await sendTextMessage(from, response.reply);

  logInfo("whatsapp_meta_response_sent", {
    subscriber_id: subId,
    success: sendResult.success,
    message_id: sendResult.messageId,
    source: response._debug?.source,
    intent: response._debug?.matched_intent,
  });
}

function noOpenAIResponse(type: "audio" | "image"): ManyChatResponse {
  const msg = type === "audio"
    ? "Recebi seu audio! Mas no momento nao consigo transcrever. Vou chamar nosso atendente!"
    : "Recebi sua imagem! Mas no momento nao consigo analisar. Vou chamar nosso atendente!";
  return {
    reply: msg,
    action: "escalate",
    add_tags: ["escalar_humano"],
    _debug: { matched_intent: `${type}_no_openai`, source: "rules", confidence: "low" },
  };
}
