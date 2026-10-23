export type LeadStage =
  | 'nuevo'
  | 'interesado'
  | 'cotizado'
  | 'negociacion'
  | 'pagado';

export type ProductVisualType =
  | 'headphones'
  | 'smartwatch'
  | 'espresso'
  | 'keyboard'
  | 'speaker'
  | 'backpack';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: 'Audio' | 'Wearables' | 'Hogar' | 'Accesorios';
  price: number;
  originalPrice?: number;
  stock: number;
  description: string;
  highlights: string[];
  visualType: ProductVisualType;
  warrantyMonths: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  sku: string;
}

export interface OrderSummaryData {
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount: number;
  shippingCost: number;
  total: number;
  paymentMethod: string;
  estimatedDelivery: string;
  status: 'pendiente' | 'confirmado' | 'pagado';
}

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'agent';
  text: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  productCards?: Product[];
  orderSummary?: OrderSummaryData;
  quickReplies?: string[];
  intentTag?: string;
}

export interface CustomerLead {
  id: string;
  jid?: string;
  isRealWhatsApp?: boolean;
  lastTimestampMs?: number;
  name: string;
  phone: string;
  city: string;
  avatarInitials: string;
  avatarColor: string;
  stage: LeadStage;
  unreadCount: number;
  lastActivity: string;
  botActive: boolean;
  tags: string[];
  notes: string;
  cart: CartItem[];
  appliedCoupon?: string;
  aiSummary?: string;
  aiActionItem?: string;
  aiPriority?: 'alta' | 'media' | 'baja';
  aiCategory?: 'negocio' | 'personal' | 'ventas' | 'soporte';
  humanTakeoverAt?: number;
  messages: ChatMessage[];
}

export interface AutomatedRule {
  id: string;
  name: string;
  triggerKeywords: string[];
  actionDescription: string;
  responseTemplate: string;
  attachCatalog: boolean;
  enabled: boolean;
}

export interface LearnedFact {
  id: string;
  category: 'servicio' | 'precio_articulo' | 'politica' | 'otro';
  keywords: string[];
  questionSummary: string;
  learnedFact: string;
  priceRd?: number;
  learnedFromChat?: string;
  learnedAt: string;
}

export interface BotConfig {
  businessName: string;
  ownerName?: string;
  agentName: string;
  assistantRole?: 'secretaria' | 'solo_resumen' | 'ventas';
  secretaryInstructions?: string;
  tone: 'consultivo' | 'persuasivo' | 'directo';
  currencySymbol: string;
  freeShippingThreshold: number;
  flatShippingCost: number;
  activeCouponCode: string;
  couponDiscountPercent: number;
  paymentMethods: string[];
  welcomeMessage: string;
  objectionDiscountOffer: string;
  responseDelayMs: number;
  autoSendProductCards: boolean;
  autoQualifyLeadStage: boolean;
  rules: AutomatedRule[];
  learnedKnowledge?: LearnedFact[];
}

