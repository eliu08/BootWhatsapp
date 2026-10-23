import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { BotConfig, CustomerLead } from '../types/sales';
import { summarizeConversationHeuristic } from '../utils/salesEngine';

interface SecretarySummaryViewProps {
  leads: CustomerLead[];
  botConfig: BotConfig;
  executiveBriefing: string;
  isSummarizing: boolean;
  onUpdateBotConfig: (updated: BotConfig) => void;
  onRefreshBriefing: () => void;
  onOpenLeadChat: (leadId: string) => void;
  onTriggerBotReplyNow: (lead: CustomerLead) => void;
  onToggleLeadBot: (leadId: string) => void;
  onMarkTaskDone: (leadId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  urgente: 'Urgente',
  cliente: 'Cliente / Cotización',
  reunion: 'Reunión / Agenda',
  cobro: 'Pago / Facturación',
  personal: 'Personal',
  informativo: 'Recado / Info',
};

export const SecretarySummaryView: React.FC<SecretarySummaryViewProps> = ({
  leads,
  botConfig,
  executiveBriefing,
  isSummarizing,
  onUpdateBotConfig,
  onRefreshBriefing,
  onOpenLeadChat,
  onTriggerBotReplyNow,
  onToggleLeadBot,
  onMarkTaskDone,
}) => {
  const [filter, setFilter] = useState<'all' | 'alta' | 'cliente' | 'reunion'>(
    'all'
  );

  const enrichedLeads = leads.map((lead) => {
    if (lead.aiSummary && lead.aiActionItem && lead.aiCategory && lead.aiPriority) {
      return lead;
    }
    const heur = summarizeConversationHeuristic(lead, botConfig);
    return {
      ...lead,
      aiSummary: lead.aiSummary || heur.summary,
      aiActionItem: lead.aiActionItem || heur.actionItem,
      aiPriority: lead.aiPriority || heur.priority,
      aiCategory: lead.aiCategory || heur.category,
    };
  });

  const urgentCount = enrichedLeads.filter(
    (l) => l.aiPriority === 'alta'
  ).length;
  const meetingsCount = enrichedLeads.filter(
    (l) => l.aiCategory === 'reunion' || l.aiCategory === 'urgente'
  ).length;
  const commercialCount = enrichedLeads.filter(
    (l) => l.aiCategory === 'cliente' || l.aiCategory === 'cobro'
  ).length;

  const filteredLeads = enrichedLeads.filter((lead) => {
    if (filter === 'alta') return lead.aiPriority === 'alta';
    if (filter === 'cliente')
      return lead.aiCategory === 'cliente' || lead.aiCategory === 'cobro';
    if (filter === 'reunion')
      return lead.aiCategory === 'reunion' || lead.aiCategory === 'urgente';
    return true;
  });

  const currentRole = botConfig.assistantRole || 'secretaria';

  return (
    <div className="space-y-5">
      {/* Top Executive Briefing & Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#008069]" />
              <h1 className="text-lg font-bold text-slate-900">
                Resumen Ejecutivo de tu Secretaria IA ({botConfig.agentName})
              </h1>
            </div>
            <p className="text-xs text-slate-600">
              Entérate en segundos de quién te escribió en WhatsApp, qué necesita cada persona y qué tareas tienes pendientes sin revisar chat por chat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshBriefing}
              disabled={isSummarizing}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSummarizing ? 'animate-spin' : ''}`}
              />
              <span>
                {isSummarizing
                  ? 'Analizando chats con IA...'
                  : 'Actualizar Resumen con IA'}
              </span>
            </button>
          </div>
        </div>

        {/* 3 Assistant Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              {
                id: 'secretaria',
                title: '1. Secretaria Personal (Recomendado)',
                desc: 'Responde como una persona real (1-2 oraciones naturales, sin mandar catálogos ni spam) y te resume cada recado.',
              },
              {
                id: 'solo_resumen',
                title: '2. Solo Resumen (Modo Silencioso)',
                desc: 'No envía ningún mensaje automático en tu WhatsApp. Solo lee lo que te escriben y te arma el resumen ejecutivo aquí.',
              },
              {
                id: 'ventas',
                title: '3. Vendedora con Catálogo',
                desc: 'Responde consultas comerciales ofreciendo precios, descuentos y tomando pedidos de tu catálogo.',
              },
            ] as const
          ).map((mode) => {
            const active = currentRole === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() =>
                  onUpdateBotConfig({
                    ...botConfig,
                    assistantRole: mode.id,
                  })
                }
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  active
                    ? 'bg-[#e7fce3]/60 border-[#00a884] ring-1 ring-[#00a884]'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-900">
                    {mode.title}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      active ? 'text-[#008069]' : 'text-slate-400'
                    }`}
                  >
                    {active ? 'ACTIVO' : 'Elegir'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {mode.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Executive Briefing Box */}
        <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Informe General para {botConfig.ownerName || 'Ezequiel'} (
                {botConfig.businessName})
              </span>
            </span>
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Protección activa: Si tú escribes en un chat, el bot se pausa solo
              </span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
            {executiveBriefing ||
              `Hola ${
                botConfig.ownerName || 'Ezequiel'
              }, tienes ${enrichedLeads.length} conversaciones registradas (${urgentCount} urgentes, ${commercialCount} de clientes/pagos y ${meetingsCount} de agenda/recados). Abajo tienes el resumen exacto de qué necesita cada contacto y la acción sugerida.`}
          </p>
        </div>
      </div>

      {/* Filter Bar & KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filtrar resúmenes por prioridad"
          className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200"
        >
          {(
            [
              {
                id: 'all',
                label: `Todos los Chats (${enrichedLeads.length})`,
              },
              {
                id: 'alta',
                label: `Urgentes / Prioridad Alta (${urgentCount})`,
              },
              {
                id: 'cliente',
                label: `Clientes y Cobros (${commercialCount})`,
              },
              {
                id: 'reunion',
                label: `Reuniones y Recados (${meetingsCount})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredLeads.map((lead) => {
          const realMsgs = (lead.messages || []).filter(
            (m) => !m.id.startsWith('wa-init-')
          );
          const lastMsg = realMsgs[realMsgs.length - 1];
          const isHigh = lead.aiPriority === 'alta';

          return (
            <div
              key={lead.id}
              className={`bg-white rounded-xl border p-4 flex flex-col justify-between gap-3 transition-shadow hover:shadow-xs ${
                isHigh ? 'border-amber-300' : 'border-slate-200'
              }`}
            >
              <div className="space-y-3">
                {/* Contact Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full text-white font-semibold text-xs flex items-center justify-center shrink-0"
                      style={{ backgroundColor: lead.avatarColor }}
                    >
                      {lead.avatarInitials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {lead.name}
                        </h3>
                        {lead.isRealWhatsApp && (
                          <span className="text-[11px] font-mono font-bold text-[#008069] shrink-0">
                            WA REAL
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate">
                        {lead.phone} · {lead.lastActivity}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
                        isHigh
                          ? 'bg-amber-50 text-amber-900 border-amber-300'
                          : lead.aiPriority === 'media'
                          ? 'bg-sky-50 text-sky-900 border-sky-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {isHigh
                        ? 'Prioridad Alta'
                        : lead.aiPriority === 'media'
                        ? 'Prioridad Media'
                        : 'Informativo'}
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded">
                      {CATEGORY_LABELS[lead.aiCategory || 'informativo'] ||
                        'General'}
                    </span>
                  </div>
                </div>

                {/* Secretary Summary Block */}
                <div className="p-3 rounded-lg bg-[#f8fafc] border border-slate-200/80 space-y-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Resumen de la Conversación
                    </p>
                    <p className="text-xs sm:text-[13px] font-medium text-slate-900 mt-0.5 leading-relaxed">
                      {lead.aiSummary}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 flex items-start gap-2">
                    {isHigh ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Calendar className="w-4 h-4 text-[#008069] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-[11px] font-bold text-slate-700">
                        Pendiente / Acción para {botConfig.ownerName || 'ti'}:
                      </p>
                      <p className="text-xs text-slate-800">
                        {lead.aiActionItem}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Last Real Message Preview */}
                {lastMsg && (
                  <p className="text-xs text-slate-600 truncate">
                    <strong className="text-slate-800">
                      {lastMsg.sender === 'customer'
                        ? `${lead.name.split(' ')[0]}:`
                        : lastMsg.sender === 'agent'
                        ? 'Tú:'
                        : `${botConfig.agentName}:`}
                    </strong>{' '}
                    {lastMsg.text}
                  </p>
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenLeadChat(lead.id)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Abrir Chat</span>
                  </button>

                  {currentRole !== 'solo_resumen' && (
                    <button
                      type="button"
                      onClick={() => onTriggerBotReplyNow(lead)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-[#008069] bg-[#e7fce3] hover:bg-[#d1f7c9] rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Responder con Secretaria</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleLeadBot(lead.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                      lead.botActive
                        ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                    title="Si hablas tú manualmente, la secretaria se pausa en este chat para no interrumpir"
                  >
                    {lead.botActive ? (
                      <>
                        <Bot className="w-3.5 h-3.5 text-[#008069]" />
                        <span>Secretaria ON</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-amber-700" />
                        <span>Modo Manual (Tú)</span>
                      </>
                    )}
                  </button>

                  {lead.aiPriority === 'alta' && (
                    <button
                      type="button"
                      onClick={() => onMarkTaskDone(lead.id)}
                      className="p-1.5 text-slate-500 hover:text-[#008069] rounded-lg border border-slate-200 hover:border-[#00a884]"
                      title="Marcar pendiente como resuelto"
                      aria-label="Marcar pendiente como resuelto"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
