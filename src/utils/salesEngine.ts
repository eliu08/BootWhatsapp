import {
  BotConfig,
  CartItem,
  CustomerLead,
  LeadStage,
  LearnedFact,
  OrderSummaryData,
  Product,
} from '../types/sales';

export type SalesIntent =
  | 'saludo'
  | 'catalogo'
  | 'consulta_producto'
  | 'memoria_aprendida'
  | 'consulta_nueva'
  | 'objecion_precio'
  | 'envio'
  | 'pago'
  | 'confirmar_pedido'
  | 'asesor_humano'
  | 'general';

export interface BotReplyResult {
  replyText: string;
  intent: SalesIntent;
  productCards?: Product[];
  orderSummary?: OrderSummaryData;
  matchedLearnedFact?: LearnedFact;
  quickReplies: string[];
  updatedCart: CartItem[];
  updatedStage: LeadStage;
  appliedCoupon?: string;
}

export function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const STOP_WORDS = new Set([
  'hola',
  'buenos',
  'buenas',
  'dias',
  'tardes',
  'noches',
  'buen',
  'dia',
  'usted',
  'ustedes',
  'hacen',
  'hace',
  'hago',
  'tienen',
  'tiene',
  'venden',
  'vende',
  'vendo',
  'ofrecen',
  'ofrece',
  'como',
  'cuanto',
  'cuesta',
  'cuestan',
  'sale',
  'salen',
  'vale',
  'valen',
  'precio',
  'precios',
  'para',
  'por',
  'favor',
  'gracias',
  'claro',
  'si',
  'no',
  'en',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'que',
  'pregunta',
  'preguntar',
  'saber',
  'quisiera',
  'quiero',
  'necesito',
  'pesos',
  'peso',
  'dominicanos',
  'dominicano',
  'rd',
  'dop',
  'con',
  'sin',
  'mas',
  'muy',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'hay',
  'son',
  'es',
  'soy',
  'eres',
  'somos',
  'estan',
  'esta',
  'todo',
  'toda',
  'todos',
  'todas',
  'tambien',
  'pero',
  'porque',
  'cuando',
  'donde',
  'quien',
  'cual',
  'cuales',
  'mio',
  'mia',
  'suyo',
  'suya',
  'nuestro',
  'nuestra',
  'te',
  'me',
  'se',
  'le',
  'les',
  'lo',
  'nos',
  'mi',
  'tu',
  'su',
  'mis',
  'tus',
  'sus',
  'ya',
  'hoy',
  'ahora',
  'mismo',
  'saludos',
  'bendiciones',
  'hermano',
  'amigo',
  'amiga',
  'cliente',
  'ezequiel',
  'valeria',
]);

const TOPIC_SYNONYM_GROUPS: string[][] = [
  ['curriculo', 'curriculos', 'curriculum', 'curriculums', 'cv', 'hoja de vida', 'resumen curricular'],
  ['impresion', 'imprimir', 'impresiones', 'copia', 'copias', 'fotocopia'],
  ['digitacion', 'digitar', 'carta', 'documento', 'redactar'],
  ['formateo', 'formatear', 'windows', 'office', 'instalacion', 'instalar'],
  ['mantenimiento', 'limpieza', 'pasta termica', 'calienta'],
  ['camara', 'camaras', 'cctv', 'seguridad', 'dvr'],
  ['mouse', 'raton'],
  ['teclado', 'keyboard'],
  ['pantalla', 'monitor', 'display'],
  ['bateria', 'pila'],
  ['cargador', 'adaptador', 'fuente'],
  ['disco', 'ssd', 'nvme', 'almacenamiento'],
  ['memoria', 'ram'],
  ['envio', 'delivery', 'domicilio', 'mensajeria', 'caribe tours', 'metro pac'],
];

export function extractDominicanPrice(text: string): number | undefined {
  if (!text) return undefined;
  // Explicit RD$ or $ or pesos pattern first
  const explicitMatch =
    text.match(/(?:rd\$|dop|\$)\s*(\d{1,3}(?:[.,]\d{3})+|\d{2,6})/i) ||
    text.match(/(\d{1,3}(?:[.,]\d{3})+|\d{2,6})\s*(?:pesos|rd\$|dop|rd)/i) ||
    text.match(/\b(?:cuesta|sale en|vale|por|en|a)\s+(?:rd\$\s*|\$\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{2,6})\b/i);

  if (explicitMatch && explicitMatch[1]) {
    const cleaned = explicitMatch[1].replace(/[.,](?=\d{3}\b)/g, '');
    const value = Number(cleaned);
    if (Number.isFinite(value) && value >= 20 && value <= 950000) {
      return value;
    }
  }
  return undefined;
}

export function expandTopicKeywords(rawWords: string[]): string[] {
  const result = new Set<string>();
  for (const w of rawWords) {
    const norm = normalizeText(w).replace(/[^a-z0-9]/g, '');
    if (norm.length >= 3 && !STOP_WORDS.has(norm) && !/^\d+$/.test(norm)) {
      result.add(norm);
    }
    for (const group of TOPIC_SYNONYM_GROUPS) {
      if (group.some((syn) => normalizeText(syn) === norm || norm.includes(normalizeText(syn)))) {
        for (const syn of group) {
          result.add(normalizeText(syn));
        }
      }
    }
  }
  return Array.from(result);
}

export function findMatchingLearnedFact(
  customerMessage: string,
  learnedKnowledge: LearnedFact[] = []
): LearnedFact | null {
  if (!customerMessage || !learnedKnowledge || learnedKnowledge.length === 0) {
    return null;
  }
  const normMsg = normalizeText(customerMessage);
  if (!normMsg) return null;

  let bestMatch: LearnedFact | null = null;
  let bestScore = 0;

  for (const fact of learnedKnowledge) {
    let score = 0;
    for (const kw of fact.keywords) {
      const normKw = normalizeText(kw);
      if (!normKw || normKw.length < 2) continue;
      if (normKw.includes(' ')) {
        if (normMsg.includes(normKw)) score += 3;
      } else {
        const regex = new RegExp(`\\b${normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (regex.test(normMsg)) {
          score += 2;
        } else if (normKw.length >= 5 && normMsg.includes(normKw)) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = fact;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

export function isUnknownServiceOrProductQuestion(
  customerMessage: string,
  products: Product[],
  learnedKnowledge: LearnedFact[] = []
): boolean {
  const norm = normalizeText(customerMessage);
  if (!norm) return false;

  // If it already matches a known product or a learned fact, it's not unknown
  if (findMatchingProducts(customerMessage, products).length > 0) return false;
  if (findMatchingLearnedFact(customerMessage, learnedKnowledge)) return false;

  // Check if customer is asking whether we offer/make/sell something or how much a specific thing costs
  const asksAboutOffering =
    /\b(hacen|hace|trabajan|realizan|tienen|tiene|venden|vende|ofrecen|preparan|imprimen|formatean|reparan|instalan|cuanto cuesta|cuanto sale|en cuanto sale|en cuanto esta|que precio tiene|a como tienen|a como sale)\b/.test(
      norm
    );

  return asksAboutOffering;
}

export function extractLearnedFactFromOwnerReply(
  customerMessages: string[],
  ownerReply: string,
  contactName = 'Cliente',
  timestamp = 'Hoy'
): LearnedFact | null {
  const cleanReply = (ownerReply || '').trim();
  if (cleanReply.length < 4) return null;

  const normReply = normalizeText(cleanReply);
  const lastCustomerQuestion =
    [...customerMessages]
      .reverse()
      .find((m) => m && m.trim().length > 3) || '';
  const normQuestion = normalizeText(lastCustomerQuestion);

  const priceRd = extractDominicanPrice(cleanReply);

  const replyHasBusinessSignal =
    priceRd !== undefined ||
    /\b(hacemos|realizamos|tenemos|vendemos|ofrecemos|trabajamos|preparamos|instalamos|reparamos|imprimimos|cuesta|sale en|vale|disponible|incluye|no hacemos|no trabajamos|no vendemos|no tenemos|rd\$|pesos)\b/.test(
      normReply
    );

  const questionHasInquirySignal =
    /\b(hacen|hace|tienen|tiene|venden|vende|ofrecen|cuanto|precio|cuesta|sale|vale|curriculo|curriculum|cv|servicio|articulo|producto)\b/.test(
      normQuestion
    );

  // Avoid learning pure social greetings/acknowledgements unless answering a clear product/service question with substance
  if (!replyHasBusinessSignal && !questionHasInquirySignal) {
    return null;
  }
  if (
    !replyHasBusinessSignal &&
    /^(ok|dale|perfecto|gracias|buen dia|buenas tardes|hola|ya voy|en breve|un momento|claro)$/i.test(
      normReply
    )
  ) {
    return null;
  }

  const rawTokens = [
    ...normQuestion.split(/[^a-z0-9]+/),
    ...normReply.split(/[^a-z0-9]+/),
  ];
  const keywords = expandTopicKeywords(rawTokens);
  if (keywords.length === 0) return null;

  const isService =
    /\b(curriculo|curriculum|cv|formateo|formatear|instalacion|mantenimiento|reparacion|impresion|digitacion|servicio|configuracion|diseno|soporte|limpieza)\b/.test(
      `${normQuestion} ${normReply}`
    ) || /\b(hacemos|realizamos|preparamos|instalamos|reparamos)\b/.test(normReply);

  const isPolicy = /\b(envio|delivery|domicilio|horario|garantia|transferencia|banreservas|popular|bhd|santiago|interior)\b/.test(
    `${normQuestion} ${normReply}`
  );

  const category: LearnedFact['category'] = isPolicy
    ? 'politica'
    : isService
    ? 'servicio'
    : 'precio_articulo';

  // Ensure the learned fact mentions RD$ clearly if a price was detected without RD$
  let formattedFact = cleanReply;
  if (priceRd !== undefined && !/rd\$/i.test(formattedFact)) {
    formattedFact = `${cleanReply.replace(/\s*\.\s*$/, '')} (Precio: RD$ ${priceRd.toLocaleString('en-US')}).`;
  }

  const questionSummary = lastCustomerQuestion
    ? lastCustomerQuestion.slice(0, 110)
    : `Información sobre ${keywords.slice(0, 3).join(', ')}`;

  return {
    id: `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    keywords: keywords.slice(0, 12),
    questionSummary,
    learnedFact: formattedFact,
    priceRd,
    learnedFromChat: contactName,
    learnedAt: timestamp,
  };
}

export function mergeLearnedFact(
  existing: LearnedFact[] = [],
  incoming: LearnedFact
): LearnedFact[] {
  const incomingSet = new Set(incoming.keywords.map((k) => normalizeText(k)));
  const existingIndex = existing.findIndex((item) => {
    const overlap = item.keywords.filter((k) =>
      incomingSet.has(normalizeText(k))
    );
    return overlap.length >= 2 || (overlap.length === 1 && item.keywords.length === 1);
  });

  if (existingIndex > -1) {
    const updatedItem: LearnedFact = {
      ...existing[existingIndex],
      ...incoming,
      id: existing[existingIndex].id,
      keywords: Array.from(
        new Set([...existing[existingIndex].keywords, ...incoming.keywords])
      ).slice(0, 14),
    };
    const rest = existing.filter((_, idx) => idx !== existingIndex);
    return [updatedItem, ...rest];
  }

  return [incoming, ...existing];
}

export function detectSalesIntent(
  message: string,
  products: Product[],
  learnedKnowledge: LearnedFact[] = []
): SalesIntent {
  const norm = normalizeText(message);

  if (
    /\b(humano|asesor|persona|encargado|gerente|hablar con alguien|llamar)\b/.test(
      norm
    )
  ) {
    return 'asesor_humano';
  }

  if (
    /\b(confirmar pedido|cerrar pedido|generar orden|proceder al pago|finalizar compra)\b/.test(
      norm
    )
  ) {
    return 'confirmar_pedido';
  }

  if (findMatchingLearnedFact(message, learnedKnowledge)) {
    return 'memoria_aprendida';
  }

  if (
    /\b(caro|descuento|rebaja|promocion|promo|cupon|menos precio|mas barato|oferta)\b/.test(
      norm
    )
  ) {
    return 'objecion_precio';
  }

  if (
    /\b(envio|entrega|domicilio|llega|demora|despacho|ciudad|gratis|cobertura)\b/.test(
      norm
    )
  ) {
    return 'envio';
  }

  if (
    /\b(pago|pagar|transferencia|tarjeta|efectivo|contraentrega|nequi|mercado pago|cuotas|cbu|alias|clabe|banreservas|popular|bhd)\b/.test(
      norm
    )
  ) {
    return 'pago';
  }

  const matched = findMatchingProducts(message, products);
  if (matched.length > 0) {
    return 'consulta_producto';
  }

  if (
    /\b(catalogo|productos|lista|precios|que tienen|que vendes|mostrar|ver todo|modelos|disponibles)\b/.test(
      norm
    )
  ) {
    return 'catalogo';
  }

  if (isUnknownServiceOrProductQuestion(message, products, learnedKnowledge)) {
    return 'consulta_nueva';
  }

  if (/\b(hola|buenos dias|buenas tardes|buenas noches|buen dia|que tal|info)\b/.test(norm)) {
    return 'saludo';
  }

  return 'general';
}

export function findMatchingProducts(
  query: string,
  products: Product[]
): Product[] {
  const norm = normalizeText(query);
  if (!norm) return [];

  const synonymMap: Record<string, string[]> = {
    headphones: ['auricular', 'auriculares', 'audifono', 'audifonos', 'cascos', 'anc', 'audio', 'studio'],
    smartwatch: ['reloj', 'smartwatch', 'watch', 'pulsera', 'titanio', 'ultra', 'wearable'],
    espresso: ['ups', 'regulador', 'bateria', 'respaldo', '1000va', 'cafetera', 'espresso'],
    keyboard: ['teclado', 'mecanico', 'keyboard', 'keycaps', 'aluminio', 'combo'],
    speaker: ['parlante', 'bocina', 'altavoz', 'bluetooth', 'sonido'],
    backpack: ['mochila', 'bolso', 'morral', 'viaje', 'impermeable'],
  };

  return products.filter((p) => {
    const nameNorm = normalizeText(p.name);
    const catNorm = normalizeText(p.category);
    const skuNorm = normalizeText(p.sku);
    const descNorm = normalizeText(p.description);

    if (
      norm.includes(nameNorm) ||
      norm.includes(skuNorm) ||
      nameNorm.split(' ').some((word) => word.length > 3 && norm.includes(word))
    ) {
      return true;
    }

    if (catNorm.length > 3 && norm.includes(catNorm)) {
      return true;
    }

    const synonyms = synonymMap[p.visualType] || [];
    if (synonyms.some((syn) => norm.includes(syn))) {
      return true;
    }

    return descNorm
      .split(' ')
      .some((w) => w.length > 5 && norm.includes(w.replace(/[^a-z0-9]/g, '')));
  });
}

export function calculateOrderSummary(
  cart: CartItem[],
  config: BotConfig,
  couponCode?: string,
  orderSeed = 'WV-8492'
): OrderSummaryData {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const normalizedCoupon = couponCode?.trim().toUpperCase();
  const validCoupon =
    normalizedCoupon &&
    normalizedCoupon === config.activeCouponCode.toUpperCase();

  const discountAmount = validCoupon
    ? Math.round(subtotal * (config.couponDiscountPercent / 100))
    : 0;

  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const shippingCost =
    afterDiscount === 0
      ? 0
      : afterDiscount >= config.freeShippingThreshold
      ? 0
      : config.flatShippingCost;

  const total = afterDiscount + shippingCost;

  return {
    orderNumber: orderSeed,
    items: cart,
    subtotal,
    discountCode: validCoupon ? config.activeCouponCode.toUpperCase() : undefined,
    discountAmount,
    shippingCost,
    total,
    paymentMethod: config.paymentMethods[0] || 'Transferencia Banreservas / Popular / BHD',
    estimatedDelivery: '24 a 48 horas hábiles',
    status: 'confirmado',
  };
}

export function addOrUpdateCartItem(
  cart: CartItem[],
  product: Product,
  quantityDelta = 1
): CartItem[] {
  const existingIndex = cart.findIndex((c) => c.productId === product.id);
  if (existingIndex > -1) {
    const updated = [...cart];
    const nextQty = updated[existingIndex].quantity + quantityDelta;
    if (nextQty <= 0) {
      updated.splice(existingIndex, 1);
    } else {
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: nextQty,
      };
    }
    return updated;
  }

  if (quantityDelta <= 0) return cart;

  return [
    ...cart,
    {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: quantityDelta,
      sku: product.sku,
    },
  ];
}

export interface ExecutiveSummaryResult {
  summary: string;
  actionItem: string;
  priority: 'alta' | 'media' | 'baja';
  category: 'urgente' | 'cliente' | 'reunion' | 'cobro' | 'personal' | 'informativo';
}

export function summarizeConversationHeuristic(
  lead: CustomerLead,
  config: BotConfig
): ExecutiveSummaryResult {
  const realMessages = (lead.messages || []).filter(
    (m) => !m.id.startsWith('wa-init-')
  );
  const customerMessages = realMessages.filter((m) => m.sender === 'customer');
  const lastMsg = realMessages[realMessages.length - 1];
  const lastCustomerMsg = customerMessages[customerMessages.length - 1];

  if (!lastMsg) {
    return {
      summary: lead.aiSummary || 'Sin mensajes recientes en esta conversación.',
      actionItem: lead.aiActionItem || 'Sin acciones pendientes.',
      priority: lead.aiPriority || 'baja',
      category: (lead.aiCategory as any) || 'informativo',
    };
  }

  const combinedCustomerText = customerMessages
    .slice(-4)
    .map((m) => m.text)
    .join(' ');
  const norm = normalizeText(combinedCustomerText || lastMsg.text);
  const contactFirstName = lead.name.split(' ')[0] || 'El contacto';
  const ownerName = config.ownerName || 'ti';

  if (lastMsg.sender === 'agent') {
    return {
      summary: `Respondido por ${ownerName}: "${lastMsg.text.slice(
        0,
        85
      )}". La secretaria ya actualizó su memoria con tu respuesta.`,
      actionItem: 'Esperando respuesta del contacto.',
      priority: 'baja',
      category: 'cliente',
    };
  }

  if (
    lastMsg.intentTag === 'consulta_nueva_aprendizaje' ||
    isUnknownServiceOrProductQuestion(
      lastCustomerMsg?.text || '',
      [],
      config.learnedKnowledge || []
    )
  ) {
    return {
      summary: `${contactFirstName} pregunta por un servicio/artículo nuevo: "${(
        lastCustomerMsg?.text || lastMsg.text
      ).slice(0, 90)}"`,
      actionItem: `Respóndele con el detalle o precio en RD$ para que la secretaria lo aprenda automáticamente.`,
      priority: 'alta',
      category: 'cliente',
    };
  }

  if (
    /\b(urgente|emergencia|ahora mismo|llamar|llamame|problema|error|fallo|caido|no funciona|reclamo)\b/.test(
      norm
    )
  ) {
    return {
      summary: `${contactFirstName} reporta un tema urgente: "${(
        lastCustomerMsg?.text || lastMsg.text
      ).slice(0, 95)}"`,
      actionItem: `Contactar o responder a ${contactFirstName} con prioridad.`,
      priority: 'alta',
      category: 'urgente',
    };
  }

  if (
    /\b(pago|pagar|transferencia|comprobante|factura|cobro|deposito|abono|cuenta|banco|banreservas|popular|bhd)\b/.test(
      norm
    )
  ) {
    return {
      summary: `${contactFirstName} escribe sobre un pago, transferencia o comprobante en RD$.`,
      actionItem: `Verificar transferencia/facturación de ${contactFirstName} y confirmar.`,
      priority: 'alta',
      category: 'cobro',
    };
  }

  if (
    /\b(reunion|cita|llamada|agenda|agendar|manana|jueves|viernes|lunes|martes|miercoles|hora|disponible|visita)\b/.test(
      norm
    )
  ) {
    return {
      summary: `${contactFirstName} solicita coordinar una reunión, llamada o cita con ${ownerName}.`,
      actionItem: `Confirmar horario disponible en agenda para ${contactFirstName}.`,
      priority: 'media',
      category: 'reunion',
    };
  }

  if (
    /\b(precio|cotizacion|cotizar|catalogo|presupuesto|costo|cuanto cuesta|servicio|sistema|equipo|comprar|pedido)\b/.test(
      norm
    )
  ) {
    return {
      summary: `${contactFirstName} solicita cotización o información en RD$: "${(
        lastCustomerMsg?.text || lastMsg.text
      ).slice(0, 85)}"`,
      actionItem: `Revisar cotización en RD$ para ${contactFirstName}.`,
      priority: 'media',
      category: 'cliente',
    };
  }

  return {
    summary: `${contactFirstName} escribió: "${(
      lastCustomerMsg?.text || lastMsg.text
    ).slice(0, 95)}"`,
    actionItem: `Revisar mensaje de ${contactFirstName} cuando estés disponible.`,
    priority: 'media',
    category: 'informativo',
  };
}

export function generateDeterministicSalesReply(
  customerMessage: string,
  lead: CustomerLead,
  products: Product[],
  config: BotConfig
): BotReplyResult {
  const norm = normalizeText(customerMessage);
  let updatedCart = [...lead.cart];
  let updatedStage: LeadStage = lead.stage;
  let appliedCoupon = lead.appliedCoupon;

  const isSalesMode = config.assistantRole === 'ventas';
  const ownerName = config.ownerName || 'Ezequiel';
  const currency = config.currencySymbol || 'RD$';
  const firstName =
    lead.name && !lead.name.startsWith('WhatsApp ')
      ? lead.name.split(' ')[0]
      : '';
  const nameGreeting = firstName ? ` ${firstName}` : '';

  // Find previous bot messages to avoid ever repeating the exact same phrase
  const previousBotMessages = (lead.messages || [])
    .filter((m) => m.sender === 'bot' && !m.id.startsWith('wa-init-'))
    .map((m) => m.text.trim());
  const lastBotText =
    previousBotMessages[previousBotMessages.length - 1] || '';

  // 1. Check Learned Memory FIRST (Continuous Self-Learning from Ezequiel's replies across chats)
  const matchedFact = findMatchingLearnedFact(
    customerMessage,
    config.learnedKnowledge || []
  );
  if (matchedFact) {
    if (updatedStage === 'nuevo') updatedStage = 'interesado';
    const factSentence = matchedFact.learnedFact.trim();
    const candidates = [
      `Hola${nameGreeting}, claro que sí: ${factSentence} ¿Te gustaría que te lo vayamos coordinando con ${ownerName}?`,
      `Con gusto te informo${nameGreeting}: ${factSentence} Si deseas solicitarlo o tienes alguna duda, avísame para anotarlo con ${ownerName}.`,
    ];
    const replyText =
      candidates.find((c) => c !== lastBotText) || candidates[0];

    return {
      replyText,
      intent: 'memoria_aprendida',
      matchedLearnedFact: matchedFact,
      productCards: undefined,
      quickReplies: [
        'Sí, me interesa solicitarlo',
        'Consultar métodos de pago',
        `Hablar con ${ownerName}`,
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }

  // 2. Check custom automated rules
  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const triggered = rule.triggerKeywords.some((kw) =>
      norm.includes(normalizeText(kw))
    );
    if (triggered) {
      const candidate = rule.responseTemplate
        .replace('{nombre}', firstName || 'hola')
        .replace('{negocio}', config.businessName)
        .replace('{cupon}', config.activeCouponCode);
      if (candidate !== lastBotText) {
        return {
          replyText: candidate,
          intent: rule.attachCatalog ? 'catalogo' : 'general',
          productCards:
            rule.attachCatalog && isSalesMode ? products.slice(0, 2) : undefined,
          quickReplies: [
            'Dejar un recado urgente',
            'Agendar llamada',
            'Solicitar cotización',
          ],
          updatedCart,
          updatedStage:
            lead.stage === 'nuevo' && config.autoQualifyLeadStage
              ? 'interesado'
              : lead.stage,
          appliedCoupon,
        };
      }
    }
  }

  const intent = detectSalesIntent(
    customerMessage,
    products,
    config.learnedKnowledge || []
  );
  const matchedProducts = findMatchingProducts(customerMessage, products);

  if (
    norm.includes(normalizeText(config.activeCouponCode)) ||
    /\b(con el cupon|con cupon|con descuento)\b/.test(norm)
  ) {
    appliedCoupon = config.activeCouponCode;
  }

  // 3. If customer asks about a new service or item not yet in learned memory or catalog
  if (intent === 'consulta_nueva') {
    if (updatedStage === 'nuevo') updatedStage = 'interesado';
    const unknownReplies = [
      `Hola${nameGreeting}, déjame confirmarte ese detalle y el precio exacto en ${currency} directamente con ${ownerName} y te respondo en unos minutos.`,
      `Buen día${nameGreeting}, ya mismo le consulto a ${ownerName} sobre ese servicio para darte el dato exacto en ${currency} enseguida.`,
    ];
    const replyText =
      unknownReplies.find((r) => r !== lastBotText) || unknownReplies[0];

    return {
      replyText,
      intent: 'consulta_nueva',
      productCards: undefined,
      quickReplies: [
        `Dejar recado para ${ownerName}`,
        'Ver catálogo disponible',
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }

  // 4. If acting as Personal/Executive Secretary (default), prioritize natural, concise, human responses without product spam
  if (!isSalesMode && intent !== 'consulta_producto' && intent !== 'confirmar_pedido') {
    let replyText = '';

    if (intent === 'asesor_humano' || /\b(urgente|llamar|llamame)\b/.test(norm)) {
      replyText = `Perfecto${nameGreeting}, ya le pasé tu aviso urgente a ${ownerName} con los detalles para que te contacte apenas se desocupe.`;
      updatedStage = 'negociacion';
    } else if (/\b(reunion|cita|agenda|manana|hora|llamada)\b/.test(norm)) {
      replyText = `Claro que sí${nameGreeting}, tomo nota para la agenda de ${ownerName}. ¿Qué horario te queda mejor para confirmarte disponibilidad?`;
      if (updatedStage === 'nuevo') updatedStage = 'interesado';
    } else if (intent === 'pago' || /\b(factura|comprobante|transferencia|banreservas|popular|bhd)\b/.test(norm)) {
      replyText = `Muchas gracias${nameGreeting}, ya dejé registrado el aviso para que ${ownerName} verifique la transferencia y te confirme enseguida.`;
      updatedStage = 'cotizado';
    } else if (intent === 'catalogo' || /\b(precio|cotizacion|cotizar|servicio|presupuesto)\b/.test(norm)) {
      replyText = `Con gusto${nameGreeting}. Cuéntame brevemente qué servicio o artículo necesitas cotizar en ${currency} para revisarlo con ${ownerName}.`;
      if (updatedStage === 'nuevo') updatedStage = 'interesado';
    } else if (intent === 'saludo' && previousBotMessages.length === 0) {
      replyText = config.welcomeMessage
        .replace('{nombre}', firstName || '')
        .replace(/\s+,/g, ',')
        .replace('{negocio}', config.businessName)
        .replace('{agente}', config.agentName);
      if (updatedStage === 'nuevo') updatedStage = 'interesado';
    } else if (previousBotMessages.length === 0) {
      replyText = `Hola${nameGreeting}, te saluda ${config.agentName}, asistente de ${ownerName} en ${config.businessName}. Ya tomé nota de tu mensaje; ¿deseas agregar algún detalle importante para pasárselo ahora mismo?`;
      if (updatedStage === 'nuevo') updatedStage = 'interesado';
    } else {
      // Follow-up message in the same conversation: never repeat the greeting!
      const followUpOptions = [
        `Anotado${nameGreeting}, ya actualicé el resumen para ${ownerName} con esta información. Te responderá personalmente en breve.`,
        `Perfecto${nameGreeting}, quedo al pendiente y le acabo de pasar este detalle directo a ${ownerName}.`,
        `Gracias por el dato${nameGreeting}. Ya quedó registrado en los pendientes prioritarios de ${ownerName}.`,
      ];
      replyText =
        followUpOptions.find((opt) => opt !== lastBotText) || followUpOptions[0];
    }

    return {
      replyText,
      intent,
      productCards: undefined,
      quickReplies: [
        `Dejar recado para ${ownerName}`,
        'Es urgente',
        'Solicitar cotización',
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }


  if (intent === 'asesor_humano') {
    return {
      replyText: `Perfecto${nameGreeting}, ya le notifiqué a ${ownerName} en ${config.businessName} para que te atienda personalmente en este chat.`,
      intent,
      quickReplies: ['Dejar detalle adicional', 'Ver resumen'],
      updatedCart,
      updatedStage: 'negociacion',
      appliedCoupon,
    };
  }

  if (intent === 'objecion_precio') {
    appliedCoupon = config.activeCouponCode;
    if (config.autoQualifyLeadStage && updatedStage === 'nuevo') {
      updatedStage = 'negociacion';
    }
    return {
      replyText: `Entiendo${nameGreeting}. Para ayudarte hoy mismo, te activé el código *${config.activeCouponCode}* con un *${config.couponDiscountPercent}% de descuento* sobre tu cotización.`,
      intent,
      productCards: matchedProducts.length > 0 ? matchedProducts : undefined,
      quickReplies: [
        'Confirmar pedido con descuento',
        'Consultar métodos de pago',
      ],
      updatedCart,
      updatedStage: 'negociacion',
      appliedCoupon,
    };
  }

  if (intent === 'confirmar_pedido') {
    if (updatedCart.length === 0) {
      const defaultProduct = matchedProducts[0] || products[0];
      if (defaultProduct) {
        updatedCart = addOrUpdateCartItem(updatedCart, defaultProduct, 1);
      }
    }
    const summary = calculateOrderSummary(
      updatedCart,
      config,
      appliedCoupon,
      `WV-${Math.floor(1000 + (lead.name.length * 317) % 8900)}`
    );
    updatedStage = 'cotizado';

    return {
      replyText: `¡Excelente${nameGreeting}! Aquí tienes el resumen de tu orden en *${config.businessName}*. Puedes abonar mediante ${config.paymentMethods.join(', ')}.`,
      intent,
      orderSummary: summary,
      quickReplies: [
        'Ya realicé el pago',
        'Agregar otro producto',
        'Hablar con encargado',
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }

  if (intent === 'consulta_producto' && matchedProducts.length > 0) {
    if (
      /\b(agregar|sumar|quiero|llevar|comprar|anadir)\b/.test(norm) &&
      matchedProducts.length === 1
    ) {
      updatedCart = addOrUpdateCartItem(updatedCart, matchedProducts[0], 1);
      updatedStage = 'cotizado';
    } else if (updatedStage === 'nuevo') {
      updatedStage = 'interesado';
    }

    const topProduct = matchedProducts[0];
    const discountBadge = topProduct.originalPrice
      ? ` (Antes ${config.currencySymbol}${topProduct.originalPrice}, ahora *${config.currencySymbol}${topProduct.price}*)`
      : ` a *${config.currencySymbol}${topProduct.price}*`;

    return {
      replyText: `¡Claro que sí${nameGreeting}! Tenemos disponible *${topProduct.name}*${discountBadge} con ${topProduct.warrantyMonths} meses de garantía.`,
      intent,
      productCards: isSalesMode ? matchedProducts.slice(0, 2) : undefined,
      quickReplies: [
        `Comprar ${topProduct.name}`,
        '¿Tienen algún descuento?',
        'Confirmar pedido',
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }

  if (intent === 'catalogo') {
    if (updatedStage === 'nuevo') updatedStage = 'interesado';
    const briefList = products
      .slice(0, 4)
      .map((p) => `• *${p.name}*: ${config.currencySymbol}${p.price}`)
      .join('\n');
    return {
      replyText: `¡Con gusto${nameGreeting}! Estos son nuestros productos y servicios destacados en *${config.businessName}*:\n${briefList}\n\n¿Cuál te gustaría cotizar?`,
      intent,
      productCards: isSalesMode ? products.slice(0, 3) : undefined,
      quickReplies: [
        'Solicitar cotización',
        '¿Tienen descuento?',
        'Hablar con encargado',
      ],
      updatedCart,
      updatedStage,
      appliedCoupon,
    };
  }

  if (intent === 'envio') {
    return {
      replyText: `Realizamos entregas a ${lead.city || 'domicilio'} en *24 a 48 hs hábiles*. El envío estándar es de ${config.currencySymbol}${config.flatShippingCost} (gratis superando ${config.currencySymbol}${config.freeShippingThreshold}).`,
      intent,
      quickReplies: ['Consultar métodos de pago', 'Confirmar pedido'],
      updatedCart,
      updatedStage: updatedStage === 'nuevo' ? 'interesado' : updatedStage,
      appliedCoupon,
    };
  }

  if (intent === 'pago') {
    if (norm.includes('ya realice') || norm.includes('ya pague') || norm.includes('comprobante')) {
      updatedStage = 'pagado';
      return {
        replyText: `¡Muchas gracias${nameGreeting}! Ya dejé registrado tu aviso de pago para que ${ownerName} lo valide ahora mismo.`,
        intent,
        quickReplies: ['Solicitar comprobante', 'Dejar nota'],
        updatedCart,
        updatedStage,
        appliedCoupon,
      };
    }

    return {
      replyText: `Puedes abonar en *${config.businessName}* mediante:\n• ${config.paymentMethods.join('\n• ')}\n\n¿Deseas que te prepare el resumen de tu orden?`,
      intent,
      quickReplies: ['Confirmar pedido', 'Hablar con encargado'],
      updatedCart,
      updatedStage: updatedStage === 'nuevo' ? 'interesado' : updatedStage,
      appliedCoupon,
    };
  }

  if (intent === 'saludo' && previousBotMessages.length === 0) {
    return {
      replyText: `${config.welcomeMessage
        .replace('{nombre}', firstName || '')
        .replace(/\s+,/g, ',')
        .replace('{negocio}', config.businessName)
        .replace('{agente}', config.agentName)}`,
      intent,
      productCards:
        isSalesMode && config.autoSendProductCards
          ? products.slice(0, 2)
          : undefined,
      quickReplies: [
        `Dejar recado para ${ownerName}`,
        'Ver catálogo y precios',
        'Consultar horarios',
      ],
      updatedCart,
      updatedStage: updatedStage === 'nuevo' ? 'interesado' : updatedStage,
      appliedCoupon,
    };
  }

  const fallbackOptions = [
    `Gracias por escribir${nameGreeting}. Ya tomé nota de tu mensaje para ${ownerName}. ¿Hay algún detalle adicional que quieras que le comente?`,
    `Entendido${nameGreeting}, acabo de registrar tu mensaje en el resumen prioritario de ${ownerName} para que te responda en cuanto se desocupe.`,
  ];
  const chosenFallback =
    fallbackOptions.find((opt) => opt !== lastBotText) || fallbackOptions[0];

  return {
    replyText: chosenFallback,
    intent: 'general',
    productCards: undefined,
    quickReplies: [
      `Dejar recado para ${ownerName}`,
      'Es urgente',
      'Solicitar cotización',
    ],
    updatedCart,
    updatedStage,
    appliedCoupon,
  };
}

export function sanitizePhoneDigits(phone: string): string {
  return (phone || '').replace(/\D/g, '').replace(/^00/, '');
}

export function formatPhoneDisplay(phone: string): string {
  const digits = sanitizePhoneDigits(phone);
  if (!digits) return phone || 'Sin número';

  // +1 (NANP: DR 809/829/849, US/CA, PR)
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const mid = digits.slice(4, 7);
    const last = digits.slice(7, 11);
    return `+1 (${area}) ${mid}-${last}`;
  }

  // Mexico +52 (12 digits)
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+52 ${digits.slice(2, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }

  // Colombia +57 (12 digits)
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  // Spain +34 (11 digits)
  if (digits.length === 11 && digits.startsWith('34')) {
    return `+34 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  // Generic international formatting
  if (digits.length > 8) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }

  return `+${digits}`;
}

export function detectCountryOrCityFromPhone(phone: string): string {
  const digits = sanitizePhoneDigits(phone);
  if (
    digits.startsWith('1809') ||
    digits.startsWith('1829') ||
    digits.startsWith('1849')
  ) {
    return 'República Dominicana';
  }
  if (digits.startsWith('1787') || digits.startsWith('1939')) {
    return 'Puerto Rico';
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return 'EE. UU. / Canadá';
  }
  if (digits.startsWith('52')) return 'México';
  if (digits.startsWith('57')) return 'Colombia';
  if (digits.startsWith('54')) return 'Argentina';
  if (digits.startsWith('56')) return 'Chile';
  if (digits.startsWith('51')) return 'Perú';
  if (digits.startsWith('58')) return 'Venezuela';
  if (digits.startsWith('593')) return 'Ecuador';
  if (digits.startsWith('507')) return 'Panamá';
  if (digits.startsWith('506')) return 'Costa Rica';
  if (digits.startsWith('502')) return 'Guatemala';
  if (digits.startsWith('503')) return 'El Salvador';
  if (digits.startsWith('34')) return 'España';
  if (digits.startsWith('44')) return 'Reino Unido';
  return 'WhatsApp Directo';
}

export function extractWhatsAppMessageText(rawMessage: any): string {
  if (!rawMessage || typeof rawMessage !== 'object') return '';

  // Unwrap nested containers (ephemeral / disappearing messages, viewOnce, deviceSent, edited)
  const inner =
    rawMessage.ephemeralMessage?.message ||
    rawMessage.viewOnceMessage?.message ||
    rawMessage.viewOnceMessageV2?.message ||
    rawMessage.viewOnceMessageV2Extension?.message ||
    rawMessage.documentWithCaptionMessage?.message ||
    rawMessage.deviceSentMessage?.message ||
    rawMessage.editedMessage?.message?.protocolMessage?.editedMessage ||
    rawMessage;

  if (inner !== rawMessage) {
    return extractWhatsAppMessageText(inner);
  }

  const directText =
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.imageMessage?.caption ||
    inner.videoMessage?.caption ||
    inner.documentMessage?.caption ||
    inner.buttonsResponseMessage?.selectedDisplayText ||
    inner.listResponseMessage?.title ||
    inner.templateButtonReplyMessage?.selectedDisplayText ||
    inner.interactiveResponseMessage?.body?.text ||
    '';

  if (directText && String(directText).trim()) {
    return String(directText).trim();
  }

  if (inner.imageMessage) return '📷 [Imagen recibida]';
  if (inner.audioMessage) return '🎤 [Nota de voz recibida]';
  if (inner.videoMessage) return '🎥 [Video recibido]';
  if (inner.documentMessage) {
    return `📄 [Documento: ${inner.documentMessage.fileName || 'Archivo'}]`;
  }
  if (inner.stickerMessage) return '🏷️ [Sticker]';
  if (inner.locationMessage || inner.liveLocationMessage) {
    return '📍 [Ubicación compartida]';
  }
  if (inner.contactMessage || inner.contactsArrayMessage) {
    return '👤 [Contacto compartido]';
  }

  return '';
}

export function formatWhatsAppJid(phone: string): string {
  if (!phone) return '';
  if (phone.includes('@s.whatsapp.net') || phone.includes('@lid')) {
    return phone.trim();
  }
  const digits = sanitizePhoneDigits(phone);
  if (!digits) return '';
  return `${digits}@s.whatsapp.net`;
}

export interface SafetyFilterInput {
  remoteJid: string;
  resolvedPhoneDigits?: string;
  myPhoneDigits?: string;
  fromMe: boolean;
  text: string;
  ignoreGroups: boolean;
  onlyWhitelist: boolean;
  whitelistPhones: string[];
  allowSelfChat?: boolean;
  globalBotAutoReply?: boolean;
  leadBotActive?: boolean;
  assistantRole?: 'secretaria' | 'solo_resumen' | 'ventas';
}

export function shouldBotReplyToIncoming(input: SafetyFilterInput): boolean {
  const {
    remoteJid,
    resolvedPhoneDigits,
    myPhoneDigits,
    fromMe,
    text,
    ignoreGroups,
    onlyWhitelist,
    whitelistPhones,
    allowSelfChat = false,
    globalBotAutoReply = true,
    leadBotActive = true,
    assistantRole = 'secretaria',
  } = input;

  if (!globalBotAutoReply || !leadBotActive) return false;
  if (assistantRole === 'solo_resumen') return false;
  if (!remoteJid || !text || !text.trim()) return false;
  if (
    remoteJid === 'status@broadcast' ||
    remoteJid.endsWith('@broadcast') ||
    remoteJid.endsWith('@newsletter')
  ) {
    return false;
  }
  if (ignoreGroups && remoteJid.endsWith('@g.us')) {
    return false;
  }

  const senderDigits =
    sanitizePhoneDigits(resolvedPhoneDigits || '') ||
    sanitizePhoneDigits(remoteJid.split('@')[0]);
  const cleanMyDigits = sanitizePhoneDigits(myPhoneDigits || '');

  // CRITICAL FIX: If the message was sent by the user (`fromMe === true`), NEVER trigger an automated reply
  // to another person's chat! Only allow `fromMe` if `allowSelfChat` is enabled AND the user is literally messaging their own number.
  if (fromMe) {
    if (!allowSelfChat) return false;
    if (!cleanMyDigits || senderDigits !== cleanMyDigits) {
      return false;
    }
  }

  if (onlyWhitelist) {
    if (!senderDigits) return false;
    const matched = whitelistPhones.some((allowed) => {
      const cleanAllowed = sanitizePhoneDigits(allowed);
      return (
        cleanAllowed.length >= 7 &&
        (senderDigits.endsWith(cleanAllowed.slice(-8)) ||
          cleanAllowed.endsWith(senderDigits.slice(-8)))
      );
    });
    if (!matched) return false;
  }

  return true;
}

export function formatProductCardForRealWhatsApp(
  product: Product,
  config: BotConfig
): string {
  const priceLine = product.originalPrice
    ? `~${config.currencySymbol}${product.originalPrice}~ *${config.currencySymbol}${product.price}*`
    : `*${config.currencySymbol}${product.price}*`;

  return [
    `📦 *${product.name}*`,
    `🔖 SKU: ${product.sku} | Categoría: ${product.category}`,
    `💰 Precio: ${priceLine}`,
    `✅ Stock inmediato (${product.stock} uds) · Garantía ${product.warrantyMonths} meses`,
    ``,
    `${product.description}`,
    ``,
    `🎁 Cupón activo: *${config.activeCouponCode}* (${config.couponDiscountPercent}% OFF)`,
    `👉 Responde *"Confirmar pedido"* para generar tu orden.`,
  ].join('\n');
}

export function formatOrderReceiptForRealWhatsApp(
  summary: OrderSummaryData,
  config: BotConfig
): string {
  const itemLines = summary.items
    .map(
      (i) =>
        `• ${i.quantity}x ${i.name}: ${config.currencySymbol}${
          i.price * i.quantity
        }`
    )
    .join('\n');

  const lines = [
    `🧾 *ORDEN DE COMPRA #${summary.orderNumber} — ${config.businessName}*`,
    `--------------------------------`,
    itemLines,
    `--------------------------------`,
    `Subtotal: ${config.currencySymbol}${summary.subtotal}`,
  ];

  if (summary.discountAmount > 0) {
    lines.push(
      `Descuento (${summary.discountCode}): -${config.currencySymbol}${summary.discountAmount}`
    );
  }

  lines.push(
    `Envío Asegurado: ${
      summary.shippingCost === 0
        ? 'GRATIS'
        : `${config.currencySymbol}${summary.shippingCost}`
    }`,
    `*TOTAL A PAGAR: ${config.currencySymbol}${summary.total}*`,
    ``,
    `💳 *Medios de Pago:* ${config.paymentMethods.join(' / ')}`,
    `🚚 *Entrega estimada:* ${summary.estimatedDelivery}`
  );

  return lines.join('\n');
}

export function buildWaMeDirectLink(phone: string, message: string): string {
  const digits = sanitizePhoneDigits(phone);
  const encoded = encodeURIComponent(message);
  if (!digits) {
    return `https://api.whatsapp.com/send?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encoded}`;
}

export function generateWhatsAppWebScript(
  products: Product[],
  config: BotConfig,
  apiBaseUrl = ''
): { userscript: string; baileysCode: string } {
  const catalogSimplified = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    stock: p.stock,
    description: p.description,
  }));

  const endpointUrl = apiBaseUrl
    ? `${apiBaseUrl.replace(/\/$/, '')}/api/sales-chat`
    : 'http://localhost:3000/api/sales-chat';

  const userscript = `// ==UserScript==
// @name         ${config.businessName} - Barra IA para WhatsApp Web
// @namespace    https://web.whatsapp.com/
// @version      3.0.0
// @description  Inyector de respuestas IA y catálogo en vivo para web.whatsapp.com
// @match        https://web.whatsapp.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const API_URL = ${JSON.stringify(endpointUrl)};
  const BOT_CONFIG = ${JSON.stringify(config, null, 2)};
  const PRODUCTS = ${JSON.stringify(catalogSimplified, null, 2)};

  function insertIntoWhatsAppInput(text) {
    const inputBox = document.querySelector('footer div[contenteditable="true"]') ||
                     document.querySelector('div[contenteditable="true"][data-tab="10"]');
    if (!inputBox) {
      alert('Abre primero un chat en WhatsApp Web para insertar el mensaje.');
      return;
    }
    inputBox.focus();
    document.execCommand('insertText', false, text);
  }

  function getLastIncomingMessage() {
    const incomingNodes = document.querySelectorAll('.message-in .selectable-text span');
    if (!incomingNodes.length) return 'Hola, quiero ver el catálogo';
    return incomingNodes[incomingNodes.length - 1].textContent || 'Hola';
  }

  function mountSalesToolbar() {
    if (document.getElementById('whatsventas-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'whatsventas-bar';
    bar.style.cssText = 'position:fixed;bottom:72px;right:24px;z-index:99999;background:#0f172a;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.25);display:flex;gap:8px;align-items:center;font-family:sans-serif;font-size:12px;';

    const title = document.createElement('strong');
    title.textContent = '⚡ ' + BOT_CONFIG.businessName;
    title.style.color = '#34d399';
    bar.appendChild(title);

    const btnAi = document.createElement('button');
    btnAi.textContent = 'Responder último mensaje con IA';
    btnAi.style.cssText = 'background:#00a884;color:#fff;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-weight:600;';
    btnAi.onclick = async () => {
      const lastMsg = getLastIncomingMessage();
      btnAi.textContent = 'Generando...';
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerMessage: lastMsg, products: PRODUCTS, config: BOT_CONFIG })
        });
        const data = await res.json();
        insertIntoWhatsAppInput(data.replyText || '¡Hola! Aquí tienes nuestro catálogo actualizado.');
      } catch (e) {
        const lines = PRODUCTS.map(p => '• *' + p.name + '*: ' + BOT_CONFIG.currencySymbol + p.price).join('\\n');
        insertIntoWhatsAppInput('¡Hola! Bienvenido a *' + BOT_CONFIG.businessName + '*\\n\\n' + lines + '\\n\\nCupón: *' + BOT_CONFIG.activeCouponCode + '*');
      }
      btnAi.textContent = 'Responder último mensaje con IA';
    };
    bar.appendChild(btnAi);

    document.body.appendChild(bar);
  }

  setInterval(mountSalesToolbar, 2500);
})();`;

  const baileysCode = `import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';

const CATALOG = ${JSON.stringify(catalogSimplified, null, 2)};

async function startSalesBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_whatsapp_ventas');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid!;
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase();

    if (text.includes('catalogo') || text.includes('precio') || text.includes('hola')) {
      const lines = CATALOG.map(p => \`• *\${p.name}* (\${p.sku}): ${config.currencySymbol}\${p.price}\`).join('\\n');
      await sock.sendMessage(remoteJid, {
        text: \`¡Hola! Bienvenido a *${config.businessName}*\\n\\nCatálogo disponible hoy:\\n\${lines}\\n\\nUsa el cupón *${config.activeCouponCode}* para un ${config.couponDiscountPercent}% OFF.\`
      });
    }
  });
}

startSalesBot();`;

  return { userscript, baileysCode };
}

