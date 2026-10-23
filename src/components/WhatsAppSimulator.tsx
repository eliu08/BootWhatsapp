import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ClipboardList,
  Edit3,
  FileText,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  BotConfig,
  CustomerLead,
  LeadStage,
  LearnedFact,
  Product,
} from '../types/sales';
import {
  calculateOrderSummary,
  extractLearnedFactFromOwnerReply,
  formatPhoneDisplay,
  mergeLearnedFact,
  summarizeConversationHeuristic,
} from '../utils/salesEngine';
import { ProductVisual } from './ProductVisual';
import { GatewayStatusState } from './IntegrationPanel';

interface WhatsAppSimulatorProps {
  leads: CustomerLead[];
  activeLeadId: string;
  products: Product[];
  botConfig: BotConfig;
  isBotTyping: boolean;
  gatewayStatus: GatewayStatusState;
  globalBotAutoReply: boolean;
  liveDispatchFeedback: string | null;
  onToggleGlobalBotAutoReply: () => void;
  onUpdateBotConfig: (updated: BotConfig) => void;
  onOpenSummaryTab: () => void;
  onOpenIntegrationTab: () => void;
  onSelectLead: (leadId: string) => void;
  onSendMessage: (text: string, senderRole: 'customer' | 'agent') => void;
  onTriggerBotReplyNow: (lead: CustomerLead) => void;
  onRefreshLeadSummary: (lead: CustomerLead) => void;
  onRenameLead: (leadId: string, newName: string) => void;
  onSendProductCardToChat: (product: Product) => void;
  onAddProductToLeadCart: (product: Product, triggerChatConfirm?: boolean) => void;
  onUpdateCartQuantity: (productId: string, delta: number) => void;
  onSendOrderSummaryToChat: () => void;
  onMarkOrderPaid: () => void;
  onToggleLeadBot: (leadId: string) => void;
  onChangeLeadStage: (leadId: string, stage: LeadStage) => void;
  onToggleLeadCoupon: (leadId: string) => void;
  onCreateLead: (name: string, phone: string, city: string) => void;
}

const STAGE_LABELS: Record<LeadStage, string> = {
  nuevo: 'Nuevo',
  interesado: 'En Curso',
  cotizado: 'Cotizado',
  negociacion: 'Importante',
  pagado: 'Resuelto',
};

function formatWhatsAppText(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export const WhatsAppSimulator: React.FC<WhatsAppSimulatorProps> = ({
  leads,
  activeLeadId,
  products,
  botConfig,
  isBotTyping,
  gatewayStatus,
  globalBotAutoReply,
  liveDispatchFeedback,
  onToggleGlobalBotAutoReply,
  onUpdateBotConfig,
  onOpenSummaryTab,
  onOpenIntegrationTab,
  onSelectLead,
  onSendMessage,
  onTriggerBotReplyNow,
  onRefreshLeadSummary,
  onRenameLead,
  onSendProductCardToChat,
  onAddProductToLeadCart,
  onUpdateCartQuantity,
  onSendOrderSummaryToChat,
  onMarkOrderPaid,
  onToggleLeadBot,
  onChangeLeadStage,
  onToggleLeadCoupon,
  onCreateLead,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<
    'all' | 'real' | 'urgent' | 'unread'
  >('all');
  const [messageInput, setMessageInput] = useState('');
  const [senderMode, setSenderMode] = useState<'customer' | 'agent'>('agent');
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadCity, setNewLeadCity] = useState('');
  const [newLeadError, setNewLeadError] = useState('');
  const [mobilePane, setMobilePane] = useState<'chats' | 'chat' | 'crm'>('chat');

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedNameValue, setEditedNameValue] = useState('');
  const [quickTeachInput, setQuickTeachInput] = useState('');

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const activeLead = leads.find((l) => l.id === activeLeadId) || leads[0];
  const realChatsCount = leads.filter((l) => l.isRealWhatsApp).length;

  useEffect(() => {
    setIsEditingName(false);
    setEditedNameValue(activeLead?.name || '');
    const lastMsg = activeLead?.messages?.[activeLead.messages.length - 1];
    if (
      activeLead?.isRealWhatsApp ||
      lastMsg?.intentTag === 'consulta_nueva_aprendizaje' ||
      lastMsg?.intentTag === 'consulta_nueva'
    ) {
      setSenderMode('agent');
    } else {
      setSenderMode('customer');
    }
  }, [activeLead?.id, activeLead?.isRealWhatsApp, activeLead?.name]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeLead?.messages.length, isBotTyping, activeLeadId]);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.aiSummary || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (stageFilter === 'real') return Boolean(lead.isRealWhatsApp);
    if (stageFilter === 'urgent') return lead.aiPriority === 'alta';
    if (stageFilter === 'unread') return lead.unreadCount > 0;
    return true;
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageInput.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, senderMode);
    setMessageInput('');
  };

  const handleSaveEditedName = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeLead && editedNameValue.trim()) {
      onRenameLead(activeLead.id, editedNameValue.trim());
    }
    setIsEditingName(false);
  };

  const handleCreateLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim()) {
      setNewLeadError('Ingresa el nombre y número de WhatsApp del contacto.');
      return;
    }
    onCreateLead(
      newLeadName.trim(),
      newLeadPhone.trim(),
      newLeadCity.trim() || 'WhatsApp Directo'
    );
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadCity('');
    setNewLeadError('');
    setShowNewLeadForm(false);
    setMobilePane('chat');
  };

  const liveOrderCalc = activeLead
    ? calculateOrderSummary(
        activeLead.cart,
        botConfig,
        activeLead.appliedCoupon
      )
    : null;

  const activeLeadSummary = activeLead
    ? activeLead.aiSummary && activeLead.aiActionItem
      ? {
          summary: activeLead.aiSummary,
          actionItem: activeLead.aiActionItem,
          priority: activeLead.aiPriority || 'media',
          category: activeLead.aiCategory || 'informativo',
        }
      : summarizeConversationHeuristic(activeLead, botConfig)
    : null;

  const isConnected = gatewayStatus.connectionState === 'connected';
  const currentRole = botConfig.assistantRole || 'secretaria';

  return (
    <div className="space-y-3">
      {/* LIVE OPERATIONS & SECRETARY MODE BAR */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isConnected ? 'bg-[#00a884]' : 'bg-amber-500'
            }`}
          />
          <div className="text-xs min-w-0">
            {isConnected ? (
              <p className="text-slate-800 truncate">
                <strong className="font-bold text-slate-900">
                  WhatsApp en Vivo: {gatewayStatus.connectedName || botConfig.businessName}
                </strong>{' '}
                <span className="font-mono text-slate-600">
                  ({formatPhoneDisplay(gatewayStatus.connectedPhone || '')})
                </span>{' '}
                ·{' '}
                <span className="font-semibold text-[#008069]">
                  {realChatsCount > 0
                    ? `${realChatsCount} chats reales sincronizados`
                    : 'Listo: tus chats aparecerán con su nombre en cuanto recibas o envíes un mensaje'}
                </span>
              </p>
            ) : (
              <p className="text-slate-700 truncate">
                <strong>Asistente y Secretaria de WhatsApp:</strong>{' '}
                {realChatsCount > 0
                  ? `${realChatsCount} conversaciones reales guardadas en tu bandeja.`
                  : 'Vincula tu WhatsApp por QR o explora los chats y resúmenes de tu secretaria.'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {/* Quick Assistant Role Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 max-w-full overflow-x-auto">
            {(
              [
                { id: 'secretaria', label: 'Secretaria Humana' },
                { id: 'solo_resumen', label: 'Solo Resumen' },
                { id: 'ventas', label: 'Modo Ventas' },
              ] as const
            ).map((roleItem) => (
              <button
                key={roleItem.id}
                type="button"
                onClick={() =>
                  onUpdateBotConfig({
                    ...botConfig,
                    assistantRole: roleItem.id,
                  })
                }
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  currentRole === roleItem.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {roleItem.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenSummaryTab}
            className="px-3 py-1.5 text-xs font-semibold text-[#008069] bg-[#e7fce3] hover:bg-[#d1f7c9] border border-[#00a884]/30 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Ver Resumen de Chats</span>
          </button>

          <button
            type="button"
            onClick={onToggleGlobalBotAutoReply}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              globalBotAutoReply && currentRole !== 'solo_resumen'
                ? 'bg-[#e7fce3] text-[#008069] border-[#00a884]/40 hover:bg-[#d1f7c9]'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {currentRole === 'solo_resumen'
                ? 'Auto-Respuesta: SILENCIOSA'
                : `Auto-Respuesta: ${globalBotAutoReply ? 'ACTIVA' : 'PAUSADA'}`}
            </span>
          </button>

          {!isConnected && (
            <button
              type="button"
              onClick={onOpenIntegrationTab}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Vincular QR
            </button>
          )}
        </div>
      </div>

      {/* Mobile Pane Switcher (< lg) */}
      <div
        role="group"
        aria-label="Vista móvil del simulador"
        className="flex lg:hidden items-center gap-1 p-1 bg-slate-200/80 rounded-lg"
      >
        <button
          type="button"
          onClick={() => setMobilePane('chats')}
          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            mobilePane === 'chats'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          Chats ({leads.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('chat')}
          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            mobilePane === 'chat'
              ? 'bg-white text-[#008069] shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          Conversación
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('crm')}
          className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            mobilePane === 'crm'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600'
          }`}
        >
          Resumen IA
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden lg:h-[750px]">
        {/* LEFT PANEL: WHATSAPP WEB CHAT LIST */}
        <aside
          aria-label="Lista de conversaciones de WhatsApp"
          className={`${
            mobilePane === 'chats' ? 'flex' : 'hidden lg:flex'
          } lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 flex-col bg-white h-[640px] lg:h-full overflow-hidden`}
        >
          {/* WhatsApp Web Left Header */}
          <div className="px-4 py-3 bg-[#f0f2f5] border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#00a884] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                {(gatewayStatus.connectedName || botConfig.businessName)
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {gatewayStatus.connectedName || botConfig.businessName}
                </p>
                <p className="text-xs text-slate-600 truncate">
                  Secretaria: {botConfig.agentName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowNewLeadForm((prev) => !prev)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              aria-label="Nuevo chat de contacto"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Nuevo Chat</span>
            </button>
          </div>

          {/* New Lead Inline Form */}
          {showNewLeadForm && (
            <form
              onSubmit={handleCreateLeadSubmit}
              className="p-3 bg-slate-50 border-b border-slate-200 space-y-2"
            >
              <p className="text-xs font-semibold text-slate-800">
                Abrir chat de WhatsApp con nombre y número
              </p>
              <div>
                <label htmlFor="new-lead-name" className="sr-only">
                  Nombre del contacto
                </label>
                <input
                  id="new-lead-name"
                  type="text"
                  placeholder="Nombre (ej. Ing. Roberto Méndez)"
                  value={newLeadName}
                  onChange={(e) => {
                    setNewLeadName(e.target.value);
                    setNewLeadError('');
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-lead-phone" className="sr-only">
                    Teléfono WhatsApp
                  </label>
                  <input
                    id="new-lead-phone"
                    type="text"
                    placeholder="+1 809 555 1234"
                    value={newLeadPhone}
                    onChange={(e) => {
                      setNewLeadPhone(e.target.value);
                      setNewLeadError('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
                <div>
                  <label htmlFor="new-lead-city" className="sr-only">
                    Ciudad
                  </label>
                  <input
                    id="new-lead-city"
                    type="text"
                    placeholder="Ciudad (ej. Santo Domingo)"
                    value={newLeadCity}
                    onChange={(e) => setNewLeadCity(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
              </div>
              {newLeadError && (
                <p className="text-xs text-red-600 font-medium">{newLeadError}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewLeadForm(false);
                    setNewLeadError('');
                  }}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-medium text-white bg-[#00a884] rounded-md hover:bg-[#008f6f]"
                >
                  Iniciar Chat
                </button>
              </div>
            </form>
          )}

          {/* Search & Filter Controls */}
          <div className="p-2.5 border-b border-slate-200 space-y-2 bg-white">
            <div className="relative">
              <label htmlFor="wa-chat-search" className="sr-only">
                Buscar contacto, teléfono o resumen
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="wa-chat-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, número o recado..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#f0f2f5] text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div
              role="group"
              aria-label="Filtrar conversaciones"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              {(
                [
                  { id: 'all', label: `Todos (${leads.length})` },
                  { id: 'real', label: `Reales (${realChatsCount})` },
                  { id: 'urgent', label: 'Urgentes' },
                  { id: 'unread', label: 'Sin leer' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStageFilter(tab.id)}
                  className={`flex-1 py-1 px-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    stageFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact List (WhatsApp Web style) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredLeads.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-xs font-medium text-slate-700">
                  No hay chats en este filtro.
                </p>
                <p className="text-[11px] text-slate-500">
                  Cuando te escriban en tu WhatsApp real, aparecerán aquí con su nombre y mensaje tal como en tu teléfono.
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const realMsgs = (lead.messages || []).filter(
                  (m) => !m.id.startsWith('wa-init-')
                );
                const lastMsg = realMsgs[realMsgs.length - 1];
                const isSelected = lead.id === activeLead?.id;
                const isUrgent = lead.aiPriority === 'alta';

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => {
                      onSelectLead(lead.id);
                      setMobilePane('chat');
                    }}
                    className={`w-full text-left px-3.5 py-3 flex items-start gap-3 transition-colors ${
                      isSelected
                        ? 'bg-[#f0f2f5]'
                        : 'hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: lead.avatarColor }}
                    >
                      {lead.avatarInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {lead.name}
                          </span>
                          {lead.isRealWhatsApp && (
                            <span className="text-[10px] font-mono font-bold text-[#008069] shrink-0">
                              WA
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                          {lead.lastActivity}
                        </span>
                      </div>

                      {/* Last real message or executive summary preview */}
                      <p className="text-xs text-slate-600 truncate mt-0.5">
                        {lastMsg
                          ? `${
                              lastMsg.sender === 'agent'
                                ? '✓✓ Tú: '
                                : lastMsg.sender === 'bot'
                                ? `🤖 ${botConfig.agentName}: `
                                : ''
                            }${lastMsg.text.replace(/\*/g, '')}`
                          : lead.aiSummary || lead.phone}
                      </p>

                      <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="truncate font-mono text-[10px]">
                          {lead.name !== lead.phone ? lead.phone : lead.city}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isUrgent && (
                            <span className="font-mono text-[10px] font-bold text-amber-700">
                              URGENTE
                            </span>
                          )}
                          {lead.unreadCount > 0 ? (
                            <span className="font-mono tabular-nums font-bold text-[#008069]">
                              {lead.unreadCount} nuevo
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-slate-400">
                              {lead.botActive ? 'Secretaria ON' : 'Manual (Tú)'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* CENTER PANEL: WHATSAPP WEB CHAT VIEWPORT */}
        <section
          aria-label="Conversación activa de WhatsApp Web"
          className={`${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          } lg:col-span-6 flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-[#efeae2] h-[660px] lg:h-full overflow-hidden`}
        >
          {/* Chat Header */}
          <div className="px-4 py-2.5 bg-[#f0f2f5] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-full text-white font-semibold text-xs flex items-center justify-center shrink-0"
                style={{ backgroundColor: activeLead?.avatarColor || '#0d9488' }}
              >
                {activeLead?.avatarInitials}
              </div>
              <div className="min-w-0">
                {isEditingName ? (
                  <form
                    onSubmit={handleSaveEditedName}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={editedNameValue}
                      onChange={(e) => setEditedNameValue(e.target.value)}
                      placeholder="Nombre del contacto..."
                      autoFocus
                      className="px-2 py-0.5 text-xs font-semibold bg-white border border-[#00a884] rounded focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-1 text-white bg-[#00a884] rounded hover:bg-[#008f6f]"
                      title="Guardar nombre"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-sm font-semibold text-slate-900 truncate">
                      {activeLead?.name}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedNameValue(activeLead?.name || '');
                        setIsEditingName(true);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded"
                      title="Editar nombre del contacto"
                      aria-label="Editar nombre del contacto"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <span className="text-xs text-slate-500 font-mono tabular-nums hidden sm:inline">
                      · {activeLead?.phone}
                    </span>
                  </div>
                )}

                <p className="text-xs text-slate-600 truncate">
                  {isBotTyping
                    ? `${botConfig.agentName} está redactando respuesta...`
                    : activeLead?.botActive
                    ? `Secretaria IA (${botConfig.agentName}) atendiendo · Si tú escribes, se pausa automáticamente`
                    : `Modo Manual Activo: Tú estás hablando sin interrupciones del bot`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => activeLead && onTriggerBotReplyNow(activeLead)}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#008069] bg-white hover:bg-[#e7fce3] border border-[#00a884]/40 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title="Pedir a tu Secretaria IA que responda el último mensaje ahora mismo"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Responder con Secretaria</span>
              </button>

              <button
                type="button"
                onClick={() => activeLead && onToggleLeadBot(activeLead.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeLead?.botActive
                    ? 'bg-[#e7fce3] text-[#008069] border-[#00a884]/30'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                {activeLead?.botActive ? (
                  <>
                    <Bot className="w-3.5 h-3.5" />
                    <span>Secretaria: ON</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Modo Manual (Tú)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Live Socket Dispatch Banner */}
          {liveDispatchFeedback && (
            <div className="px-4 py-1.5 bg-[#e7fce3] border-b border-[#00a884]/30 text-xs font-medium text-[#008069] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>{liveDispatchFeedback}</span>
              </span>
            </div>
          )}

          {/* Human Takeover Protection Notice when Bot is Paused on this Chat */}
          {activeLead && !activeLead.botActive && (
            <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>
                <strong>Conversación en Modo Manual:</strong> La secretaria está pausada en este chat para que hables tranquilo sin que mande mensajes extras.
              </span>
              <button
                type="button"
                onClick={() => onToggleLeadBot(activeLead.id)}
                className="px-2 py-0.5 text-[11px] font-semibold bg-white border border-amber-300 rounded hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                Reactivar Secretaria
              </button>
            </div>
          )}

          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            data-testid="whatsapp-messages-container"
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 wa-chat-bg"
          >
            {/* Sync Notice */}
            <div className="max-w-md mx-auto bg-[#ffeecd] text-slate-800 text-[11px] px-3 py-1.5 rounded-lg text-center shadow-2xs">
              {activeLead?.isRealWhatsApp ? (
                <>
                  Chat real de WhatsApp con <strong>{activeLead.name}</strong> (
                  {activeLead.phone}). Cuando tú escribes desde tu teléfono o aquí abajo, el bot se pausa solo para no interrumpirte.
                </>
              ) : (
                <>
                  Conversación asistida por <strong>{botConfig.agentName}</strong>, secretaria ejecutiva de{' '}
                  <strong>{botConfig.ownerName || 'Ezequiel'}</strong> en{' '}
                  <strong>{botConfig.businessName}</strong>.
                </>
              )}
            </div>

            {activeLead?.messages.map((msg) => {
              const isOutgoing = msg.sender === 'bot' || msg.sender === 'agent';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isOutgoing ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[86%] sm:max-w-[78%] rounded-xl px-3.5 py-2.5 shadow-2xs ${
                      isOutgoing
                        ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs'
                        : 'bg-white text-slate-900 rounded-tl-xs'
                    }`}
                  >
                    {/* Sender Header */}
                    <div className="flex items-center justify-between gap-3 mb-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-[#008069]">
                        {msg.sender === 'bot'
                          ? `${botConfig.agentName} · Secretaria IA`
                          : msg.sender === 'agent'
                          ? `${botConfig.ownerName || 'Tú'} (Personal)`
                          : activeLead.name}
                      </span>
                      {msg.intentTag === 'memoria_aprendida' && (
                        <span className="text-[10px] font-mono font-semibold text-[#008069] bg-white/80 px-1.5 py-0.5 rounded">
                          🧠 Memoria Aprendida (RD$)
                        </span>
                      )}
                      {(msg.intentTag === 'consulta_nueva_aprendizaje' ||
                        msg.intentTag === 'consulta_nueva') && (
                        <span className="text-[10px] font-mono font-semibold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded">
                          Por confirmar contigo
                        </span>
                      )}
                    </div>

                    {/* Message Prose */}
                    <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
                      {formatWhatsAppText(msg.text)}
                    </p>

                    {/* Embedded Interactive Product Cards (only when explicitly sent) */}
                    {msg.productCards && msg.productCards.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {msg.productCards.map((prod) => (
                          <div
                            key={prod.id}
                            className="bg-white rounded-lg border border-slate-200 overflow-hidden"
                          >
                            <ProductVisual
                              visualType={prod.visualType}
                              className="w-full h-28"
                            />
                            <div className="p-2.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <h4 className="text-xs font-bold text-slate-900">
                                  {prod.name}
                                </h4>
                                <span className="text-xs font-bold font-mono text-[#008069]">
                                  {botConfig.currencySymbol}
                                  {prod.price}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">
                                {prod.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Embedded Order Receipt Card */}
                    {msg.orderSummary && (
                      <div className="mt-2.5 bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <p className="text-xs font-bold text-slate-900">
                            ORDEN #{msg.orderSummary.orderNumber}
                          </p>
                          <span className="text-xs font-mono font-semibold text-[#008069]">
                            {botConfig.currencySymbol}
                            {msg.orderSummary.total}
                          </span>
                        </div>
                        {activeLead.stage !== 'pagado' && (
                          <button
                            type="button"
                            onClick={onMarkOrderPaid}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-md transition-colors"
                          >
                            Confirmar Pago
                          </button>
                        )}
                      </div>
                    )}

                    {/* Timestamp & Checkmarks */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] font-mono tabular-nums text-slate-500">
                      <span>{msg.timestamp}</span>
                      {isOutgoing && (
                        <CheckCheck
                          className="w-3.5 h-3.5 text-[#53bdeb]"
                          aria-label="Leído"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isBotTyping && (
              <div className="flex items-start">
                <div className="bg-[#d9fdd3] text-slate-800 px-3.5 py-2 rounded-xl text-xs font-medium shadow-2xs flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#008069]" />
                  <span>
                    {botConfig.agentName} está escribiendo una respuesta breve y natural...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Reply Suggestions */}
          <div className="px-3 py-2 bg-[#f8fafc] border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap shrink-0 mr-1">
              {senderMode === 'agent'
                ? 'Responder tú (la secretaria aprenderá de ti):'
                : 'Simular pregunta de cliente:'}
            </span>
            {(senderMode === 'agent'
              ? [
                  'Sí claro, hacemos currículo profesional en RD$ 350.',
                  'Sí, tenemos mouse inalámbrico disponible en RD$ 650.',
                  'Hola, ya vi el resumen que me pasó mi asistente. Te llamo en 10 minutos.',
                ]
              : [
                  'Hola, ¿ustedes hacen currículo y en cuánto sale?',
                  'Buenas tardes, ¿cuánto cuesta el formateo con Windows y Office?',
                  'Hola, ¿hacen envíos a Santiago y cuánto cuesta?',
                ]
            ).map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(promptText, senderMode)}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:border-[#00a884] hover:text-[#008069] transition-colors whitespace-nowrap shrink-0"
              >
                {promptText.length > 52
                  ? `${promptText.slice(0, 52)}...`
                  : promptText}
              </button>
            ))}
          </div>

          {/* WhatsApp Message Input Box */}
          <form
            onSubmit={handleFormSubmit}
            className="p-2.5 sm:p-3 bg-[#f0f2f5] border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div
              role="group"
              aria-label="Modo de envío"
              className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shrink-0"
            >
              <button
                type="button"
                onClick={() => setSenderMode('agent')}
                className={`flex-1 sm:flex-initial px-2.5 py-1 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  senderMode === 'agent'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Escribir Tú ({botConfig.ownerName || 'Personal'})
              </button>
              <button
                type="button"
                onClick={() => setSenderMode('customer')}
                className={`flex-1 sm:flex-initial px-2.5 py-1 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  senderMode === 'customer'
                    ? 'bg-[#00a884] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simular Contacto
              </button>
            </div>

            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 relative">
                <label htmlFor="wa-message-input" className="sr-only">
                  Escribe un mensaje en WhatsApp
                </label>
                <input
                  id="wa-message-input"
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={
                    senderMode === 'agent'
                      ? `Escribir a ${activeLead?.name || 'contacto'} (Pausa el bot en este chat)...`
                      : 'Simular lo que te escribe el cliente o contacto...'
                  }
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white text-slate-900 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>

              <button
                type="submit"
                aria-label="Enviar mensaje"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Enviar</span>
              </button>
            </div>
          </form>
        </section>

        {/* RIGHT PANEL: EXECUTIVE SECRETARY SUMMARY & OPTIONAL TOOLS */}
        <aside
          aria-label="Resumen de Secretaria IA y herramientas del chat"
          className={`${
            mobilePane === 'crm' ? 'flex' : 'hidden lg:flex'
          } lg:col-span-3 flex-col bg-white divide-y divide-slate-200 h-[660px] lg:h-full overflow-y-auto`}
        >
          {/* 1. Primary Executive Summary Card for this Chat */}
          <div className="p-4 space-y-3 bg-[#f8fafc]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-[#008069]" />
                <span>Resumen de Secretaria IA</span>
              </h3>
              <button
                type="button"
                onClick={() => activeLead && onRefreshLeadSummary(activeLead)}
                className="px-2 py-1 text-[11px] font-semibold text-[#008069] bg-white border border-slate-200 rounded-md hover:bg-[#e7fce3] flex items-center gap-1"
                title="Re-analizar esta conversación con IA"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Resumir</span>
              </button>
            </div>

            {activeLeadSummary && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${
                      activeLeadSummary.priority === 'alta'
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : activeLeadSummary.priority === 'media'
                        ? 'bg-sky-50 text-sky-900 border-sky-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    Prioridad {activeLeadSummary.priority.toUpperCase()}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {activeLead?.phone}
                  </span>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Qué necesita este contacto:
                  </p>
                  <p className="text-xs font-medium text-slate-900 mt-0.5 leading-relaxed">
                    {activeLeadSummary.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">
                      Acción pendiente para {botConfig.ownerName || 'ti'}:
                    </p>
                    <p className="text-xs text-slate-800">
                      {activeLeadSummary.actionItem}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Continuous Self-Learning Memory (RD$) */}
          <div className="p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#008069]" />
                <span>Memoria Aprendida ({botConfig.currencySymbol || 'RD$'})</span>
              </h3>
              <span className="text-[11px] font-mono font-semibold text-[#008069]">
                {(botConfig.learnedKnowledge || []).length} aprendidos
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Cada vez que tú respondes un servicio o precio en un chat (ej.{' '}
              <em>&quot;Sí, hacemos currículo en RD$ 350&quot;</em>),{' '}
              <strong>{botConfig.agentName}</strong> lo aprende y lo responde sola en cualquier otro chat.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickTeachInput.trim()) return;
                const fact = extractLearnedFactFromOwnerReply(
                  [],
                  quickTeachInput.trim(),
                  botConfig.ownerName || 'Ezequiel',
                  'Ahora'
                ) || {
                  id: `learn-${Date.now()}`,
                  category: 'servicio' as const,
                  keywords: quickTeachInput
                    .toLowerCase()
                    .split(/\s+/)
                    .filter((w) => w.length >= 3)
                    .slice(0, 8),
                  questionSummary: 'Enseñanza directa',
                  learnedFact: quickTeachInput.trim(),
                  learnedFromChat: botConfig.ownerName || 'Ezequiel',
                  learnedAt: 'Ahora',
                };
                onUpdateBotConfig({
                  ...botConfig,
                  learnedKnowledge: mergeLearnedFact(
                    botConfig.learnedKnowledge || [],
                    fact
                  ),
                });
                setQuickTeachInput('');
              }}
              className="flex items-center gap-1.5"
            >
              <label htmlFor="quick-teach-input" className="sr-only">
                Enseñar servicio o precio en RD$
              </label>
              <input
                id="quick-teach-input"
                type="text"
                value={quickTeachInput}
                onChange={(e) => setQuickTeachInput(e.target.value)}
                placeholder="Ej: Hacemos currículo en RD$ 350..."
                className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg shrink-0"
              >
                Enseñar
              </button>
            </form>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
              {(botConfig.learnedKnowledge || []).map((fact: LearnedFact) => (
                <div
                  key={fact.id}
                  className="p-2.5 rounded-lg bg-[#f8fafc] border border-slate-200 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 leading-snug">
                      {fact.learnedFact}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateBotConfig({
                          ...botConfig,
                          learnedKnowledge: (
                            botConfig.learnedKnowledge || []
                          ).filter((k) => k.id !== fact.id),
                        })
                      }
                      className="text-slate-400 hover:text-red-600 p-0.5 shrink-0"
                      title="Olvidar este dato"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                    <span className="truncate">
                      Claves: {fact.keywords.slice(0, 4).join(', ')}
                    </span>
                    {fact.priceRd && (
                      <span className="font-bold text-[#008069] shrink-0">
                        RD$ {fact.priceRd.toLocaleString('en-US')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Lead Stage & Status */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Estado del Contacto
              </h3>
              <span className="text-xs font-mono text-slate-500">
                {activeLead && STAGE_LABELS[activeLead.stage]}
              </span>
            </div>

            <div>
              <label
                htmlFor="lead-stage-select"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Clasificación en tu Bandeja
              </label>
              <select
                id="lead-stage-select"
                value={activeLead?.stage || 'nuevo'}
                onChange={(e) =>
                  activeLead &&
                  onChangeLeadStage(activeLead.id, e.target.value as LeadStage)
                }
                className="w-full px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              >
                <option value="nuevo">01. Nuevo Mensaje</option>
                <option value="interesado">02. En Seguimiento por Secretaria</option>
                <option value="cotizado">03. Esperando Presupuesto / Pago</option>
                <option value="negociacion">04. Urgente / Requiere tu Atención</option>
                <option value="pagado">05. Resuelto / Cerrado</option>
              </select>
            </div>
          </div>

          {/* 3. Optional Commercial / Quote Tools (Manual on demand) */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-[#008069]" />
                <span>Cotización Manual (Opcional)</span>
              </h3>
              <span className="text-[11px] text-slate-500">
                Solo si lo solicitas
              </span>
            </div>

            {activeLead && activeLead.cart.length > 0 && (
              <div className="space-y-2">
                {activeLead.cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200/70"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-500">
                        {botConfig.currencySymbol}
                        {item.price} x {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateCartQuantity(item.productId, -1)}
                        className="w-6 h-6 rounded bg-white border border-slate-300 text-slate-700 flex items-center justify-center font-mono text-xs"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3 h-3 text-red-600" />
                        ) : (
                          '-'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateCartQuantity(item.productId, 1)}
                        className="w-6 h-6 rounded bg-white border border-slate-300 text-slate-700 flex items-center justify-center font-mono text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                {liveOrderCalc && (
                  <button
                    type="button"
                    onClick={onSendOrderSummaryToChat}
                    className="w-full py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      Enviar Orden ({botConfig.currencySymbol}
                      {liveOrderCalc.total})
                    </span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-medium text-slate-500">
                Enviar producto o servicio manualmente al chat:
              </p>
              {products.slice(0, 4).map((prod) => (
                <div
                  key={prod.id}
                  className="p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2 bg-white"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {prod.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {botConfig.currencySymbol}
                      {prod.price}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddProductToLeadCart(prod, false)}
                      className="p-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                      title="Sumar a cotización"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSendProductCardToChat(prod)}
                      className="px-2 py-1 text-[11px] font-medium text-[#008069] bg-[#e7fce3] hover:bg-[#d1f7c9] rounded whitespace-nowrap"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
