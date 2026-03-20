import type { FastifyInstance } from "fastify";
import type { ManyChatResponse } from "../types/index.js";
import { verifyWebhook } from "../lib/auth.js";
import { parseManyChatPayload } from "../lib/manychat-parser.js";
import { getLeadMemory, addUserTurn, addAssistantTurn } from "../lib/memory.js";
import { logInbound, logOutbound, logError, logInfo } from "../lib/logger.js";
import { isFreteQuestion, buildFreteReply } from "../lib/frete.js";
import { matchFaq } from "../lib/faq.js";
import { findProduct, buildProductReply } from "../lib/catalog.js";
import { handleWithAI, buildFallbackReply } from "../lib/rules.js";
import { transcribeAudio, analyzeImage } from "../lib/media.js";
import { isOpenAIConfigured } from "../lib/openai-client.js";
import { detectIntent } from "../lib/intent.js";

export async function manychatRoutes(app: FastifyInstance) {
  // Hook de autenticacao para todos os webhooks
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/webhooks/")) {
      await verifyWebhook(req, reply);
    }
  });

  app.post("/webhooks/manychat/inbound", async (req, reply) => {
    // Log do payload bruto para inspecao
    const rawBody = req.body as Record<string, unknown>;
    logInfo("webhook_raw_payload", {
      has_subscriber: !!rawBody.subscriber,
      top_keys: Object.keys(rawBody).slice(0, 15),
      content_type: req.headers["content-type"],
    });

    // Normalizar payload (aceita formato nativo "Add Full Contact Data" e flat/manual)
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
        return reply.send({ ...resp, backend_reply: resp.reply });
      }

      try {
        addUserTurn(subId, payload.message ?? "[imagem]", "image");
        const response = await analyzeImage(payload.image_url, payload.message);
        addAssistantTurn(subId, response.reply, "openai_vision");
        logOutbound(subId, response._debug!.matched_intent, response._debug!.source, response.action, response.reply);
        return reply.send({ ...response, backend_reply: response.reply });
      } catch (err) {
        logError("image_analysis_error", err, { subscriber_id: subId });
        const fb = buildFallbackReply();
        return reply.send({ ...fb, backend_reply: fb.reply });
      }
    }

    // --- AUDIO ---
    let message = payload.message?.trim() ?? "";

    if (payload.audio_url) {
      logInbound(subId, "audio");

      if (!isOpenAIConfigured()) {
        const resp = noOpenAIResponse("audio");
        logOutbound(subId, resp._debug!.matched_intent, resp._debug!.source, resp.action);
        return reply.send({ ...resp, backend_reply: resp.reply });
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
          return reply.send({ ...resp, backend_reply: resp.reply });
        }
        message = transcription;
        addUserTurn(subId, message, "audio");
      } catch (err) {
        logError("audio_transcribe_error", err, { subscriber_id: subId });
        const fb = buildFallbackReply();
        return reply.send({ ...fb, backend_reply: fb.reply });
      }
    } else if (message) {
      addUserTurn(subId, message, "text");
    }

    // --- TEXTO: pipeline com classificacao de intencao ---
    if (!message) {
      return reply.status(400).send({ error: "Payload sem message, audio_url ou image_url" });
    }

    logInbound(subId, "text", message);

    // Classificar intencao ANTES de rodar matchers
    const intent = detectIntent(message);
    logInfo("intent_detected", {
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

    // ---- Pipeline baseado em intencao ----

    if (intent.primary === "frete") {
      // Intencao clara de frete: roda SÓ frete, sem catálogo (evita contaminacao)
      if (isFreteQuestion(message)) {
        response = buildFreteReply(message);
      }
      // Se frete nao resolveu, FAQ pode ter algo relevante
      if (!response) {
        response = matchFaq(message);
      }
    } else if (intent.primary === "produto") {
      // Intencao de produto: catalogo primeiro, com contexto de intencao
      const product = findProduct(message, intent);
      if (product) {
        response = buildProductReply(product, intent);
      }
      // FAQ pode ter info complementar (durabilidade, limpeza, etc)
      if (!response) {
        response = matchFaq(message);
      }
    } else if (intent.primary === "pagamento") {
      // Pagamento: FAQ primeiro (desconto pix, parcelas, etc)
      response = matchFaq(message);
    } else if (intent.primary === "saudacao") {
      // Saudacao simples: resposta curta sem acionar matchers
      response = {
        reply: "Opa! Tudo bem? 😊 Sou o assistente da EVA PLACE! Como posso te ajudar hoje?",
        action: "reply",
        _debug: { matched_intent: "saudacao", source: "rules", confidence: "high" },
      };
    } else {
      // Geral: pipeline completo na ordem padrao
      // 1. Frete
      if (isFreteQuestion(message)) {
        response = buildFreteReply(message);
      }
      // 2. FAQ
      if (!response) {
        response = matchFaq(message);
      }
      // 3. Catalogo
      if (!response) {
        const product = findProduct(message, intent);
        if (product) {
          response = buildProductReply(product, intent);
        }
      }
    }

    // 4. OpenAI (com historico do lead) — para TODAS as intencoes nao resolvidas
    if (!response) {
      response = await handleWithAI(message, subId);
    }

    // 5. Fallback
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

    // Enviar resposta com alias backend_reply para facilitar mapeamento no ManyChat
    const responseWithAlias = {
      ...response,
      backend_reply: response.reply,
    };
    return reply.send(responseWithAlias);
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
