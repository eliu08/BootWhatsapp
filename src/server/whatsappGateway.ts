import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_BOT_CONFIG, INITIAL_PRODUCTS } from '../data/initialData';
import {
  BotConfig,
  ChatMessage,
  CustomerLead,
  LeadStage,
  LearnedFact,
  OrderSummaryData,
  Product,
} from '../types/sales';
import {
  buildWaMeDirectLink,
  detectCountryOrCityFromPhone,
  extractLearnedFactFromOwnerReply,
  extractWhatsAppMessageText,
  formatOrderReceiptForRealWhatsApp,
  formatPhoneDisplay,
  formatProductCardForRealWhatsApp,
  formatWhatsAppJid,
  generateDeterministicSalesReply,
  mergeLearnedFact,
  sanitizePhoneDigits,
  shouldBotReplyToIncoming,
  summarizeConversationHeuristic,
} from '../utils/salesEngine';

export interface SafetyConfig {
  ignoreGroups: boolean;
  onlyWhitelist: boolean;
  whitelistPhones: string[];
  allowSelfChat: boolean;
  globalBotAutoReply: boolean;
  metaVerifyToken: string;
  metaPhoneNumberId: string;
}

export interface LiveWhatsAppEvent {
  id: string;
  phone: string;
  name: string;
  sender: 'customer' | 'bot' | 'agent';
  text: string;
  timestamp: string;
  productCards?: Product[];
  orderSummary?: OrderSummaryData;
  intentTag?: string;
}

const CURRENT_WA_WEB_VERSION: [number, number, number] = [2, 3000, 1051224291];

const AVATAR_PALETTE = [
  '#008069',
  '#0f766e',
  '#0369a1',
  '#1d4ed8',
  '#4338ca',
  '#6d28d9',
  '#be185d',
  '#b45309',
];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function getInitials(name: string, fallbackDigits: string): string {
  if (
    !name ||
    name.startsWith('WhatsApp ') ||
    name.startsWith('Cliente ') ||
    name.startsWith('+')
  ) {
    return fallbackDigits.slice(-2) || 'WA';
  }
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (cleaned && !/^\d+$/.test(cleaned.replace(/\s+/g, ''))) {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  }
  return fallbackDigits.slice(-2) || 'WA';
}

function isGenericPlaceholderName(name?: string): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  return (
    !trimmed ||
    trimmed.startsWith('WhatsApp ') ||
    trimmed.startsWith('Cliente ') ||
    trimmed.startsWith('+') ||
    /^\d+$/.test(trimmed.replace(/\D/g, '')) && trimmed.length === trimmed.replace(/[A-Za-z]/g, '').length
  );
}

class WhatsAppProductionGateway {
  public connectionState:
    | 'disconnected'
    | 'connecting'
    | 'qr_ready'
    | 'connected'
    | 'error' = 'disconnected';
  public qrDataUrl: string | null = null;
  public pairingCode: string | null = null;
  public connectedPhone: string | null = null;
  public connectedName: string | null = null;
  public lastError: string | null = null;
  public statusDetail: string = 'Listo para vincular';
  public totalBotRepliesSent = 0;
  public executiveBriefing: string = '';

  public products: Product[] = [...INITIAL_PRODUCTS];
  public botConfig: BotConfig = { ...INITIAL_BOT_CONFIG };
  public safetyConfig: SafetyConfig = {
    ignoreGroups: true,
    onlyWhitelist: false,
    whitelistPhones: ['+52 55 4829 1034'],
    allowSelfChat: false,
    globalBotAutoReply: true,
    metaVerifyToken: 'whatsventas_verify_2026',
    metaPhoneNumberId: '',
  };

  private sock: WASocket | null = null;
  private authDir = '/tmp/whatsventas_baileys_auth';
  private backupAuthDir = path.resolve(process.cwd(), '.whatsapp_auth_backup');
  private persistedLeadsPath = path.resolve(process.cwd(), '.whatsapp_state.json');
  private legacyTmpLeadsPath = '/tmp/whatsventas_real_leads_v2.json';

  private liveEvents: LiveWhatsAppEvent[] = [];
  private realLeadsMap = new Map<string, CustomerLead>();
  private lidToPhoneMap = new Map<string, string>();
  private phoneToLidMap = new Map<string, string>();
  private contactNamesMap = new Map<string, string>();
  private processedMsgIds = new Set<string>();
  private sentBySystemTexts = new Set<string>();

  private isManualDisconnect = false;
  private initialized = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedWaVersion: [number, number, number] = CURRENT_WA_WEB_VERSION;

  constructor() {
    // Keep constructor side-effect free so `vite build` never hangs on open sockets/timers
  }

  public ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;

    fetchLatestWaWebVersion()
      .then((res) => {
        if (res?.version) {
          this.cachedWaVersion = res.version;
        }
      })
      .catch(() => {});

    this.restoreBackupIfNeeded();
    this.loadPersistedRealLeads();
    this.hydrateLidMappingsFromAuthDir();

    if (this.hasSavedCredentials() && this.connectionState === 'disconnected') {
      setTimeout(() => {
        this.startConnection(undefined, false);
      }, 150);
    }
  }

  private hasSavedCredentials(): boolean {
    try {
      const credsPath = path.join(this.authDir, 'creds.json');
      if (!fs.existsSync(credsPath)) return false;
      const stat = fs.statSync(credsPath);
      return stat.size > 200;
    } catch {
      return false;
    }
  }

  private restoreBackupIfNeeded(): void {
    try {
      const credsPath = path.join(this.authDir, 'creds.json');
      const backupCredsPath = path.join(this.backupAuthDir, 'creds.json');
      if (!fs.existsSync(credsPath) && fs.existsSync(backupCredsPath)) {
        fs.cpSync(this.backupAuthDir, this.authDir, {
          recursive: true,
          force: true,
        });
      }
    } catch {
      // ignore
    }
  }

  private backupCurrentAuthDir(): void {
    try {
      const credsPath = path.join(this.authDir, 'creds.json');
      if (fs.existsSync(credsPath)) {
        fs.cpSync(this.authDir, this.backupAuthDir, {
          recursive: true,
          force: true,
        });
      }
    } catch {
      // ignore
    }
  }

  private loadPersistedRealLeads(): void {
    try {
      const targetPath = fs.existsSync(this.persistedLeadsPath)
        ? this.persistedLeadsPath
        : fs.existsSync(this.legacyTmpLeadsPath)
        ? this.legacyTmpLeadsPath
        : '';

      if (!targetPath) return;

      const raw = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      const leadsArray: CustomerLead[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.leads)
        ? raw.leads
        : [];

      if (raw?.contactNames && typeof raw.contactNames === 'object') {
        for (const [k, v] of Object.entries(raw.contactNames)) {
          if (typeof v === 'string' && v.trim()) {
            this.contactNamesMap.set(k, v.trim());
          }
        }
      }

      if (typeof raw?.executiveBriefing === 'string') {
        this.executiveBriefing = raw.executiveBriefing;
      }

      if (Array.isArray(raw?.learnedKnowledge) && raw.learnedKnowledge.length > 0) {
        let merged = [...(this.botConfig.learnedKnowledge || [])];
        for (const fact of raw.learnedKnowledge) {
          if (fact && fact.learnedFact && Array.isArray(fact.keywords)) {
            merged = mergeLearnedFact(merged, fact);
          }
        }
        this.botConfig.learnedKnowledge = merged;
      }

      for (const item of leadsArray) {
        if (!item || !item.id) continue;
        // Filter out legacy empty placeholder leads created from tctoken files that had no real messages
        const realMsgs = (item.messages || []).filter(
          (m) => !m.id.startsWith('wa-init-')
        );
        const hasRealName = !isGenericPlaceholderName(item.name);
        if (realMsgs.length === 0 && !hasRealName) {
          continue;
        }

        const key = sanitizePhoneDigits(item.phone) || item.id;
        if (hasRealName) {
          this.contactNamesMap.set(key, item.name);
        }
        item.messages = realMsgs.map((m) =>
          m.sender === 'bot'
            ? {
                ...m,
                text: m.text
                  .replace('Antes $239, ahora *$189*', 'Antes RD$ 4,200, ahora *RD$ 3,450*')
                  .replace('Anótado', 'Anotado'),
              }
            : m
        );
        if (Array.isArray(item.cart)) {
          item.cart = item.cart.filter((c) => c.price >= 500);
        }
        if (realMsgs.length > 0) {
          const heur = summarizeConversationHeuristic(item, this.botConfig);
          item.aiSummary = heur.summary;
          item.aiActionItem = heur.actionItem;
          item.aiPriority = heur.priority;
          item.aiCategory = heur.category as any;
        }
        this.realLeadsMap.set(key, item);
      }
    } catch {
      // ignore
    }
  }

  private schedulePersistRealLeads(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      try {
        const list = this.getSortedRealLeads(100);
        const contactNamesObj: Record<string, string> = {};
        for (const [k, v] of this.contactNamesMap.entries()) {
          contactNamesObj[k] = v;
        }
        const payload = {
          updatedAt: Date.now(),
          executiveBriefing: this.executiveBriefing,
          learnedKnowledge: this.botConfig.learnedKnowledge || [],
          contactNames: contactNamesObj,
          leads: list,
        };
        fs.writeFileSync(
          this.persistedLeadsPath,
          JSON.stringify(payload, null, 2),
          'utf8'
        );
      } catch {
        // ignore
      }
    }, 400);
  }

  public learnFromOwnerReplySync(
    lead: CustomerLead,
    ownerReplyText: string
  ): LearnedFact | null {
    const customerMessages = (lead.messages || [])
      .filter((m) => m.sender === 'customer' && !m.id.startsWith('wa-init-'))
      .slice(-4)
      .map((m) => m.text);

    const extracted = extractLearnedFactFromOwnerReply(
      customerMessages,
      ownerReplyText,
      lead.name || lead.phone,
      this.getTimeStr()
    );
    if (!extracted) return null;

    this.botConfig.learnedKnowledge = mergeLearnedFact(
      this.botConfig.learnedKnowledge || [],
      extracted
    );
    this.schedulePersistRealLeads();
    return extracted;
  }

  private formatTimestampFromMs(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (isToday) {
      return `${hh}:${mm}`;
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mo} ${hh}:${mm}`;
  }

  private getTimeStr(): string {
    return this.formatTimestampFromMs(Date.now());
  }

  /**
   * Reads creds.json for the connected profile and indexes lid-mapping-*_reverse.json files
   * so @lid JIDs resolve to real phone numbers. Does NOT create fake placeholder chats from tctokens.
   */
  public hydrateLidMappingsFromAuthDir(): void {
    try {
      if (!fs.existsSync(this.authDir)) return;
      const files = fs.readdirSync(this.authDir);

      const credsFile = path.join(this.authDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
          if (creds?.me?.id) {
            const myPhoneDigits = sanitizePhoneDigits(
              creds.me.id.split(':')[0].split('@')[0]
            );
            if (myPhoneDigits) {
              this.connectedPhone = myPhoneDigits;
            }
          }
          if (creds?.me?.name) {
            this.connectedName = creds.me.name;
          }
        } catch {
          // ignore
        }
      }

      for (const f of files) {
        if (f.startsWith('lid-mapping-') && f.endsWith('_reverse.json')) {
          const lid = f
            .replace('lid-mapping-', '')
            .replace('_reverse.json', '');
          const revFile = path.join(this.authDir, f);
          try {
            const raw = JSON.parse(fs.readFileSync(revFile, 'utf8'));
            const phoneDigits = sanitizePhoneDigits(String(raw));
            if (phoneDigits && lid) {
              this.lidToPhoneMap.set(lid, phoneDigits);
              this.phoneToLidMap.set(phoneDigits, lid);
              // If we stored a contact name under the LID, copy it to phoneDigits
              const lidName = this.contactNamesMap.get(lid);
              if (lidName && !this.contactNamesMap.has(phoneDigits)) {
                this.contactNamesMap.set(phoneDigits, lidName);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.warn('Error hydrating LID mappings:', err);
    }
  }

  private resolvePhoneFromJid(
    remoteJid: string,
    remoteJidAlt?: string
  ): { phoneDigits: string; lid?: string; targetJid: string } {
    const cleanMain = (remoteJid || '').split(':')[0];
    const cleanAlt = (remoteJidAlt || '').split(':')[0];

    if (cleanAlt.endsWith('@s.whatsapp.net')) {
      const phoneDigits = sanitizePhoneDigits(cleanAlt.split('@')[0]);
      const lid = cleanMain.endsWith('@lid')
        ? cleanMain.split('@')[0]
        : undefined;
      if (lid && phoneDigits) {
        this.lidToPhoneMap.set(lid, phoneDigits);
        this.phoneToLidMap.set(phoneDigits, lid);
      }
      return {
        phoneDigits,
        lid,
        targetJid: `${phoneDigits}@s.whatsapp.net`,
      };
    }

    if (cleanMain.endsWith('@lid')) {
      const lid = cleanMain.split('@')[0];
      let phoneDigits = this.lidToPhoneMap.get(lid) || '';
      if (!phoneDigits) {
        const revPath = path.join(
          this.authDir,
          `lid-mapping-${lid}_reverse.json`
        );
        if (fs.existsSync(revPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(revPath, 'utf8'));
            phoneDigits = sanitizePhoneDigits(String(raw));
            if (phoneDigits) {
              this.lidToPhoneMap.set(lid, phoneDigits);
              this.phoneToLidMap.set(phoneDigits, lid);
            }
          } catch {
            // ignore
          }
        }
      }
      if (phoneDigits) {
        return {
          phoneDigits,
          lid,
          targetJid: `${phoneDigits}@s.whatsapp.net`,
        };
      }
      return {
        phoneDigits: lid,
        lid,
        targetJid: `${lid}@lid`,
      };
    }

    const phoneDigits = sanitizePhoneDigits(cleanMain.split('@')[0]);
    const lid = this.phoneToLidMap.get(phoneDigits);
    return {
      phoneDigits,
      lid,
      targetJid: phoneDigits ? `${phoneDigits}@s.whatsapp.net` : cleanMain,
    };
  }

  private indexContactName(
    idOrJid?: string,
    lidOrAlt?: string,
    rawName?: string
  ): void {
    const cleanName = (rawName || '').trim();
    if (!cleanName || isGenericPlaceholderName(cleanName)) return;

    const resolved = this.resolvePhoneFromJid(idOrJid || '', lidOrAlt || '');
    if (resolved.phoneDigits) {
      this.contactNamesMap.set(resolved.phoneDigits, cleanName);
      const existing = this.realLeadsMap.get(resolved.phoneDigits);
      if (existing && isGenericPlaceholderName(existing.name)) {
        existing.name = cleanName;
        existing.avatarInitials = getInitials(cleanName, resolved.phoneDigits);
      }
    }
    if (resolved.lid) {
      this.contactNamesMap.set(resolved.lid, cleanName);
      const existingByLid = this.realLeadsMap.get(resolved.lid);
      if (existingByLid && isGenericPlaceholderName(existingByLid.name)) {
        existingByLid.name = cleanName;
        existingByLid.avatarInitials = getInitials(cleanName, resolved.lid);
      }
    }
  }

  private ensureRealLead(
    phoneDigits: string,
    opts?: {
      pushName?: string;
      lid?: string;
      timestampMs?: number;
    }
  ): CustomerLead {
    const cleanDigits = sanitizePhoneDigits(phoneDigits);
    const existing = this.realLeadsMap.get(cleanDigits);
    const formattedPhone = formatPhoneDisplay(cleanDigits);

    const candidatePushName =
      opts?.pushName && !isGenericPlaceholderName(opts.pushName)
        ? opts.pushName.trim()
        : undefined;

    const knownContactName =
      candidatePushName ||
      this.contactNamesMap.get(cleanDigits) ||
      (opts?.lid ? this.contactNamesMap.get(opts.lid) : undefined);

    if (knownContactName && !isGenericPlaceholderName(knownContactName)) {
      this.contactNamesMap.set(cleanDigits, knownContactName);
      if (opts?.lid) {
        this.contactNamesMap.set(opts.lid, knownContactName);
      }
    }

    const displayName =
      knownContactName ||
      (existing && !isGenericPlaceholderName(existing.name)
        ? existing.name
        : formattedPhone);

    const tsMs = opts?.timestampMs || existing?.lastTimestampMs || Date.now();
    const timeStr = this.formatTimestampFromMs(tsMs);

    if (existing) {
      if (knownContactName && isGenericPlaceholderName(existing.name)) {
        existing.name = knownContactName;
      }
      existing.avatarInitials = getInitials(existing.name, cleanDigits);
      if (opts?.timestampMs && opts.timestampMs > (existing.lastTimestampMs || 0)) {
        existing.lastTimestampMs = opts.timestampMs;
        existing.lastActivity = timeStr;
      }
      if (!existing.jid) {
        existing.jid = `${cleanDigits}@s.whatsapp.net`;
      }
      existing.isRealWhatsApp = true;
      return existing;
    }

    const countryOrCity = detectCountryOrCityFromPhone(cleanDigits);

    const newLead: CustomerLead = {
      id: `wa-real-${cleanDigits}`,
      jid: `${cleanDigits}@s.whatsapp.net`,
      isRealWhatsApp: true,
      lastTimestampMs: tsMs,
      name: displayName,
      phone: formattedPhone,
      city: countryOrCity,
      avatarInitials: getInitials(displayName, cleanDigits),
      avatarColor: pickAvatarColor(cleanDigits),
      stage: 'interesado',
      unreadCount: 0,
      lastActivity: timeStr,
      botActive: true,
      tags: ['WhatsApp Real'],
      notes: '',
      aiSummary: 'Conversación sincronizada desde tu WhatsApp.',
      aiActionItem: 'Sin pendientes urgentes.',
      aiPriority: 'baja',
      aiCategory: 'informativo',
      cart: [],
      messages: [],
    };

    this.realLeadsMap.set(cleanDigits, newLead);
    return newLead;
  }

  private appendMessageToRealLead(
    phoneDigits: string,
    msg: ChatMessage,
    opts?: {
      pushName?: string;
      lid?: string;
      timestampMs?: number;
      incrementUnread?: boolean;
      updatedCart?: CustomerLead['cart'];
      updatedStage?: LeadStage;
      appliedCoupon?: string;
      aiSummary?: string;
      aiActionItem?: string;
      aiPriority?: CustomerLead['aiPriority'];
      aiCategory?: CustomerLead['aiCategory'];
    }
  ): CustomerLead {
    const lead = this.ensureRealLead(phoneDigits, {
      pushName: opts?.pushName,
      lid: opts?.lid,
      timestampMs: opts?.timestampMs || Date.now(),
    });

    const filteredMessages = lead.messages.filter(
      (m) => !m.id.startsWith('wa-init-')
    );

    if (!filteredMessages.some((m) => m.id === msg.id)) {
      filteredMessages.push(msg);
    }

    lead.messages = filteredMessages.slice(-80);
    lead.lastActivity = msg.timestamp;
    lead.lastTimestampMs = Math.max(
      lead.lastTimestampMs || 0,
      opts?.timestampMs || Date.now()
    );

    if (opts?.incrementUnread) {
      lead.unreadCount = (lead.unreadCount || 0) + 1;
    }
    if (opts?.updatedCart) {
      lead.cart = opts.updatedCart;
    }
    if (opts?.updatedStage) {
      lead.stage = opts.updatedStage;
    }
    if (opts?.appliedCoupon !== undefined) {
      lead.appliedCoupon = opts.appliedCoupon;
    }

    // Update executive summary either from explicit AI fields or heuristic
    if (opts?.aiSummary) {
      lead.aiSummary = opts.aiSummary;
      lead.aiActionItem = opts.aiActionItem || lead.aiActionItem;
      lead.aiPriority = opts.aiPriority || lead.aiPriority;
      lead.aiCategory = opts.aiCategory || lead.aiCategory;
    } else {
      const heur = summarizeConversationHeuristic(lead, this.botConfig);
      lead.aiSummary = heur.summary;
      lead.aiActionItem = heur.actionItem;
      lead.aiPriority = heur.priority;
      lead.aiCategory = heur.category;
    }

    this.realLeadsMap.set(sanitizePhoneDigits(phoneDigits), lead);
    this.schedulePersistRealLeads();
    return lead;
  }

  public getSortedRealLeads(limit = 65): CustomerLead[] {
    return Array.from(this.realLeadsMap.values())
      .filter((lead) => {
        const realMsgs = (lead.messages || []).filter(
          (m) => !m.id.startsWith('wa-init-')
        );
        return realMsgs.length > 0 || !isGenericPlaceholderName(lead.name);
      })
      .sort((a, b) => (b.lastTimestampMs || 0) - (a.lastTimestampMs || 0))
      .slice(0, limit);
  }

  public drainEvents(): LiveWhatsAppEvent[] {
    const copy = [...this.liveEvents];
    this.liveEvents = [];
    return copy;
  }

  public async startConnection(
    pairingPhone?: string,
    forceFresh = false
  ): Promise<void> {
    this.isManualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.removeAllListeners('messaging-history.set');
        this.sock.ev.removeAllListeners('chats.upsert');
        this.sock.ev.removeAllListeners('contacts.upsert');
        this.sock.ev.removeAllListeners('contacts.update');
        this.sock.end(undefined);
      } catch {
        // ignore cleanup error
      }
      this.sock = null;
    }

    if (forceFresh && !this.hasSavedCredentials()) {
      this.resetAuthDir();
    }

    this.connectionState = 'connecting';
    this.lastError = null;
    this.statusDetail = 'Conectando y sincronizando tus chats de WhatsApp...';

    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      const sock = makeWASocket({
        version: this.cachedWaVersion,
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: true,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 20000,
        markOnlineOnConnect: false,
      });

      this.sock = sock;

      sock.ev.on('creds.update', async () => {
        await saveCreds();
        this.backupCurrentAuthDir();
        this.hydrateLidMappingsFromAuthDir();
      });

      // Full history sync from phone: index all contact names first, then chats, then real messages
      sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
        this.hydrateLidMappingsFromAuthDir();

        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            const label = c.name || c.notify || c.verifiedName;
            if (!label) continue;
            this.indexContactName(c.id, (c as any).lid, label);
          }
        }

        if (Array.isArray(chats)) {
          for (const chat of chats) {
            if (
              !chat.id ||
              chat.id.endsWith('@g.us') ||
              chat.id.endsWith('@broadcast') ||
              chat.id.endsWith('@newsletter')
            ) {
              continue;
            }
            const chatLabel =
              chat.name || (chat as any).displayName || (chat as any).notify;
            if (chatLabel) {
              this.indexContactName(chat.id, (chat as any).lid, chatLabel);
            }
            const resolved = this.resolvePhoneFromJid(
              chat.id,
              (chat as any).lid
            );
            if (
              !resolved.phoneDigits ||
              resolved.phoneDigits === this.connectedPhone
            ) {
              continue;
            }
            // Only create chat entry if it has a real name or unread count or conversation timestamp
            const tsMs = chat.conversationTimestamp
              ? Number(chat.conversationTimestamp) * 1000
              : 0;
            if (chatLabel || (chat.unreadCount && chat.unreadCount > 0)) {
              const lead = this.ensureRealLead(resolved.phoneDigits, {
                pushName: chatLabel || undefined,
                lid: resolved.lid,
                timestampMs: tsMs || Date.now(),
              });
              if (typeof chat.unreadCount === 'number' && chat.unreadCount > 0) {
                lead.unreadCount = chat.unreadCount;
              }
            }
          }
        }

        if (Array.isArray(messages)) {
          const sortedMsgs = [...messages].sort((a, b) => {
            const ta = Number(a?.messageTimestamp || 0);
            const tb = Number(b?.messageTimestamp || 0);
            return ta - tb;
          });
          for (const m of sortedMsgs.slice(-250)) {
            this.ingestIncomingOrSyncedMessage(m, false);
          }
        }

        this.schedulePersistRealLeads();
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts) {
          const label = c.name || c.notify || c.verifiedName;
          if (!label) continue;
          this.indexContactName(c.id, (c as any).lid, label);
        }
        this.schedulePersistRealLeads();
      });

      sock.ev.on('contacts.update', (updates) => {
        for (const c of updates) {
          if (!c.id) continue;
          const label = c.name || c.notify || c.verifiedName;
          if (!label) continue;
          this.indexContactName(c.id, (c as any).lid, label);
        }
        this.schedulePersistRealLeads();
      });

      sock.ev.on('chats.upsert', (chats) => {
        for (const chat of chats) {
          if (
            !chat.id ||
            chat.id.endsWith('@g.us') ||
            chat.id.endsWith('@broadcast') ||
            chat.id.endsWith('@newsletter')
          ) {
            continue;
          }
          const chatLabel =
            chat.name || (chat as any).displayName || (chat as any).notify;
          if (chatLabel) {
            this.indexContactName(chat.id, (chat as any).lid, chatLabel);
          }
        }
        this.schedulePersistRealLeads();
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.connectionState = 'qr_ready';
          this.lastError = null;
          this.statusDetail =
            'Escanea este código QR desde WhatsApp > Dispositivos vinculados';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, {
              width: 280,
              margin: 2,
              color: {
                dark: '#0f172a',
                light: '#ffffff',
              },
            });
          } catch (err) {
            console.warn('QR encode error:', err);
          }

          if (pairingPhone && !this.pairingCode) {
            const cleanDigits = sanitizePhoneDigits(pairingPhone);
            if (cleanDigits.length >= 8) {
              try {
                const code = await sock.requestPairingCode(cleanDigits);
                this.pairingCode = code;
                this.statusDetail = `Ingresa el código ${code} en la notificación de tu WhatsApp`;
              } catch (err: any) {
                this.lastError =
                  err?.message || 'No se pudo generar código de vinculación.';
              }
            }
          }
        }

        if (connection === 'open') {
          this.connectionState = 'connected';
          this.qrDataUrl = null;
          this.pairingCode = null;
          this.lastError = null;
          const rawId = sock.user?.id || '';
          this.connectedPhone =
            sanitizePhoneDigits(rawId.split(':')[0].split('@')[0]) ||
            this.connectedPhone ||
            'Conectado';
          this.connectedName =
            sock.user?.name ||
            this.connectedName ||
            this.botConfig.businessName;
          this.backupCurrentAuthDir();
          this.hydrateLidMappingsFromAuthDir();
          this.statusDetail = `Conectado en vivo: ${this.connectedName} (${formatPhoneDisplay(
            this.connectedPhone
          )}) · Secretaria IA Activa`;
        }

        if (connection === 'close') {
          if (this.isManualDisconnect) {
            this.connectionState = 'disconnected';
            this.statusDetail = 'Sesión desconectada manualmente.';
            return;
          }

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isBadSession =
            statusCode === DisconnectReason.badSession || statusCode === 405;

          if (isLoggedOut || isBadSession) {
            this.resetAuthDir();
            this.connectedPhone = null;
            this.connectedName = null;
            this.qrDataUrl = null;
            this.pairingCode = null;
            this.connectionState = 'connecting';
            this.statusDetail =
              'Renovando sesión limpia y generando nuevo código QR...';
            this.reconnectTimer = setTimeout(() => {
              this.startConnection(undefined, false);
            }, 600);
            return;
          }

          this.connectionState = 'connecting';
          this.qrDataUrl = null;
          this.lastError = null;
          this.statusDetail =
            statusCode === DisconnectReason.restartRequired
              ? '¡QR escaneado! Finalizando sincronización con tu WhatsApp...'
              : 'Sincronizando canal en vivo con WhatsApp Web...';

          this.reconnectTimer = setTimeout(() => {
            this.startConnection(undefined, false);
          }, 400);
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const isLiveNotify = type === 'notify';
        for (const msg of messages) {
          await this.ingestIncomingOrSyncedMessage(msg, isLiveNotify);
        }
      });
    } catch (err: any) {
      this.connectionState = 'error';
      this.lastError =
        err?.message || 'Error al inicializar el socket de WhatsApp Web.';
    }
  }

  private async ingestIncomingOrSyncedMessage(
    msg: any,
    triggerAutoBotReply: boolean
  ): Promise<void> {
    if (!msg || !msg.message || !msg.key) return;

    const msgId = msg.key.id || `wa-${Date.now()}-${Math.random()}`;
    if (this.processedMsgIds.has(msgId)) return;
    this.processedMsgIds.add(msgId);

    const remoteJid = msg.key.remoteJid || '';
    const remoteJidAlt = (msg.key as any).remoteJidAlt || '';
    if (
      !remoteJid ||
      remoteJid === 'status@broadcast' ||
      remoteJid.endsWith('@broadcast') ||
      remoteJid.endsWith('@newsletter')
    ) {
      return;
    }

    if (this.safetyConfig.ignoreGroups && remoteJid.endsWith('@g.us')) {
      return;
    }

    const text = extractWhatsAppMessageText(msg.message);
    if (!text) return;

    const fromMe = Boolean(msg.key.fromMe);
    const resolved = this.resolvePhoneFromJid(remoteJid, remoteJidAlt);
    const phoneDigits = resolved.phoneDigits;
    if (!phoneDigits) return;

    // Ignore echoes of messages that our own system/bot just dispatched
    if (fromMe && this.sentBySystemTexts.has(text.trim())) {
      this.sentBySystemTexts.delete(text.trim());
      return;
    }

    const msgTimestampMs = msg.messageTimestamp
      ? Number(msg.messageTimestamp) * 1000
      : Date.now();
    const timestamp = this.formatTimestampFromMs(msgTimestampMs);

    // Extract contact's real pushName when incoming (`!fromMe`)
    const pushName =
      !fromMe && msg.pushName && !isGenericPlaceholderName(String(msg.pushName))
        ? String(msg.pushName).trim()
        : undefined;

    if (pushName) {
      this.indexContactName(remoteJid, remoteJidAlt, pushName);
    }

    const senderRole: 'customer' | 'agent' = fromMe ? 'agent' : 'customer';

    const chatMsg: ChatMessage = {
      id: msgId,
      sender: senderRole,
      text,
      timestamp,
      status: 'read',
    };

    const lead = this.appendMessageToRealLead(phoneDigits, chatMsg, {
      pushName,
      lid: resolved.lid,
      timestampMs: msgTimestampMs,
      incrementUnread: !fromMe,
    });

    this.liveEvents.push({
      id: msgId,
      phone: lead.phone,
      name: lead.name,
      sender: senderRole,
      text,
      timestamp,
    });

    // Whenever the owner (`fromMe === true`) writes a message in any chat, automatically learn services/prices in RD$ from their reply!
    if (fromMe) {
      this.learnFromOwnerReplySync(lead, text);
    }

    if (!triggerAutoBotReply) return;

    // CRITICAL HUMAN-TAKEOVER PROTECTION:
    // If `fromMe === true` on a live message (meaning the user Ezequiel just wrote from his phone or WhatsApp Web to this contact),
    // NEVER send a bot reply! Also pause automatic bot replies on this chat so Ezequiel can converse freely without interruption.
    if (fromMe) {
      const isMyOwnSelfChat =
        Boolean(this.connectedPhone) && phoneDigits === this.connectedPhone;
      if (!isMyOwnSelfChat) {
        lead.botActive = false;
        lead.humanTakeoverAt = Date.now();
        this.realLeadsMap.set(sanitizePhoneDigits(phoneDigits), lead);
        this.schedulePersistRealLeads();
        return;
      }
    }

    const allowedToAutoReply = shouldBotReplyToIncoming({
      remoteJid,
      resolvedPhoneDigits: phoneDigits,
      myPhoneDigits: this.connectedPhone || undefined,
      fromMe,
      text,
      ignoreGroups: this.safetyConfig.ignoreGroups,
      onlyWhitelist: this.safetyConfig.onlyWhitelist,
      whitelistPhones: this.safetyConfig.whitelistPhones,
      allowSelfChat: this.safetyConfig.allowSelfChat,
      globalBotAutoReply: this.safetyConfig.globalBotAutoReply,
      leadBotActive: lead.botActive,
      assistantRole: this.botConfig.assistantRole || 'secretaria',
    });

    // Even if auto-reply is off (e.g. Solo Resumen mode or Manual mode), update the AI Executive Summary silently!
    if (!allowedToAutoReply) {
      await this.updateLeadExecutiveSummaryWithAi(lead);
      return;
    }

    await this.processAndReplyToRealCustomer(
      remoteJid,
      phoneDigits,
      lead.name,
      text
    );
  }

  public async updateLeadExecutiveSummaryWithAi(
    lead: CustomerLead
  ): Promise<CustomerLead> {
    const heur = summarizeConversationHeuristic(lead, this.botConfig);
    lead.aiSummary = heur.summary;
    lead.aiActionItem = heur.actionItem;
    lead.aiPriority = heur.priority;
    lead.aiCategory = heur.category;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      this.schedulePersistRealLeads();
      return lead;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });
      const historyLines = (lead.messages || [])
        .filter((m) => !m.id.startsWith('wa-init-'))
        .slice(-12)
        .map(
          (m) =>
            `${
              m.sender === 'customer'
                ? lead.name
                : m.sender === 'agent'
                ? this.botConfig.ownerName || 'Encargado'
                : this.botConfig.agentName
            } (${m.timestamp}): ${m.text}`
        )
        .join('\n');

      if (!historyLines) return lead;

      const aiRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Historial reciente de WhatsApp con ${lead.name} (${lead.phone}):\n${historyLines}`,
        config: {
          systemInstruction: `Eres la secretaria ejecutiva de ${
            this.botConfig.ownerName || 'el encargado'
          } en "${
            this.botConfig.businessName
          }". Analiza este chat de WhatsApp y genera un resumen ejecutivo claro (1 oración), la acción concreta pendiente para ${
            this.botConfig.ownerName || 'el encargado'
          }, su prioridad ('alta' | 'media' | 'baja') y categoría ('urgente' | 'cliente' | 'reunion' | 'cobro' | 'personal' | 'informativo').`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              actionItem: { type: Type.STRING },
              priority: { type: Type.STRING },
              category: { type: Type.STRING },
            },
            required: ['summary', 'actionItem', 'priority', 'category'],
          },
        },
      });

      const parsed = JSON.parse((aiRes.text || '{}').trim());
      if (parsed.summary) lead.aiSummary = parsed.summary;
      if (parsed.actionItem) lead.aiActionItem = parsed.actionItem;
      if (['alta', 'media', 'baja'].includes(parsed.priority)) {
        lead.aiPriority = parsed.priority;
      }
      if (
        [
          'urgente',
          'cliente',
          'reunion',
          'cobro',
          'personal',
          'informativo',
        ].includes(parsed.category)
      ) {
        lead.aiCategory = parsed.category;
      }
    } catch {
      // Keep heuristic summary
    }

    const cleanDigits = sanitizePhoneDigits(lead.phone);
    if (cleanDigits) {
      this.realLeadsMap.set(cleanDigits, lead);
    }
    this.schedulePersistRealLeads();
    return lead;
  }

  public async generateGlobalExecutiveBriefing(
    allLeads?: CustomerLead[]
  ): Promise<{ briefing: string; leads: CustomerLead[] }> {
    const targetLeads = (
      allLeads && allLeads.length > 0 ? allLeads : this.getSortedRealLeads(30)
    ).slice(0, 20);

    // Ensure every lead has at least a heuristic summary
    for (const l of targetLeads) {
      if (!l.aiSummary) {
        const heur = summarizeConversationHeuristic(l, this.botConfig);
        l.aiSummary = heur.summary;
        l.aiActionItem = heur.actionItem;
        l.aiPriority = heur.priority;
        l.aiCategory = heur.category;
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || targetLeads.length === 0) {
      const highCount = targetLeads.filter(
        (l) => l.aiPriority === 'alta'
      ).length;
      const fallbackBriefing = `Resumen de ${this.botConfig.agentName} para ${
        this.botConfig.ownerName || 'ti'
      }: Tienes ${targetLeads.length} conversaciones activas (${highCount} de prioridad alta/urgente). Revisa las tarjetas inferiores para ver qué necesita cada contacto sin tener que abrir cada chat.`;
      this.executiveBriefing = fallbackBriefing;
      return { briefing: fallbackBriefing, leads: targetLeads };
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const digestInput = targetLeads
        .map((l, idx) => {
          const lastMsgs = (l.messages || [])
            .filter((m) => !m.id.startsWith('wa-init-'))
            .slice(-4)
            .map((m) => `[${m.sender}]: ${m.text}`)
            .join(' | ');
          return `${idx + 1}. Contacto: ${l.name} (${l.phone}) - Últimos mensajes: ${lastMsgs}`;
        })
        .join('\n');

      const aiRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Conversaciones activas de WhatsApp:\n${digestInput}`,
        config: {
          systemInstruction: `Eres ${this.botConfig.agentName}, secretaria ejecutiva de ${
            this.botConfig.ownerName || 'el encargado'
          } en "${
            this.botConfig.businessName
          }". Redacta un informe ejecutivo breve, directo y muy útil (máximo 3-4 oraciones) resumiendo quiénes han escrito, cuáles son los temas más urgentes hoy y qué acciones requieren la atención de ${
            this.botConfig.ownerName || 'el encargado'
          }.`,
        },
      });

      if (aiRes.text && aiRes.text.trim()) {
        this.executiveBriefing = aiRes.text.trim();
      }
    } catch {
      // keep fallback
    }

    this.schedulePersistRealLeads();
    return { briefing: this.executiveBriefing, leads: targetLeads };
  }

  public async processAndReplyToRealCustomer(
    remoteJid: string,
    phoneDigits: string,
    pushName: string,
    customerText: string
  ): Promise<CustomerLead> {
    const cleanDigits = sanitizePhoneDigits(phoneDigits);
    const existingLead = this.ensureRealLead(cleanDigits, {
      pushName,
      timestampMs: Date.now(),
    });

    const reply = generateDeterministicSalesReply(
      customerText,
      existingLead,
      this.products,
      this.botConfig
    );

    let finalReplyText = reply.replyText;
    const heur = summarizeConversationHeuristic(existingLead, this.botConfig);
    let aiSummary = heur.summary;
    let aiActionItem = heur.actionItem;
    let aiPriority: CustomerLead['aiPriority'] = heur.priority;
    let aiCategory: CustomerLead['aiCategory'] = heur.category;

    const isSalesMode = this.botConfig.assistantRole === 'ventas';
    const ownerName = this.botConfig.ownerName || 'Ezequiel';

    // Multi-turn Gemini 3.8 Flash Secretary & Conversational Engine
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
          },
        });

        const recentHistory = (existingLead.messages || [])
          .filter((m) => !m.id.startsWith('wa-init-'))
          .slice(-12)
          .map(
            (m) =>
              `${
                m.sender === 'customer'
                  ? existingLead.name
                  : m.sender === 'agent'
                  ? ownerName
                  : this.botConfig.agentName
              }: ${m.text}`
          )
          .join('\n');

        const previousBotReplies = (existingLead.messages || [])
          .filter((m) => m.sender === 'bot' && !m.id.startsWith('wa-init-'))
          .slice(-3)
          .map((m) => m.text)
          .join(' | ');

        const catalogContext =
          `\nCatálogo de artículos y precios en Pesos Dominicanos (${this.botConfig.currencySymbol || 'RD$'}):\n` +
          this.products
            .map(
              (p) =>
                `- ${p.name}: ${this.botConfig.currencySymbol || 'RD$'} ${p.price.toLocaleString('en-US')}`
            )
            .join('\n');

        const learnedMemoryContext =
          (this.botConfig.learnedKnowledge || []).length > 0
            ? `\nMEMORIA APRENDIDA DE LAS RESPUESTAS DE ${ownerName.toUpperCase()} EN OTROS CHATS (Úsala con prioridad cuando pregunten por estos servicios, artículos o precios en RD$):\n` +
              (this.botConfig.learnedKnowledge || [])
                .map(
                  (f) =>
                    `- Tema/Palabras clave [${f.keywords.join(', ')}]: ${f.learnedFact}${
                      f.priceRd ? ` (Precio: RD$ ${f.priceRd.toLocaleString('en-US')})` : ''
                    }`
                )
                .join('\n')
            : '';

        const rolePrompt =
          this.botConfig.assistantRole === 'ventas'
            ? `Actúas como asesora comercial humana de "${this.botConfig.businessName}" en República Dominicana (moneda: Peso Dominicano RD$).`
            : `Actúas como ${this.botConfig.agentName}, la secretaria ejecutiva y asistente personal de ${ownerName} en "${this.botConfig.businessName}" (República Dominicana, moneda: Peso Dominicano RD$).`;

        const customInstructions = this.botConfig.secretaryInstructions
          ? `\nInstrucciones de ${ownerName}: ${this.botConfig.secretaryInstructions}`
          : '';

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Historial de la conversación en WhatsApp con ${existingLead.name} (${existingLead.phone}):\n${recentHistory}\n\nÚltimo mensaje recibido de ${existingLead.name}: "${customerText}"`,
          config: {
            systemInstruction: `${rolePrompt}${customInstructions}${learnedMemoryContext}${catalogContext}
REGLAS ESTRICTAS PARA RESPONDER EN WHATSAPP:
1. Escribe como una persona real dominicana/latina en WhatsApp: cálida, educada, natural y directa (MÁXIMO 1 a 2 oraciones cortas). Todos los precios son en Pesos Dominicanos (RD$).
2. Si preguntan por un servicio o artículo que está en la MEMORIA APRENDIDA DE LAS RESPUESTAS DE ${ownerName.toUpperCase()} o en el Catálogo, responde con naturalidad dando el dato y el precio exacto en RD$.
3. Si preguntan si hacemos un servicio o vendemos algo que NO está ni en la Memoria Aprendida ni en el Catálogo, di con amabilidad que se lo vas a confirmar ahora mismo con ${ownerName} para darle el precio exacto en RD$.
4. PROHIBIDO repetir saludos o frases que ya dijiste antes. Respuestas previas tuyas que NO debes repetir: [${previousBotReplies}].
5. PROHIBIDO enviar listas largas de catálogo o cupones a menos que la persona lo pida explícitamente.
6. Devuelve un JSON con tu respuesta (replyText) y el resumen ejecutivo actualizado para ${ownerName}.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                replyText: { type: Type.STRING },
                summary: { type: Type.STRING },
                actionItem: { type: Type.STRING },
                priority: { type: Type.STRING },
                category: { type: Type.STRING },
              },
              required: [
                'replyText',
                'summary',
                'actionItem',
                'priority',
                'category',
              ],
            },
          },
        });

        const parsed = JSON.parse((aiRes.text || '{}').trim());
        if (parsed.replyText && String(parsed.replyText).trim()) {
          finalReplyText = String(parsed.replyText).trim();
        }
        if (parsed.summary) aiSummary = String(parsed.summary).trim();
        if (parsed.actionItem) aiActionItem = String(parsed.actionItem).trim();
        if (['alta', 'media', 'baja'].includes(parsed.priority)) {
          aiPriority = parsed.priority;
        }
        if (
          [
            'urgente',
            'cliente',
            'reunion',
            'cobro',
            'personal',
            'informativo',
          ].includes(parsed.category)
        ) {
          aiCategory = parsed.category;
        }
      } catch {
        // Fallback to deterministic secretary reply seamlessly
      }
    }

    // NEVER append unsolicited product cards to real WhatsApp messages!
    // Only append order receipt if customer explicitly asked to confirm an order in sales mode.
    let fullOutboundText = finalReplyText;
    if (isSalesMode && reply.orderSummary && reply.intent === 'confirmar_pedido') {
      const receiptFormatted = formatOrderReceiptForRealWhatsApp(
        reply.orderSummary,
        this.botConfig
      );
      fullOutboundText = `${fullOutboundText}\n\n${receiptFormatted}`;
    }

    this.sentBySystemTexts.add(fullOutboundText.trim());
    await this.dispatchSocketMessage(remoteJid, cleanDigits, fullOutboundText);
    this.totalBotRepliesSent += 1;

    const timestamp = this.getTimeStr();
    const botMsgId = `wa-bot-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    this.processedMsgIds.add(botMsgId);

    const botMsg: ChatMessage = {
      id: botMsgId,
      sender: 'bot',
      text: finalReplyText,
      timestamp,
      status: 'read',
      productCards: isSalesMode ? reply.productCards : undefined,
      orderSummary: isSalesMode ? reply.orderSummary : undefined,
      quickReplies: reply.quickReplies,
      intentTag: reply.intent,
    };

    const updatedLead = this.appendMessageToRealLead(cleanDigits, botMsg, {
      timestampMs: Date.now(),
      updatedCart: reply.updatedCart,
      updatedStage: reply.updatedStage,
      appliedCoupon: reply.appliedCoupon,
      aiSummary,
      aiActionItem,
      aiPriority,
      aiCategory,
    });

    this.liveEvents.push({
      id: botMsgId,
      phone: updatedLead.phone,
      name: updatedLead.name,
      sender: 'bot',
      text: finalReplyText,
      timestamp,
      productCards: isSalesMode ? reply.productCards : undefined,
      orderSummary: isSalesMode ? reply.orderSummary : undefined,
      intentTag: reply.intent,
    });

    return updatedLead;
  }

  private async dispatchSocketMessage(
    preferredJid: string,
    phoneDigits: string,
    text: string
  ): Promise<boolean> {
    if (!this.sock || this.connectionState !== 'connected') {
      return false;
    }

    const candidates: string[] = [];
    if (preferredJid && preferredJid.includes('@')) {
      candidates.push(preferredJid);
    }
    if (phoneDigits) {
      const sNet = `${phoneDigits}@s.whatsapp.net`;
      if (!candidates.includes(sNet)) candidates.push(sNet);
      const lid = this.phoneToLidMap.get(phoneDigits);
      if (lid) {
        const lidJid = `${lid}@lid`;
        if (!candidates.includes(lidJid)) candidates.push(lidJid);
      }
    }

    for (const targetJid of candidates) {
      try {
        await this.sock.sendMessage(targetJid, { text });
        return true;
      } catch (err) {
        console.warn(`Failed sending to ${targetJid}, trying fallback...`, err);
      }
    }
    return false;
  }

  public async sendDirectMessage(
    phone: string,
    text: string,
    opts?: {
      jid?: string;
      senderRole?: 'agent' | 'bot';
      productCards?: Product[];
      orderSummary?: OrderSummaryData;
      intentTag?: string;
    }
  ): Promise<{ sentViaSocket: boolean; waMeUrl: string; lead?: CustomerLead }> {
    const waMeUrl = buildWaMeDirectLink(phone, text);
    const cleanDigits = sanitizePhoneDigits(phone);
    const targetJid = opts?.jid || formatWhatsAppJid(cleanDigits);

    this.sentBySystemTexts.add((text || '').trim());
    const sentViaSocket = await this.dispatchSocketMessage(
      targetJid,
      cleanDigits,
      text
    );

    let updatedLead: CustomerLead | undefined;
    if (cleanDigits) {
      const msgId = `wa-manual-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      this.processedMsgIds.add(msgId);
      const role = opts?.senderRole || 'agent';
      const chatMsg: ChatMessage = {
        id: msgId,
        sender: role,
        text,
        timestamp: this.getTimeStr(),
        status: 'read',
        productCards: opts?.productCards,
        orderSummary: opts?.orderSummary,
        intentTag: opts?.intentTag,
      };
      updatedLead = this.appendMessageToRealLead(cleanDigits, chatMsg, {
        timestampMs: Date.now(),
      });

      // When user writes manually as advisor/owner from the web app, pause automatic bot on this chat AND learn from the owner's reply!
      let learnedFact: LearnedFact | null = null;
      if (role === 'agent' && updatedLead) {
        learnedFact = this.learnFromOwnerReplySync(updatedLead, text);
        updatedLead.botActive = false;
        updatedLead.humanTakeoverAt = Date.now();
        this.realLeadsMap.set(cleanDigits, updatedLead);
        this.schedulePersistRealLeads();
      }
      return { sentViaSocket, waMeUrl, lead: updatedLead, learnedFact } as any;
    }

    return { sentViaSocket, waMeUrl, lead: updatedLead };
  }

  public updateRealLeadSettings(
    phoneOrId: string,
    patch: Partial<
      Pick<
        CustomerLead,
        | 'botActive'
        | 'stage'
        | 'cart'
        | 'appliedCoupon'
        | 'name'
        | 'notes'
        | 'aiSummary'
        | 'aiActionItem'
        | 'aiPriority'
        | 'aiCategory'
      >
    >
  ): CustomerLead | null {
    const cleanDigits = sanitizePhoneDigits(phoneOrId);
    const lead =
      this.realLeadsMap.get(cleanDigits) ||
      Array.from(this.realLeadsMap.values()).find((l) => l.id === phoneOrId);

    if (!lead) return null;

    if (typeof patch.botActive === 'boolean') {
      lead.botActive = patch.botActive;
      if (patch.botActive) {
        lead.humanTakeoverAt = undefined;
      }
    }
    if (patch.stage) lead.stage = patch.stage;
    if (patch.cart) lead.cart = patch.cart;
    if ('appliedCoupon' in patch) lead.appliedCoupon = patch.appliedCoupon;
    if (patch.name && patch.name.trim()) {
      lead.name = patch.name.trim();
      const keyDigits = sanitizePhoneDigits(lead.phone);
      if (keyDigits) {
        this.contactNamesMap.set(keyDigits, lead.name);
        lead.avatarInitials = getInitials(lead.name, keyDigits);
      }
    }
    if (typeof patch.notes === 'string') lead.notes = patch.notes;
    if (typeof patch.aiSummary === 'string') lead.aiSummary = patch.aiSummary;
    if (typeof patch.aiActionItem === 'string') lead.aiActionItem = patch.aiActionItem;
    if (patch.aiPriority) lead.aiPriority = patch.aiPriority;
    if (patch.aiCategory) lead.aiCategory = patch.aiCategory;

    const key = sanitizePhoneDigits(lead.phone);
    this.realLeadsMap.set(key, lead);
    this.schedulePersistRealLeads();
    return lead;
  }

  public disconnect(): void {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.logout();
      } catch {
        // ignore
      }
      try {
        this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }
    this.resetAuthDir();
    this.connectionState = 'disconnected';
    this.qrDataUrl = null;
    this.pairingCode = null;
    this.connectedPhone = null;
    this.connectedName = null;
    this.lastError = null;
    this.statusDetail = 'Desconectado.';
  }

  private resetAuthDir(): void {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      }
      if (fs.existsSync(this.backupAuthDir)) {
        fs.rmSync(this.backupAuthDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}

export const whatsappGateway = new WhatsAppProductionGateway();

function readJsonBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body && typeof (req as any).body === 'object') {
    return Promise.resolve((req as any).body);
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(payload));
}

function buildGatewayStatePayload() {
  return {
    connectionState: whatsappGateway.connectionState,
    qrDataUrl: whatsappGateway.qrDataUrl,
    pairingCode: whatsappGateway.pairingCode,
    connectedPhone: whatsappGateway.connectedPhone,
    connectedName: whatsappGateway.connectedName,
    lastError: whatsappGateway.lastError,
    statusDetail: whatsappGateway.statusDetail,
    safetyConfig: whatsappGateway.safetyConfig,
    learnedKnowledge: whatsappGateway.botConfig.learnedKnowledge || [],
    totalBotRepliesSent: whatsappGateway.totalBotRepliesSent,
    executiveBriefing: whatsappGateway.executiveBriefing,
    realLeads: whatsappGateway.getSortedRealLeads(65),
    events: whatsappGateway.drainEvents(),
  };
}

export async function handleSalesApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlObj = new URL(req.url || '/', 'http://localhost:3000');
  const pathname = urlObj.pathname;

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  whatsappGateway.ensureInitialized();

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return true;
  }

  // 1. AI Secretary & Sales Chat Endpoint (/api/sales-chat)
  if (pathname === '/api/sales-chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const { customerMessage, lead, products, config } = body;
      const activeProducts = products || whatsappGateway.products;
      const activeConfig: BotConfig = config || whatsappGateway.botConfig;
      const activeLead: CustomerLead = lead || {
        id: 'lead-ext',
        name: 'Contacto',
        phone: '',
        city: 'Santo Domingo',
        avatarInitials: 'CL',
        avatarColor: '#008069',
        stage: 'nuevo',
        unreadCount: 0,
        lastActivity: 'Ahora',
        botActive: true,
        tags: [],
        notes: '',
        cart: [],
        messages: [],
      };

      const deterministic = generateDeterministicSalesReply(
        customerMessage || 'Hola',
        activeLead,
        activeProducts,
        activeConfig
      );
      const heur = summarizeConversationHeuristic(activeLead, activeConfig);

      // If deterministic engine matched a specific learned fact from Ezequiel's memory, return it immediately or pass it with high priority to Gemini!
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        sendJson(res, 200, {
          useLocalFallback: true,
          replyText: deterministic.replyText,
          quickReplies: deterministic.quickReplies,
          matchedLearnedFact: deterministic.matchedLearnedFact,
          summary: heur.summary,
          actionItem: heur.actionItem,
          priority: heur.priority,
          category: heur.category,
        });
        return true;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      const isSalesMode = activeConfig.assistantRole === 'ventas';
      const ownerName = activeConfig.ownerName || 'Ezequiel';
      const currencySymbol = activeConfig.currencySymbol || 'RD$';

      const recentHistory = (activeLead.messages || [])
        .filter((m) => !m.id.startsWith('wa-init-'))
        .slice(-10)
        .map(
          (m) =>
            `${
              m.sender === 'customer'
                ? activeLead.name
                : m.sender === 'agent'
                ? ownerName
                : activeConfig.agentName
            }: ${m.text}`
        )
        .join('\n');

      const previousBotReplies = (activeLead.messages || [])
        .filter((m) => m.sender === 'bot' && !m.id.startsWith('wa-init-'))
        .slice(-3)
        .map((m) => m.text)
        .join(' | ');

      const catalogText =
        `\nCatálogo de artículos disponibles (${currencySymbol}):\n` +
        (activeProducts || [])
          .map(
            (p: Product) =>
              `- ID: ${p.id} | ${p.name}: ${currencySymbol} ${p.price.toLocaleString('en-US')}`
          )
          .join('\n');

      const learnedList = activeConfig.learnedKnowledge || whatsappGateway.botConfig.learnedKnowledge || [];
      const learnedText =
        learnedList.length > 0
          ? `\nMEMORIA APRENDIDA DE LAS RESPUESTAS DE ${ownerName.toUpperCase()} (Úsala con máxima prioridad cuando pregunten por estos servicios o artículos en RD$):\n` +
            learnedList
              .map(
                (f: LearnedFact) =>
                  `- [${f.keywords.join(', ')}]: ${f.learnedFact}${
                    f.priceRd ? ` (RD$ ${f.priceRd.toLocaleString('en-US')})` : ''
                  }`
              )
              .join('\n')
          : '';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Historial de WhatsApp con ${activeLead.name}:\n${recentHistory}\n\nNuevo mensaje de ${activeLead.name}: "${customerMessage}"`,
        config: {
          systemInstruction: `Eres ${activeConfig.agentName}, ${
            isSalesMode
              ? `asesora comercial de "${activeConfig.businessName}" en República Dominicana`
              : `secretaria ejecutiva y asistente personal de ${ownerName} en "${activeConfig.businessName}" (República Dominicana, moneda: Peso Dominicano RD$)`
          }. ${activeConfig.secretaryInstructions || ''}${learnedText}${catalogText}
REGLAS:
1. Responde como una persona real en WhatsApp: máximo 1 a 2 oraciones cortas, naturales y directas. Usa siempre Pesos Dominicanos (RD$).
2. Si preguntan por un servicio o artículo que está en la MEMORIA APRENDIDA DE LAS RESPUESTAS DE ${ownerName.toUpperCase()} o en el Catálogo, responde con naturalidad dando el dato y el precio exacto en RD$.
3. Si preguntan si hacemos un servicio o vendemos algo que NO está ni en la Memoria Aprendida ni en el Catálogo, di con amabilidad que se lo vas a confirmar ahora mismo con ${ownerName} para darle el precio exacto en RD$.
4. NUNCA repitas una frase que ya dijiste antes ([${previousBotReplies}]).
5. NO envíes listas largas de catálogo a menos que el contacto lo pida explícitamente.
6. Genera también un resumen ejecutivo de 1 oración (summary), la tarea pendiente para ${ownerName} (actionItem), prioridad ('alta' | 'media' | 'baja') y categoría ('urgente' | 'cliente' | 'reunion' | 'cobro' | 'personal' | 'informativo').`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replyText: { type: Type.STRING },
              summary: { type: Type.STRING },
              actionItem: { type: Type.STRING },
              priority: { type: Type.STRING },
              category: { type: Type.STRING },
              recommendedProductIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              quickReplies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestedStage: { type: Type.STRING },
            },
            required: [
              'replyText',
              'summary',
              'actionItem',
              'priority',
              'category',
              'quickReplies',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      sendJson(res, 200, {
        useLocalFallback: false,
        matchedLearnedFact: deterministic.matchedLearnedFact,
        ...parsed,
      });
      return true;
    } catch {
      sendJson(res, 200, { useLocalFallback: true });
      return true;
    }
  }

  // 2. Get WhatsApp Gateway Status, Real Chats & Live Events
  if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
    sendJson(res, 200, buildGatewayStatePayload());
    return true;
  }

  // 3. Sync Catalog, BotConfig & SafetyConfig to Gateway
  if (pathname === '/api/whatsapp/sync' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (Array.isArray(body.products)) {
      whatsappGateway.products = body.products;
    }
    if (body.botConfig) {
      // Preserve any newly learned knowledge from phone replies while syncing
      const serverKnowledge = whatsappGateway.botConfig.learnedKnowledge || [];
      const incomingKnowledge: LearnedFact[] = Array.isArray(
        body.botConfig.learnedKnowledge
      )
        ? body.botConfig.learnedKnowledge
        : [];
      let merged = [...incomingKnowledge];
      if (!body.forceOverwriteKnowledge) {
        for (const fact of serverKnowledge) {
          merged = mergeLearnedFact(merged, fact);
        }
      }
      whatsappGateway.botConfig = {
        ...body.botConfig,
        learnedKnowledge: merged,
      };
    }
    if (body.safetyConfig) {
      whatsappGateway.safetyConfig = {
        ...whatsappGateway.safetyConfig,
        ...body.safetyConfig,
      };
    }
    sendJson(res, 200, {
      ok: true,
      ...buildGatewayStatePayload(),
    });
    return true;
  }

  // 4. Start or Resume Baileys QR / Pairing Connection
  if (pathname === '/api/whatsapp/connect' && req.method === 'POST') {
    const body = await readJsonBody(req);
    await whatsappGateway.startConnection(
      body.pairingPhone,
      Boolean(body.forceFresh)
    );
    sendJson(res, 200, {
      ok: true,
      ...buildGatewayStatePayload(),
    });
    return true;
  }

  // 5. Disconnect WhatsApp Session
  if (pathname === '/api/whatsapp/disconnect' && req.method === 'POST') {
    whatsappGateway.disconnect();
    sendJson(res, 200, {
      ok: true,
      ...buildGatewayStatePayload(),
    });
    return true;
  }

  // 6. Send Real Outbound WhatsApp Message (Manual Advisor, Product Card, or Order Summary)
  if (pathname === '/api/whatsapp/send' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const result = await whatsappGateway.sendDirectMessage(
      body.phone || '',
      body.text || '',
      {
        jid: body.jid,
        senderRole: body.senderRole || 'agent',
        productCards: body.productCards,
        orderSummary: body.orderSummary,
        intentTag: body.intentTag,
      }
    );
    sendJson(res, 200, result);
    return true;
  }

  // 7. Trigger Immediate AI Bot Reply on a Real WhatsApp Chat (/api/whatsapp/bot-reply-now)
  if (pathname === '/api/whatsapp/bot-reply-now' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const phoneDigits = sanitizePhoneDigits(body.phone || body.leadId || '');
    if (!phoneDigits) {
      sendJson(res, 400, { error: 'Missing phone number' });
      return true;
    }
    const targetJid = body.jid || `${phoneDigits}@s.whatsapp.net`;
    const promptToAnswer =
      body.customerText || 'Hola, ¿en qué podemos ayudarte?';
    const updatedLead = await whatsappGateway.processAndReplyToRealCustomer(
      targetJid,
      phoneDigits,
      body.name || formatPhoneDisplay(phoneDigits),
      promptToAnswer
    );
    sendJson(res, 200, {
      ok: true,
      lead: updatedLead,
      ...buildGatewayStatePayload(),
    });
    return true;
  }

  // 8. Update Real Lead Settings (Bot IA Active / Manual Advisor Mode, Stage, Cart, Contact Name)
  if (pathname === '/api/whatsapp/lead-update' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const updated = whatsappGateway.updateRealLeadSettings(
      body.phone || body.leadId || '',
      body
    );
    sendJson(res, 200, {
      ok: true,
      lead: updated,
    });
    return true;
  }

  // 9. Executive Secretary Summary Endpoint (/api/whatsapp/summarize)
  if (pathname === '/api/whatsapp/summarize' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.lead && body.lead.id) {
      const updatedLead =
        await whatsappGateway.updateLeadExecutiveSummaryWithAi(body.lead);
      sendJson(res, 200, {
        ok: true,
        lead: updatedLead,
      });
      return true;
    }

    const result = await whatsappGateway.generateGlobalExecutiveBriefing(
      Array.isArray(body.leads) ? body.leads : undefined
    );
    sendJson(res, 200, {
      ok: true,
      briefing: result.briefing,
      leads: result.leads,
    });
    return true;
  }

  // 10. Official Meta WhatsApp Cloud API Webhook Verification (GET) & Handler (POST)
  if (pathname === '/api/webhook/whatsapp') {
    if (req.method === 'GET') {
      const mode = urlObj.searchParams.get('hub.mode');
      const token = urlObj.searchParams.get('hub.verify_token');
      const challenge = urlObj.searchParams.get('hub.challenge');
      if (
        mode === 'subscribe' &&
        token === whatsappGateway.safetyConfig.metaVerifyToken
      ) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end(challenge || 'OK');
        return true;
      }
      sendJson(res, 403, { error: 'Invalid verify_token' });
      return true;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = entry?.messages?.[0];
      if (msg && msg.text?.body) {
        const fromPhone = sanitizePhoneDigits(msg.from || '');
        const profileName =
          entry?.contacts?.[0]?.profile?.name || formatPhoneDisplay(fromPhone);
        whatsappGateway.drainEvents();
        await whatsappGateway.processAndReplyToRealCustomer(
          `${fromPhone}@s.whatsapp.net`,
          fromPhone,
          profileName,
          msg.text.body
        );
      }
      sendJson(res, 200, { status: 'EVENT_RECEIVED' });
      return true;
    }
  }

  return false;
}
