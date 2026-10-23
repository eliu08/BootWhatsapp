import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addOrUpdateCartItem,
  calculateOrderSummary,
  detectCountryOrCityFromPhone,
  detectSalesIntent,
  extractDominicanPrice,
  extractLearnedFactFromOwnerReply,
  extractWhatsAppMessageText,
  findMatchingLearnedFact,
  findMatchingProducts,
  formatOrderReceiptForRealWhatsApp,
  formatPhoneDisplay,
  formatProductCardForRealWhatsApp,
  formatWhatsAppJid,
  generateDeterministicSalesReply,
  mergeLearnedFact,
  shouldBotReplyToIncoming,
  summarizeConversationHeuristic,
} from './salesEngine';
import { BotConfig, CustomerLead, Product } from '../types/sales';

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'p1',
    sku: 'AUD-PRO-01',
    name: 'Auriculares Studio ANC Pro',
    category: 'Audio',
    price: 3450,
    originalPrice: 4200,
    stock: 18,
    description: 'Cancelación activa de ruido híbrida y 45h de batería.',
    highlights: ['ANC 45dB', '45h batería', 'USB-C carga rápida'],
    visualType: 'headphones',
    warrantyMonths: 12,
  },
  {
    id: 'p2',
    sku: 'WTC-ULT-02',
    name: 'Smartwatch Titanium Ultra',
    category: 'Wearables',
    price: 4850,
    originalPrice: 5600,
    stock: 11,
    description: 'Caja de titanio aeroespacial, GPS doble banda y sumergible.',
    highlights: ['Titanio grado 5', 'GPS Dual', 'Pantalla 2000 nits'],
    visualType: 'smartwatch',
    warrantyMonths: 24,
  },
];

const SAMPLE_CONFIG: BotConfig = {
  businessName: 'M&E TECHNOLOGIES',
  ownerName: 'Ezequiel',
  agentName: 'Valeria',
  assistantRole: 'ventas',
  tone: 'consultivo',
  currencySymbol: 'RD$',
  freeShippingThreshold: 5000,
  flatShippingCost: 250,
  activeCouponCode: 'WHATS15',
  couponDiscountPercent: 15,
  paymentMethods: ['Transferencia Banreservas / Popular / BHD', 'Efectivo'],
  welcomeMessage: '¡Hola {nombre}! Soy {agente} de {negocio}. ¿En qué te ayudo?',
  objectionDiscountOffer: 'Usa el cupón WHATS15',
  responseDelayMs: 600,
  autoSendProductCards: false,
  autoQualifyLeadStage: true,
  rules: [],
  learnedKnowledge: [],
};

const SAMPLE_LEAD: CustomerLead = {
  id: 'lead-1',
  name: 'Carlos Mendoza',
  phone: '+1 (809) 555-1034',
  city: 'Santo Domingo',
  avatarInitials: 'CM',
  avatarColor: '#0f766e',
  stage: 'nuevo',
  unreadCount: 0,
  lastActivity: '10:30',
  botActive: true,
  tags: ['Audio'],
  notes: '',
  cart: [],
  messages: [],
};

test('detectSalesIntent identifies product inquiry, catalog, price objection and checkout', () => {
  assert.equal(
    detectSalesIntent('Hola, qué precio tienen los auriculares studio?', SAMPLE_PRODUCTS),
    'consulta_producto'
  );
  assert.equal(
    detectSalesIntent('Me muestras el catálogo completo por favor', SAMPLE_PRODUCTS),
    'catalogo'
  );
  assert.equal(
    detectSalesIntent('Está un poco caro, tienen algún cupón de descuento?', SAMPLE_PRODUCTS),
    'objecion_precio'
  );
  assert.equal(
    detectSalesIntent('Quiero confirmar pedido ahora mismo', SAMPLE_PRODUCTS),
    'confirmar_pedido'
  );
});

test('findMatchingProducts matches by name, synonym, or SKU', () => {
  const byName = findMatchingProducts('auriculares', SAMPLE_PRODUCTS);
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, 'p1');

  const byWatchSynonym = findMatchingProducts('busco un reloj inteligente', SAMPLE_PRODUCTS);
  assert.equal(byWatchSynonym.length, 1);
  assert.equal(byWatchSynonym[0].id, 'p2');
});

test('calculateOrderSummary applies coupon discount and free shipping rules in RD$', () => {
  let cart = addOrUpdateCartItem([], SAMPLE_PRODUCTS[0], 1); // RD$ 3450
  const summaryNoCoupon = calculateOrderSummary(cart, SAMPLE_CONFIG);
  assert.equal(summaryNoCoupon.subtotal, 3450);
  assert.equal(summaryNoCoupon.discountAmount, 0);
  assert.equal(summaryNoCoupon.shippingCost, 250); // below RD$ 5000 threshold
  assert.equal(summaryNoCoupon.total, 3700);

  // Add second item (3450 + 4850 = 8300) with WHATS15 coupon (15% off = 1245)
  cart = addOrUpdateCartItem(cart, SAMPLE_PRODUCTS[1], 1);
  const summaryWithCoupon = calculateOrderSummary(cart, SAMPLE_CONFIG, 'whats15');
  assert.equal(summaryWithCoupon.subtotal, 8300);
  assert.equal(summaryWithCoupon.discountAmount, 1245);
  assert.equal(summaryWithCoupon.shippingCost, 0); // 7055 >= 5000 free shipping
  assert.equal(summaryWithCoupon.total, 7055);
});

test('generateDeterministicSalesReply adds product to cart on buy intent and advances lead stage', () => {
  const reply = generateDeterministicSalesReply(
    'Quiero comprar los auriculares studio',
    SAMPLE_LEAD,
    SAMPLE_PRODUCTS,
    SAMPLE_CONFIG
  );
  assert.equal(reply.intent, 'consulta_producto');
  assert.equal(reply.updatedCart.length, 1);
  assert.equal(reply.updatedCart[0].productId, 'p1');
  assert.equal(reply.updatedStage, 'cotizado');
  assert.ok(reply.productCards && reply.productCards.length > 0);
});

test('secretary mode replies naturally without unsolicited product cards and never repeats itself', () => {
  const secretaryConfig: BotConfig = {
    ...SAMPLE_CONFIG,
    assistantRole: 'secretaria',
  };
  const firstReply = generateDeterministicSalesReply(
    'Hola buenas tardes',
    SAMPLE_LEAD,
    SAMPLE_PRODUCTS,
    secretaryConfig
  );
  assert.equal(firstReply.productCards, undefined);

  const leadAfterFirst: CustomerLead = {
    ...SAMPLE_LEAD,
    messages: [
      {
        id: 'm1',
        sender: 'bot',
        text: firstReply.replyText,
        timestamp: '10:31',
        status: 'read',
      },
    ],
  };

  const secondReply = generateDeterministicSalesReply(
    'Necesito dejarle un recado a Ezequiel sobre el servidor',
    leadAfterFirst,
    SAMPLE_PRODUCTS,
    secretaryConfig
  );
  assert.notEqual(secondReply.replyText, firstReply.replyText);
  assert.equal(secondReply.productCards, undefined);
});

test('continuous self-learning: learns currículo service and RD$ price from owner reply and answers naturally in another chat', () => {
  const secretaryConfig: BotConfig = {
    ...SAMPLE_CONFIG,
    assistantRole: 'secretaria',
    learnedKnowledge: [],
  };

  // Step 1: Rosa asks if we make a currículo; secretary doesn't know yet
  const unknownReply = generateDeterministicSalesReply(
    'Hola, ¿ustedes hacen currículo y en cuánto sale?',
    { ...SAMPLE_LEAD, name: 'Rosa Martínez' },
    SAMPLE_PRODUCTS,
    secretaryConfig
  );
  assert.equal(unknownReply.intent, 'consulta_nueva');
  assert.ok(unknownReply.replyText.includes('confirmarte'));

  // Step 2: Owner (Ezequiel) replies in Rosa's chat with the service and price in Dominican Pesos
  const learned = extractLearnedFactFromOwnerReply(
    ['Hola, ¿ustedes hacen currículo y en cuánto sale?'],
    'Sí claro Rosa, hacemos currículo profesional en 350 pesos.',
    'Rosa Martínez',
    '14:36'
  );
  assert.ok(learned);
  assert.equal(learned?.priceRd, 350);
  assert.equal(learned?.category, 'servicio');
  assert.ok(learned?.keywords.includes('curriculo'));
  assert.ok(learned?.keywords.includes('curriculum'));
  assert.ok(learned?.learnedFact.includes('RD$ 350'));

  // Step 3: Merge into bot config knowledge
  const updatedConfig: BotConfig = {
    ...secretaryConfig,
    learnedKnowledge: mergeLearnedFact(secretaryConfig.learnedKnowledge, learned!),
  };

  // Step 4: Later in a DIFFERENT chat, Pedro asks about curriculum / CV
  const secondChatReply = generateDeterministicSalesReply(
    'Buenas tardes, hacen curriculum vitae?',
    { ...SAMPLE_LEAD, id: 'lead-pedro', name: 'Pedro Almonte' },
    SAMPLE_PRODUCTS,
    updatedConfig
  );
  assert.equal(secondChatReply.intent, 'memoria_aprendida');
  assert.ok(secondChatReply.matchedLearnedFact);
  assert.ok(secondChatReply.replyText.includes('350'));
  assert.ok(secondChatReply.replyText.includes('Pedro'));
});

test('extractDominicanPrice parses RD$, pesos and numeric formats accurately', () => {
  assert.equal(extractDominicanPrice('Sí, sale en RD$ 1,200 instalado'), 1200);
  assert.equal(extractDominicanPrice('Cuesta 450 pesos dominicanos'), 450);
  assert.equal(extractDominicanPrice('Lo tenemos disponible por $2,850'), 2850);
});

test('shouldBotReplyToIncoming blocks outgoing user messages (fromMe) to clients and respects solo_resumen', () => {
  assert.equal(formatWhatsAppJid('+52 (55) 4829-1034'), '525548291034@s.whatsapp.net');

  // Outgoing message from user to a client MUST NEVER trigger a bot reply even if allowSelfChat is true
  assert.equal(
    shouldBotReplyToIncoming({
      remoteJid: '18296656282@s.whatsapp.net',
      resolvedPhoneDigits: '18296656282',
      myPhoneDigits: '18094988003',
      fromMe: true,
      text: 'Hola hermano, ya voy para allá',
      ignoreGroups: true,
      onlyWhitelist: false,
      whitelistPhones: [],
      allowSelfChat: true,
      globalBotAutoReply: true,
      leadBotActive: true,
    }),
    false
  );

  // Silent summary mode (solo_resumen) must never auto-reply
  assert.equal(
    shouldBotReplyToIncoming({
      remoteJid: '18296656282@s.whatsapp.net',
      resolvedPhoneDigits: '18296656282',
      fromMe: false,
      text: 'Hola, estás disponible?',
      ignoreGroups: true,
      onlyWhitelist: false,
      whitelistPhones: [],
      globalBotAutoReply: true,
      leadBotActive: true,
      assistantRole: 'solo_resumen',
    }),
    false
  );

  // Block status broadcast and groups
  assert.equal(
    shouldBotReplyToIncoming({
      remoteJid: 'status@broadcast',
      fromMe: false,
      text: 'Hola',
      ignoreGroups: true,
      onlyWhitelist: false,
      whitelistPhones: [],
    }),
    false
  );
  assert.equal(
    shouldBotReplyToIncoming({
      remoteJid: '12036304@g.us',
      fromMe: false,
      text: 'Hola grupo',
      ignoreGroups: true,
      onlyWhitelist: false,
      whitelistPhones: [],
    }),
    false
  );
});

test('summarizeConversationHeuristic extracts accurate priority and action item', () => {
  const urgentLead: CustomerLead = {
    ...SAMPLE_LEAD,
    messages: [
      {
        id: 'u1',
        sender: 'customer',
        text: 'Urgente Ezequiel, tenemos un problema con el sistema de facturación, llámame apenas puedas',
        timestamp: '11:00',
        status: 'read',
      },
    ],
  };
  const summary = summarizeConversationHeuristic(urgentLead, SAMPLE_CONFIG);
  assert.equal(summary.priority, 'alta');
  assert.equal(summary.category, 'urgente');
  assert.ok(summary.summary.includes('Carlos'));
});

test('extractWhatsAppMessageText unwraps ephemeral messages and formatPhoneDisplay formats DR/NANP numbers', () => {
  assert.equal(formatPhoneDisplay('18094988003'), '+1 (809) 498-8003');
  assert.equal(detectCountryOrCityFromPhone('18296656282'), 'República Dominicana');

  const ephemeralWrapped = {
    ephemeralMessage: {
      message: {
        extendedTextMessage: {
          text: 'Hola, qué precio tienen los auriculares?',
        },
      },
    },
  };
  assert.equal(
    extractWhatsAppMessageText(ephemeralWrapped),
    'Hola, qué precio tienen los auriculares?'
  );
});




