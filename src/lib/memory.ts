/**
 * Memoria curta in-memory por lead/subscriber.
 * Mantém os ultimos N turnos de conversa.
 * Provisório — será substituido por Redis ou banco depois.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  source?: string; // "local" | "openai" | "audio" | "image"
}

interface LeadMemory {
  subscriberId: string;
  name: string;
  phone?: string;
  turns: ConversationTurn[];
  createdAt: number;
  lastActivityAt: number;
}

const MAX_TURNS = 10;
const TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

const store = new Map<string, LeadMemory>();

/** Obtem ou cria memoria de um lead */
export function getLeadMemory(subscriberId: string, name?: string, phone?: string): LeadMemory {
  const existing = store.get(subscriberId);
  const now = Date.now();

  // Se existe e nao expirou, retorna
  if (existing && now - existing.lastActivityAt < TTL_MS) {
    existing.lastActivityAt = now;
    if (name) existing.name = name;
    if (phone) existing.phone = phone;
    return existing;
  }

  // Cria novo
  const memory: LeadMemory = {
    subscriberId,
    name: name ?? "?",
    phone,
    turns: [],
    createdAt: now,
    lastActivityAt: now,
  };
  store.set(subscriberId, memory);
  return memory;
}

/** Adiciona turno do usuario */
export function addUserTurn(subscriberId: string, content: string, source?: string): void {
  const memory = store.get(subscriberId);
  if (!memory) return;
  memory.turns.push({ role: "user", content, timestamp: Date.now(), source });
  if (memory.turns.length > MAX_TURNS * 2) {
    memory.turns = memory.turns.slice(-MAX_TURNS * 2);
  }
  memory.lastActivityAt = Date.now();
}

/** Adiciona turno do assistente */
export function addAssistantTurn(subscriberId: string, content: string, source?: string): void {
  const memory = store.get(subscriberId);
  if (!memory) return;
  memory.turns.push({ role: "assistant", content, timestamp: Date.now(), source });
  if (memory.turns.length > MAX_TURNS * 2) {
    memory.turns = memory.turns.slice(-MAX_TURNS * 2);
  }
  memory.lastActivityAt = Date.now();
}

/** Retorna os ultimos turnos para injetar no prompt da OpenAI */
export function getRecentTurns(subscriberId: string, maxTurns: number = MAX_TURNS): ConversationTurn[] {
  const memory = store.get(subscriberId);
  if (!memory) return [];
  return memory.turns.slice(-maxTurns);
}

/** Retorna resumo do estado da memoria (para /health) */
export function getMemoryStats(): { activeLeads: number; totalTurns: number } {
  const now = Date.now();
  let activeLeads = 0;
  let totalTurns = 0;

  for (const [key, mem] of store) {
    if (now - mem.lastActivityAt > TTL_MS) {
      store.delete(key); // Limpa expirados
    } else {
      activeLeads++;
      totalTurns += mem.turns.length;
    }
  }

  return { activeLeads, totalTurns };
}
