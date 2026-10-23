/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  INITIAL_BOT_CONFIG,
  INITIAL_LEADS,
  INITIAL_PRODUCTS,
} from './data/initialData';
import {
  BotConfig,
  ChatMessage,
  CustomerLead,
  LeadStage,
  LearnedFact,
  Product,
} from './types/sales';
import {
  addOrUpdateCartItem,
  calculateOrderSummary,
  extractLearnedFactFromOwnerReply,
  formatOrderReceiptForRealWhatsApp,
  formatPhoneDisplay,
  formatProductCardForRealWhatsApp,
  generateDeterministicSalesReply,
  mergeLearnedFact,
  sanitizePhoneDigits,
  summarizeConversationHeuristic,
} from './utils/salesEngine';
import { WhatsAppSimulator } from './components/WhatsAppSimulator';
import { SecretarySummaryView } from './components/SecretarySummaryView';
import { CatalogManager } from './components/CatalogManager';
import { BotConfigPanel } from './components/BotConfigPanel';
import {
  GatewaySafetyConfig,
  GatewayStatusState,
  IntegrationPanel,
} from './components/IntegrationPanel';

type ActiveSection =
  | 'simulador'
  | 'resumen'
  | 'cerebro'
  | 'catalogo'
  | 'integracion';

const STORAGE_KEYS = {
  PRODUCTS: 'whatsventas_products_v4',
  LEADS: 'whatsventas_leads_v4',
  CONFIG: 'whatsventas_config_v4',
  SAFETY: 'whatsventas_safety_v4',
};

function getNowTimestamp(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function App() {
  const [activeSection, setActiveSection] =
    useState<ActiveSection>('simulador');

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
    } catch {
      return INITIAL_PRODUCTS;
    }
  });

  const [botConfig, setBotConfig] = useState<BotConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
      return saved
        ? { ...INITIAL_BOT_CONFIG, ...JSON.parse(saved) }
        : INITIAL_BOT_CONFIG;
    } catch {
      return INITIAL_BOT_CONFIG;
    }
  });

  const [leads, setLeads] = useState<CustomerLead[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LEADS);
      return saved ? JSON.parse(saved) : INITIAL_LEADS;
    } catch {
      return INITIAL_LEADS;
    }
  });

  const [activeLeadId, setActiveLeadId] = useState<string>(
    INITIAL_LEADS[0].id
  );
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [executiveBriefing, setExecutiveBriefing] = useState<string>('');
  const [liveDispatchFeedback, setLiveDispatchFeedback] = useState<
    string | null
  >(null);

  const hasAutoSelectedRealLeadRef = useRef(false);

  const [safetyConfig, setSafetyConfig] = useState<GatewaySafetyConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SAFETY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      ignoreGroups: true,
      onlyWhitelist: false,
      whitelistPhones: ['+52 55 4829 1034'],
      allowSelfChat: false,
      globalBotAutoReply: true,
      metaVerifyToken: 'whatsventas_verify_2026',
      metaPhoneNumberId: '',
    };
  });

  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusState>({
    connectionState: 'disconnected',
    statusDetail: 'Conectando...',
    qrDataUrl: null,
    pairingCode: null,
    connectedPhone: null,
    connectedName: null,
    lastError: null,
    totalRealChatsCount: 0,
    totalBotRepliesSent: 0,
  });

  const showTemporaryFeedback = (msg: string) => {
    setLiveDispatchFeedback(msg);
    setTimeout(() => {
      setLiveDispatchFeedback((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore storage quota errors
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(botConfig));
    } catch {
      // ignore storage quota errors
    }
  }, [botConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(leads));
    } catch {
      // ignore storage quota errors
    }
  }, [leads]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAFETY, JSON.stringify(safetyConfig));
    } catch {
      // ignore
    }
  }, [safetyConfig]);

  const applyGatewayResponse = (data: any) => {
    if (!data) return;

    setGatewayStatus({
      connectionState: data.connectionState || 'disconnected',
      statusDetail: data.statusDetail || null,
      qrDataUrl: data.qrDataUrl || null,
      pairingCode: data.pairingCode || null,
      connectedPhone: data.connectedPhone || null,
      connectedName: data.connectedName || null,
      lastError: data.lastError || null,
      totalRealChatsCount: Array.isArray(data.realLeads)
        ? data.realLeads.length
        : 0,
      totalBotRepliesSent: data.totalBotRepliesSent || 0,
    });

    if (typeof data.executiveBriefing === 'string' && data.executiveBriefing) {
      setExecutiveBriefing(data.executiveBriefing);
    }

    if (Array.isArray(data.learnedKnowledge) && data.learnedKnowledge.length > 0) {
      setBotConfig((prev) => {
        const current = prev.learnedKnowledge || [];
        let merged = [...current];
        let changed = false;
        for (const fact of data.learnedKnowledge as LearnedFact[]) {
          const existsExact = merged.some(
            (m) => m.learnedFact === fact.learnedFact
          );
          if (!existsExact) {
            merged = mergeLearnedFact(merged, fact);
            changed = true;
          }
        }
        return changed ? { ...prev, learnedKnowledge: merged } : prev;
      });
    }

    if (Array.isArray(data.realLeads) && data.realLeads.length > 0) {
      setLeads((prevLeads) => {
        const demoLeads = prevLeads.filter((l) => !l.isRealWhatsApp);
        const existingRealMap = new Map<string, CustomerLead>();
        for (const l of prevLeads) {
          if (l.isRealWhatsApp) {
            existingRealMap.set(sanitizePhoneDigits(l.phone) || l.id, l);
          }
        }

        const mergedRealLeads: CustomerLead[] = data.realLeads.map(
          (serverLead: CustomerLead) => {
            const key =
              sanitizePhoneDigits(serverLead.phone) || serverLead.id;
            const localMatch = existingRealMap.get(key);
            if (!localMatch) {
              return { ...serverLead, isRealWhatsApp: true };
            }
            return {
              ...localMatch,
              ...serverLead,
              isRealWhatsApp: true,
              cart:
                serverLead.cart && serverLead.cart.length > 0
                  ? serverLead.cart
                  : localMatch.cart,
              messages:
                serverLead.messages &&
                serverLead.messages.length >= localMatch.messages.length
                  ? serverLead.messages
                  : localMatch.messages,
            };
          }
        );

        return [...mergedRealLeads, ...demoLeads];
      });

      if (!hasAutoSelectedRealLeadRef.current && data.realLeads[0]?.id) {
        hasAutoSelectedRealLeadRef.current = true;
        setActiveLeadId(data.realLeads[0].id);
      }
    }
  };

  // Sync catalog, botConfig & safetyConfig to server gateway
  useEffect(() => {
    fetch('/api/whatsapp/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products,
        botConfig,
        safetyConfig,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(applyGatewayResponse)
      .catch(() => {});
  }, [products, botConfig, safetyConfig]);

  // Continuously poll live WhatsApp status & real chats across the app
  useEffect(() => {
    const timer = setInterval(() => {
      fetch('/api/whatsapp/status')
        .then((r) => (r.ok ? r.json() : null))
        .then(applyGatewayResponse)
        .catch(() => {});
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const handleStartQrConnection = async (pairingPhone?: string) => {
    setGatewayStatus((prev) => ({
      ...prev,
      connectionState: 'connecting',
      statusDetail: 'Solicitando sesión de WhatsApp al servidor...',
      lastError: null,
    }));
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingPhone, forceFresh: false }),
      });
      if (res.ok) {
        const data = await res.json();
        applyGatewayResponse(data);
      }
    } catch {
      setGatewayStatus((prev) => ({
        ...prev,
        connectionState: 'error',
        lastError: 'Error de red al solicitar conexión con el servidor.',
      }));
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        applyGatewayResponse(data);
      }
    } catch {
      // ignore
    }
  };

  const handleSendRealWhatsAppMessage = async (
    phone: string,
    text: string,
    extra?: {
      jid?: string;
      senderRole?: 'agent' | 'bot';
      productCards?: Product[];
      orderSummary?: any;
      intentTag?: string;
    }
  ): Promise<{ sentViaSocket: boolean; waMeUrl: string }> => {
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          text,
          ...extra,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lead) {
          setLeads((prev) =>
            prev.map((l) => (l.id === data.lead.id ? data.lead : l))
          );
        }
        return data;
      }
    } catch {
      // ignore
    }
    return {
      sentViaSocket: false,
      waMeUrl: `https://api.whatsapp.com/send?phone=${phone.replace(
        /\D/g,
        ''
      )}&text=${encodeURIComponent(text)}`,
    };
  };

  const syncLeadSettingsToServer = (
    lead: CustomerLead,
    patch: Partial<CustomerLead>
  ) => {
    if (!lead.isRealWhatsApp) return;
    fetch('/api/whatsapp/lead-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: lead.id,
        phone: lead.phone,
        ...patch,
      }),
    }).catch(() => {});
  };

  const activeLead =
    leads.find((l) => l.id === activeLeadId) || leads[0];

  const handleSelectLead = (leadId: string) => {
    setActiveLeadId(leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, unreadCount: 0 } : l))
    );
  };

  const handleRenameLead = (leadId: string, newName: string) => {
    const target = leads.find((l) => l.id === leadId);
    const initials = newName
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              name: newName,
              avatarInitials: initials || l.avatarInitials,
            }
          : l
      )
    );
    if (target) {
      syncLeadSettingsToServer(target, { name: newName });
    }
    showTemporaryFeedback(`Nombre guardado como "${newName}"`);
  };

  const handleRefreshLeadSummary = async (targetLead: CustomerLead) => {
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/whatsapp/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: targetLead }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lead) {
          setLeads((prev) =>
            prev.map((l) =>
              l.id === targetLead.id ? { ...l, ...data.lead } : l
            )
          );
          showTemporaryFeedback(
            `Resumen ejecutivo actualizado para ${targetLead.name}`
          );
        }
      }
    } catch {
      const heur = summarizeConversationHeuristic(targetLead, botConfig);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === targetLead.id
            ? {
                ...l,
                aiSummary: heur.summary,
                aiActionItem: heur.actionItem,
                aiPriority: heur.priority,
                aiCategory: heur.category,
              }
            : l
        )
      );
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleRefreshGlobalBriefing = async () => {
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/whatsapp/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.briefing) {
          setExecutiveBriefing(data.briefing);
        }
        if (Array.isArray(data.leads)) {
          const mapById = new Map<string, CustomerLead>();
          for (const item of data.leads) {
            mapById.set(item.id, item);
          }
          setLeads((prev) =>
            prev.map((l) => (mapById.has(l.id) ? { ...l, ...mapById.get(l.id) } : l))
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleMarkTaskDone = (leadId: string) => {
    const target = leads.find((l) => l.id === leadId);
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              aiPriority: 'baja',
              aiActionItem: 'Resuelto por ' + (botConfig.ownerName || 'ti'),
              stage: 'pagado',
            }
          : l
      )
    );
    if (target) {
      syncLeadSettingsToServer(target, {
        aiPriority: 'baja',
        aiActionItem: 'Resuelto',
        stage: 'pagado',
      });
    }
  };

  const triggerBotReplyForLead = async (
    targetLead: CustomerLead,
    customerText: string
  ) => {
    setIsBotTyping(true);

    if (targetLead.isRealWhatsApp) {
      try {
        const res = await fetch('/api/whatsapp/bot-reply-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: targetLead.id,
            phone: targetLead.phone,
            jid: targetLead.jid,
            name: targetLead.name,
            customerText,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyGatewayResponse(data);
          showTemporaryFeedback(
            `Respuesta de ${botConfig.agentName} enviada al WhatsApp de ${targetLead.name}`
          );
          setIsBotTyping(false);
          return;
        }
      } catch {
        // Fallback to local calculation below if request fails
      }
    }

    const deterministic = generateDeterministicSalesReply(
      customerText,
      targetLead,
      products,
      botConfig
    );
    const heur = summarizeConversationHeuristic(targetLead, botConfig);

    let finalReplyText = deterministic.replyText;
    let finalQuickReplies = deterministic.quickReplies;
    let finalProductCards = deterministic.productCards;
    let finalStage = deterministic.updatedStage;
    let aiSummary = heur.summary;
    let aiActionItem = heur.actionItem;
    let aiPriority = heur.priority;
    let aiCategory = heur.category;

    try {
      const res = await fetch('/api/sales-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerMessage: customerText,
          lead: targetLead,
          products,
          config: botConfig,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.useLocalFallback && data.replyText) {
          finalReplyText = data.replyText;
          if (data.summary) aiSummary = data.summary;
          if (data.actionItem) aiActionItem = data.actionItem;
          if (['alta', 'media', 'baja'].includes(data.priority)) {
            aiPriority = data.priority;
          }
          if (data.category) aiCategory = data.category;
          if (Array.isArray(data.quickReplies) && data.quickReplies.length > 0) {
            finalQuickReplies = data.quickReplies.slice(0, 3);
          }
          if (
            botConfig.assistantRole === 'ventas' &&
            Array.isArray(data.recommendedProductIds) &&
            data.recommendedProductIds.length > 0
          ) {
            const matched = products.filter((p) =>
              data.recommendedProductIds.includes(p.id)
            );
            if (matched.length > 0) {
              finalProductCards = matched;
            }
          }
        }
      }
    } catch {
      // Use deterministic secretary engine seamlessly
    }

    const botMsg: ChatMessage = {
      id: `msg-${Date.now()}-bot`,
      sender: 'bot',
      text: finalReplyText,
      timestamp: getNowTimestamp(),
      status: 'read',
      intentTag: deterministic.intent,
      productCards: finalProductCards,
      orderSummary: deterministic.orderSummary,
      quickReplies: finalQuickReplies,
    };

    setLeads((prev) =>
      prev.map((l) =>
        l.id === targetLead.id
          ? {
              ...l,
              stage: finalStage,
              cart: deterministic.updatedCart,
              appliedCoupon: deterministic.appliedCoupon,
              aiSummary,
              aiActionItem,
              aiPriority,
              aiCategory,
              lastActivity: botMsg.timestamp,
              messages: [...l.messages, botMsg],
            }
          : l
      )
    );

    setIsBotTyping(false);
  };

  const handleTriggerBotReplyNow = async (targetLead: CustomerLead) => {
    const lastCustomerMsg = [...targetLead.messages]
      .reverse()
      .find((m) => m.sender === 'customer');
    const promptText =
      lastCustomerMsg?.text || 'Hola, ¿en qué podemos ayudarte?';
    await triggerBotReplyForLead(targetLead, promptText);
  };

  const handleSendMessage = async (
    text: string,
    senderRole: 'customer' | 'agent'
  ) => {
    if (!activeLead) return;
    const timestamp = getNowTimestamp();

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: senderRole,
      text,
      timestamp,
      status: 'read',
    };

    const nextMessages = [
      ...activeLead.messages.filter((m) => !m.id.startsWith('wa-init-')),
      newMsg,
    ];

    // CRITICAL: When user writes manually (`senderRole === 'agent'`), pause automatic bot replies on this chat
    // so the bot NEVER sends extra messages on top of what the user is writing!
    const nextBotActive =
      senderRole === 'agent' ? false : activeLead.botActive;

    const tempLeadForSummary: CustomerLead = {
      ...activeLead,
      botActive: nextBotActive,
      messages: nextMessages,
    };
    const heur = summarizeConversationHeuristic(tempLeadForSummary, botConfig);

    const updatedLead: CustomerLead = {
      ...activeLead,
      unreadCount: 0,
      botActive: nextBotActive,
      humanTakeoverAt:
        senderRole === 'agent' ? Date.now() : activeLead.humanTakeoverAt,
      aiSummary: heur.summary,
      aiActionItem: heur.actionItem,
      aiPriority: heur.priority,
      aiCategory: heur.category,
      lastActivity: timestamp,
      messages: nextMessages,
    };

    setLeads((prev) =>
      prev.map((l) => (l.id === activeLead.id ? updatedLead : l))
    );

    if (senderRole === 'agent') {
      // CONTINUOUS SELF-LEARNING: Check if Ezequiel's reply teaches a service, article, or RD$ price
      const customerMsgs = activeLead.messages
        .filter((m) => m.sender === 'customer' && !m.id.startsWith('wa-init-'))
        .slice(-4)
        .map((m) => m.text);
      const learned = extractLearnedFactFromOwnerReply(
        customerMsgs,
        text,
        activeLead.name,
        timestamp
      );

      if (learned) {
        setBotConfig((prev) => ({
          ...prev,
          learnedKnowledge: mergeLearnedFact(
            prev.learnedKnowledge || [],
            learned
          ),
        }));
      }

      if (activeLead.isRealWhatsApp) {
        const res = await handleSendRealWhatsAppMessage(
          activeLead.phone,
          text,
          {
            jid: activeLead.jid,
            senderRole: 'agent',
          }
        );
        if (res.sentViaSocket) {
          showTemporaryFeedback(
            learned
              ? `🧠 Secretaria aprendió de tu respuesta (${
                  learned.priceRd
                    ? `RD$ ${learned.priceRd.toLocaleString('en-US')}`
                    : learned.keywords.slice(0, 2).join(', ')
                }) y ya podrá responderlo sola en otros chats`
              : `✓ Mensaje enviado a ${activeLead.name} · Secretaria pausada en este chat para no interrumpirte`
          );
        }
      } else {
        showTemporaryFeedback(
          learned
            ? `🧠 ¡Memoria Aprendida! La secretaria aprendió "${learned.learnedFact}" y ahora lo responderá sola cuando pregunten en otro chat`
            : `✓ Mensaje enviado · Secretaria pausada en este chat mientras hablas tú`
        );
      }
      return;
    }

    // Incoming customer message (`senderRole === 'customer'`)
    if (botConfig.assistantRole === 'solo_resumen') {
      handleRefreshLeadSummary(updatedLead);
      showTemporaryFeedback(
        `Modo Solo Resumen: Mensaje resumido sin enviar respuesta automática`
      );
      return;
    }

    if (
      updatedLead.botActive &&
      safetyConfig.globalBotAutoReply !== false
    ) {
      triggerBotReplyForLead(updatedLead, text);
    } else {
      handleRefreshLeadSummary(updatedLead);
    }
  };

  const handleSendProductCardToChat = async (product: Product) => {
    if (!activeLead) return;
    const timestamp = getNowTimestamp();
    const introText = `Te comparto la información de *${product.name}* (${botConfig.currencySymbol}${product.price}):`;
    const botMsg: ChatMessage = {
      id: `msg-${Date.now()}-card`,
      sender: 'bot',
      text: introText,
      timestamp,
      status: 'read',
      intentTag: 'ficha_enviada',
      productCards: [product],
    };

    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id
          ? {
              ...l,
              stage: l.stage === 'nuevo' ? 'interesado' : l.stage,
              lastActivity: timestamp,
              messages: [
                ...l.messages.filter((m) => !m.id.startsWith('wa-init-')),
                botMsg,
              ],
            }
          : l
      )
    );
    setActiveSection('simulador');

    if (activeLead.isRealWhatsApp) {
      const formattedCard = formatProductCardForRealWhatsApp(product, botConfig);
      const res = await handleSendRealWhatsAppMessage(
        activeLead.phone,
        `${introText}\n\n${formattedCard}`,
        {
          jid: activeLead.jid,
          senderRole: 'bot',
          productCards: [product],
          intentTag: 'ficha_enviada',
        }
      );
      if (res.sentViaSocket) {
        showTemporaryFeedback(
          `✓ Ficha de ${product.name} enviada al WhatsApp de ${activeLead.name}`
        );
      }
    }
  };

  const handleAddProductToLeadCart = (
    product: Product,
    triggerChatConfirm = false
  ) => {
    if (!activeLead) return;
    const timestamp = getNowTimestamp();
    const nextCart = addOrUpdateCartItem(activeLead.cart, product, 1);
    const nextStage: LeadStage =
      activeLead.stage === 'pagado' ? 'pagado' : 'cotizado';

    const extraMessages: ChatMessage[] = [];
    if (triggerChatConfirm) {
      const summary = calculateOrderSummary(
        nextCart,
        botConfig,
        activeLead.appliedCoupon,
        `WV-${Math.floor(1000 + (activeLead.name.length * 419) % 8900)}`
      );
      const orderText = `Aquí tienes la cotización actualizada con *${product.name}*:`;

      extraMessages.push({
        id: `msg-${Date.now()}-order`,
        sender: 'bot',
        text: orderText,
        timestamp,
        status: 'read',
        intentTag: 'confirmar_pedido',
        orderSummary: summary,
      });

      if (activeLead.isRealWhatsApp) {
        const receiptFormatted = formatOrderReceiptForRealWhatsApp(
          summary,
          botConfig
        );
        handleSendRealWhatsAppMessage(
          activeLead.phone,
          `${orderText}\n\n${receiptFormatted}`,
          {
            jid: activeLead.jid,
            senderRole: 'bot',
            orderSummary: summary,
            intentTag: 'confirmar_pedido',
          }
        );
      }
    }

    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id
          ? {
              ...l,
              cart: nextCart,
              stage: nextStage,
              lastActivity: timestamp,
              messages: [...l.messages, ...extraMessages],
            }
          : l
      )
    );
    syncLeadSettingsToServer(activeLead, { cart: nextCart, stage: nextStage });
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    if (!activeLead) return;
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const nextCart = addOrUpdateCartItem(activeLead.cart, prod, delta);
    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id ? { ...l, cart: nextCart } : l
      )
    );
    syncLeadSettingsToServer(activeLead, { cart: nextCart });
  };

  const handleSendOrderSummaryToChat = async () => {
    if (!activeLead) return;
    const timestamp = getNowTimestamp();
    const cartToUse =
      activeLead.cart.length > 0
        ? activeLead.cart
        : products[0]
        ? addOrUpdateCartItem([], products[0], 1)
        : [];

    const summary = calculateOrderSummary(
      cartToUse,
      botConfig,
      activeLead.appliedCoupon,
      `WV-${Math.floor(1000 + (activeLead.name.length * 523) % 8900)}`
    );

    const introText = `Hola ${
      activeLead.name.split(' ')[0]
    }, te comparto el resumen de cotización de *${botConfig.businessName}*:`;

    const orderMsg: ChatMessage = {
      id: `msg-${Date.now()}-summary`,
      sender: 'bot',
      text: introText,
      timestamp,
      status: 'read',
      intentTag: 'orden_generada',
      orderSummary: summary,
    };

    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id
          ? {
              ...l,
              cart: cartToUse,
              stage: l.stage === 'pagado' ? 'pagado' : 'cotizado',
              lastActivity: timestamp,
              messages: [
                ...l.messages.filter((m) => !m.id.startsWith('wa-init-')),
                orderMsg,
              ],
            }
          : l
      )
    );

    if (activeLead.isRealWhatsApp) {
      const receiptFormatted = formatOrderReceiptForRealWhatsApp(
        summary,
        botConfig
      );
      const res = await handleSendRealWhatsAppMessage(
        activeLead.phone,
        `${introText}\n\n${receiptFormatted}`,
        {
          jid: activeLead.jid,
          senderRole: 'bot',
          orderSummary: summary,
          intentTag: 'orden_generada',
        }
      );
      if (res.sentViaSocket) {
        showTemporaryFeedback(
          `✓ Cotización #${summary.orderNumber} enviada al WhatsApp de ${activeLead.name}`
        );
      }
    }
  };

  const handleMarkOrderPaid = async () => {
    if (!activeLead) return;
    const timestamp = getNowTimestamp();
    const paidText = `¡Muchas gracias ${
      activeLead.name.split(' ')[0]
    }! Confirmamos la recepción de tu pago en *${botConfig.businessName}*.`;

    const confirmMsg: ChatMessage = {
      id: `msg-${Date.now()}-paid`,
      sender: 'bot',
      text: paidText,
      timestamp,
      status: 'read',
      intentTag: 'pago_confirmado',
    };

    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id
          ? {
              ...l,
              stage: 'pagado',
              lastActivity: timestamp,
              messages: [...l.messages, confirmMsg],
            }
          : l
      )
    );
    syncLeadSettingsToServer(activeLead, { stage: 'pagado' });

    if (activeLead.isRealWhatsApp) {
      const res = await handleSendRealWhatsAppMessage(
        activeLead.phone,
        paidText,
        {
          jid: activeLead.jid,
          senderRole: 'bot',
          intentTag: 'pago_confirmado',
        }
      );
      if (res.sentViaSocket) {
        showTemporaryFeedback(
          `✓ Confirmación enviada al WhatsApp de ${activeLead.name}`
        );
      }
    }
  };

  const handleToggleLeadBot = (leadId: string) => {
    const target = leads.find((l) => l.id === leadId);
    if (!target) return;
    const nextBotActive = !target.botActive;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, botActive: nextBotActive } : l
      )
    );
    syncLeadSettingsToServer(target, { botActive: nextBotActive });
    showTemporaryFeedback(
      nextBotActive
        ? `Secretaria IA activada para ${target.name}`
        : `Modo Manual activado para ${target.name} (El bot no enviará mensajes aquí)`
    );
  };

  const handleChangeLeadStage = (leadId: string, stage: LeadStage) => {
    const target = leads.find((l) => l.id === leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage } : l))
    );
    if (target) {
      syncLeadSettingsToServer(target, { stage });
    }
  };

  const handleToggleLeadCoupon = (leadId: string) => {
    const target = leads.find((l) => l.id === leadId);
    const nextCoupon = target?.appliedCoupon
      ? undefined
      : botConfig.activeCouponCode;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              appliedCoupon: nextCoupon,
            }
          : l
      )
    );
    if (target) {
      syncLeadSettingsToServer(target, { appliedCoupon: nextCoupon });
    }
  };

  const handleCreateLead = async (name: string, phone: string, city: string) => {
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    const timestamp = getNowTimestamp();
    const cleanDigits = sanitizePhoneDigits(phone);
    const isReal =
      gatewayStatus.connectionState === 'connected' && cleanDigits.length >= 8;

    const newLead: CustomerLead = {
      id: isReal ? `wa-real-${cleanDigits}` : `lead-${Date.now()}`,
      jid: isReal ? `${cleanDigits}@s.whatsapp.net` : undefined,
      isRealWhatsApp: isReal,
      lastTimestampMs: Date.now(),
      name,
      phone: isReal ? formatPhoneDisplay(cleanDigits) : phone,
      city,
      avatarInitials: initials || 'CL',
      avatarColor: '#008069',
      stage: 'nuevo',
      unreadCount: 0,
      lastActivity: timestamp,
      botActive: true,
      tags: isReal ? ['WhatsApp Real'] : ['Nuevo Contacto'],
      notes: '',
      aiSummary: `Chat creado con ${name}. Listo para conversar o dejar a cargo de tu secretaria.`,
      aiActionItem: 'Escribir mensaje o esperar respuesta.',
      aiPriority: 'baja',
      aiCategory: 'cliente',
      cart: [],
      messages: [],
    };

    setLeads((prev) => [
      newLead,
      ...prev.filter((l) => l.id !== newLead.id),
    ]);
    setActiveLeadId(newLead.id);
    if (isReal) {
      syncLeadSettingsToServer(newLead, { name });
    }
  };

  const handleAddProduct = (newProd: Omit<Product, 'id'>) => {
    const created: Product = {
      ...newProd,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => [created, ...prev]);
  };

  const handleUpdateProductPriceStock = (
    productId: string,
    price: number,
    stock: number
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, price, stock } : p))
    );
  };

  const handleDeleteProduct = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleToggleGlobalBotAutoReply = () => {
    setSafetyConfig((prev) => ({
      ...prev,
      globalBotAutoReply: prev.globalBotAutoReply === false ? true : false,
    }));
  };

  const urgentLeadsCount = leads.filter((l) => l.aiPriority === 'alta').length;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      {/* TOP BAR CONTRACT: 1-row, 3-zone header */}
      <header className="flex items-center justify-between gap-3 sm:gap-8 px-4 sm:px-6 py-3 bg-white border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#simulador"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('simulador');
          }}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          WhatsVentas Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          {(
            [
              { id: 'simulador', label: 'WhatsApp Web en Vivo' },
              {
                id: 'resumen',
                label:
                  urgentLeadsCount > 0
                    ? `Resumen Secretaria (${urgentLeadsCount})`
                    : 'Resumen Secretaria',
              },
              { id: 'cerebro', label: 'Configurar Secretaria' },
              { id: 'catalogo', label: 'Catálogo' },
              { id: 'integracion', label: 'Vincular QR' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === item.id
                  ? 'text-[#008069] border-[#00a884] font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveSection('integracion');
              if (gatewayStatus.connectionState === 'disconnected') {
                handleStartQrConnection();
              }
            }}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {gatewayStatus.connectionState === 'connected' ? (
              <>
                <span>WhatsApp Activo</span>
                <span className="hidden sm:inline">
                  {' '}
                  ({formatPhoneDisplay(gatewayStatus.connectedPhone || '')})
                </span>
              </>
            ) : (
              'Conectar WhatsApp Real'
            )}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (< md) */}
      <nav
        aria-label="Navegación móvil"
        className="flex md:hidden items-center justify-between gap-1 px-3 py-2 bg-white border-b border-slate-200 overflow-x-auto"
      >
        {(
          [
            { id: 'simulador', label: 'Chats' },
            { id: 'resumen', label: `Resumen (${urgentLeadsCount})` },
            { id: 'cerebro', label: 'Secretaria' },
            { id: 'catalogo', label: 'Catálogo' },
            { id: 'integracion', label: 'Vincular QR' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(item.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSection === item.id
                ? 'bg-[#e7fce3] text-[#008069] font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* MAIN WORKSPACE CONTAINER */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4">
        {activeSection === 'simulador' && (
          <WhatsAppSimulator
            leads={leads}
            activeLeadId={activeLead?.id || ''}
            products={products}
            botConfig={botConfig}
            isBotTyping={isBotTyping}
            gatewayStatus={gatewayStatus}
            globalBotAutoReply={safetyConfig.globalBotAutoReply !== false}
            liveDispatchFeedback={liveDispatchFeedback}
            onToggleGlobalBotAutoReply={handleToggleGlobalBotAutoReply}
            onUpdateBotConfig={setBotConfig}
            onOpenSummaryTab={() => setActiveSection('resumen')}
            onOpenIntegrationTab={() => setActiveSection('integracion')}
            onSelectLead={handleSelectLead}
            onSendMessage={handleSendMessage}
            onTriggerBotReplyNow={handleTriggerBotReplyNow}
            onRefreshLeadSummary={handleRefreshLeadSummary}
            onRenameLead={handleRenameLead}
            onSendProductCardToChat={handleSendProductCardToChat}
            onAddProductToLeadCart={handleAddProductToLeadCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onSendOrderSummaryToChat={handleSendOrderSummaryToChat}
            onMarkOrderPaid={handleMarkOrderPaid}
            onToggleLeadBot={handleToggleLeadBot}
            onChangeLeadStage={handleChangeLeadStage}
            onToggleLeadCoupon={handleToggleLeadCoupon}
            onCreateLead={handleCreateLead}
          />
        )}

        {activeSection === 'resumen' && (
          <SecretarySummaryView
            leads={leads}
            botConfig={botConfig}
            executiveBriefing={executiveBriefing}
            isSummarizing={isSummarizing}
            onUpdateBotConfig={setBotConfig}
            onRefreshBriefing={handleRefreshGlobalBriefing}
            onOpenLeadChat={(leadId) => {
              handleSelectLead(leadId);
              setActiveSection('simulador');
            }}
            onTriggerBotReplyNow={handleTriggerBotReplyNow}
            onToggleLeadBot={handleToggleLeadBot}
            onMarkTaskDone={handleMarkTaskDone}
          />
        )}

        {activeSection === 'catalogo' && (
          <CatalogManager
            products={products}
            currencySymbol={botConfig.currencySymbol}
            onAddProduct={handleAddProduct}
            onUpdateProductPriceStock={handleUpdateProductPriceStock}
            onDeleteProduct={handleDeleteProduct}
            onSendProductToActiveChat={handleSendProductCardToChat}
          />
        )}

        {activeSection === 'cerebro' && (
          <BotConfigPanel
            botConfig={botConfig}
            onUpdateBotConfig={setBotConfig}
          />
        )}

        {activeSection === 'integracion' && (
          <IntegrationPanel
            products={products}
            botConfig={botConfig}
            gatewayStatus={gatewayStatus}
            safetyConfig={safetyConfig}
            onUpdateSafetyConfig={setSafetyConfig}
            onStartQrConnection={handleStartQrConnection}
            onDisconnectWhatsApp={handleDisconnectWhatsApp}
            onSendRealWhatsAppMessage={handleSendRealWhatsAppMessage}
          />
        )}
      </main>
    </div>
  );
}
