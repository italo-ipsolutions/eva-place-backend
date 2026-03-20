import type { FastifyInstance } from "fastify";
import type { ManyChatResponse } from "../types/index.js";
import { verifyWebhook } from "../lib/auth.js";
import { parseManyChatPayload } from "../lib/manychat-parser.js";
import { getLeadMemory, addUserTurn, addAssistantTurn } from "../lib/memory.js";
import { logInbound, logOutbound, logError, logInfo, logWarn } from "../lib/logger.js";
import { isFreteQuestion, buildFreteReply } from "../lib/frete.js";
import { matchFaq } from "../lib/faq.js";
import { findProduct, buildProductReply } from "../lib/catalog.js";
import { handleWithAI, buildFallbackReply } from "../lib/rules.js";
import { transcribeAudio, analyzeImage } from "../lib/media.js";
import { isOpenAIConfigured } from "../lib/openai-client.js";
import { detectIntent } from "../lib/intent.js";

// ---------------------------------------------------------------------------
// Tipos do Dynamic Block v2 do ManyChat (canal WhatsApp)
// Ref: https://manychat.com/docs/dynamic-block
// ---------------------------------------------------------------------------

interface DynamicBlockMessage {
  type: "text";
  text: string;
}

interface DynamicBlockAction {
  action: "set_field_value" | "add_tag" | "remove_tag";
  field_name?: string;
  value?: string | number;
  tag_name?: string;
}

interface DynamicBlockResponse {
  version: "v2";
  content: {
    type: "whatsapp";
    messages: DynamicBlockMessage[];
    actions?: DynamicBlockAction[];
    quick_replies?: Array<{
      type: "node";
      caption: string;
      target: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Helpers para montar a resposta Dynamic Block
// ---------------------------------------------------------------------------

/**
 * Converte a ManyChatResponse interna para o formato Dynamic Block v2.
 *
 * Dynamic Block = o servidor retorna a mensagem pronta e o ManyChat envia
 * diretamente ao contato. Nao precisa de custom field intermediario
 * (elimina o atraso de 1 turno do External Request + backend_reply).
 */
function toDynamicBlock(internal: ManyChatResponse): DynamicBlockResponse {
  const messages: DynamicBlockMessage[] = [
    { type: "text", text: internal.reply },
  ];

  const actions: DynamicBlockAction[] = [];

  // Mapear tags de saida
  if (internal.add_tags?.length) {
    for (const tag of internal.add_tags) {
      actions.push({ action: "add_tag", tag_name: tag });
    }
  }

  // Mapear set_fields de saida (ex: ultima_categoria, etc)
  if (internal.set_fields) {
    for (const [field, value] of Object.entries(internal.set_fields)) {
      actions.push({ action: "set_field_value", field_name: field, value });
    }
  }

  // Gravar debug info como campo (opcional, util para troubleshooting)
  if (internal._debug) {
    actions.push({
      action: "set_field_value",
      field_name: "eva_debug_source",
      value: `${internal._debug.source}|${internal._debug.matched_intent}|${internal._debug.confidence}`,
    });
  }

  const block: DynamicBlockResponse = {
    version: "v2",
    content: {
      type: "whatsapp",
      messages,
    },
  };

  if (actions.length > 0) {
    block.content.actions = actions;
  }

  return block;
}

// ---------------------------------------------------------------------------
// Rota Dynamic Block
// ---------------------------------------------------------------------------

export async function manychatDynamicRoutes(app: FastifyInstance) {
  // Auth hook — mesmo hook dos demais webhooks
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/webhooks/")) {
      await verifyWebhook(req, reply);
    }
  });

  /**
   * POST /webhooks/manychat/dynamic
   *
   * Endpoint para uso com **Dynamic Block** do ManyChat (WhatsApp).
   *
   * Diferenca em relacao ao /webhooks/manychat/inbound (External Request):
   * - External Request: retorna JSON livre, ManyChat mapeia campos -> custom fields
   *   e exige um passo extra "Send Message {{backend_reply}}". Causa 1-turno de atraso.
   * - Dynamic Block: retorna o conteudo da mensagem no formato v2 do ManyChat.
   *   ManyChat envia a mensagem diretamente ao contato. Sem atraso.
   *
   * Payload de entrada: identico (aceita "Add Full Contact Data" ou flat).
   * Payload de saida: formato Dynamic Block v2 (version, content.type, content.messages).
   */
  app.post("/webhooks/manychat/dynamic", async (req, reply) => {
    const rawBody = req.body as Record<string, unknown>;
    logInfo("dynamic_block_raw_payload", {
      has_subscriber: !!rawBody.subscriber,
      top_keys: Object.keys(rawBody).slice(0, 15),
      content_type: req.headers["content-type"],
    });

    // Normalizar payload (reutiliza parser que ja sanitiza custom_fields)
    const payload = parseManyChatPayload(rawBody);
    const { subscriber_id: subId, name, phone } = payload;

    // Inicializar/recuperar memoria do lead
    getLeadMemory(subId, name, phone);

    // --- IMAGEM ---
    if (payload.image_url) {
      logInbound(subId, "image", payload.message);

      if (!isOpenAIConfigured()) {
        const resp = noOpenAIResponse("image");
        logOutbound(subId, resp._debug!.matched_intent, resp._debug!.source, resp.action);
        return reply.send(toDynamicBlock(resp));
      }

      try {
        addUserTurn(subId, payload.message ?? "[imagem]", "image");
        const response = await analyzeImage(payload.image_url, payload.message);
        addAssistantTurn(subId, response.reply, "openai_vision");
        logOutbound(subId, response._debug!.matched_intent, response._debug!.source, response.action, response.reply);
        return reply.send(toDynamicBlock(response));
      } catch (err) {
        logError("dynamic_image_error", err, { subscriber_id: subId });
        return reply.send(toDynamicBlock(buildFallbackReply()));
      }
    }

    // --- AUDIO ---
    let message = payload.message?.trim() ?? "";

    if (payload.audio_url) {
      logInbound(subId, "audio");

      if (!isOpenAIConfigured()) {
        const resp = noOpenAIResponse("audio");
        logOutbound(subId, resp._debug!.matched_intent, resp._debug!.source, resp.action);
        return reply.send(toDynamicBlock(resp));
      }

      try {
        const transcription = await transcribeAudio(payload.audio_url);
        if (!transcription) {
          const resp: ManyChatResponse = {
            reply: "Recebi seu audio mas nao consegui entender. Pode digitar pra mim? 😊",
            action: "reply",
            _debug: { matched_intent: "audio_empty", source: "media", confidence: "low" },
          };
          logOutbound(subId, "audio_empty", "media", "reply");
          return reply.send(toDynamicBlock(resp));
        }
        message = transcription;
        addUserTurn(subId, message, "audio");
      } catch (err) {
        logError("dynamic_audio_error", err, { subscriber_id: subId });
        return reply.send(toDynamicBlock(buildFallbackReply()));
      }
    } else if (message) {
      addUserTurn(subId, message, "text");
    }

    // --- TEXTO: pipeline com classificacao de intencao ---
    if (!message) {
      // Dynamic Block exige resposta valida mesmo em erro — nao pode retornar 400 simples
      logWarn("dynamic_block_no_content", { subscriber_id: subId });
      const errorResp: ManyChatResponse = {
        reply: "Nao recebi sua mensagem. Pode tentar de novo? 😊",
        action: "reply",
        _debug: { matched_intent: "empty_input", source: "rules", confidence: "low" },
      };
      return reply.send(toDynamicBlock(errorResp));
    }

    logInbound(subId, "text", message);

    // Classificar intencao
    const intent = detectIntent(message);
    logInfo("dynamic_intent_detected", {
      subscriber_id: subId,
      primary: intent.primary,
      confidence: intent.confidence,
      useCase: intent.useCase,
      hasDimensions: !!intent.dimensions,
      quantity: intent.quantity,
      suggestedThicknessMm: intent.suggestedThicknessMm,
      explicitSize: intent.explicitSize,
      explicitThicknessMm: intent.explicitThicknessMm,
      isAvailabilityQuestion: intent.isAvailabilityQuestion,
    });

    let response: ManyChatResponse | null = null;

    // ---- Pipeline baseado em intencao (identico ao /inbound) ----

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

    // Retornar no formato Dynamic Block v2 — mensagem vai direto pro contato
    const dynamicResponse = toDynamicBlock(response);

    logInfo("dynamic_block_response", {
      subscriber_id: subId,
      messages_count: dynamicResponse.content.messages.length,
      actions_count: dynamicResponse.content.actions?.length ?? 0,
      source: response._debug?.source,
    });

    return reply.send(dynamicResponse);
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
