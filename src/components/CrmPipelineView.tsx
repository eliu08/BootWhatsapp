import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle2, MessageSquare } from 'lucide-react';
import { BotConfig, CustomerLead, LeadStage } from '../types/sales';
import { calculateOrderSummary } from '../utils/salesEngine';

interface CrmPipelineViewProps {
  leads: CustomerLead[];
  botConfig: BotConfig;
  onChangeStage: (leadId: string, stage: LeadStage) => void;
  onOpenLeadChat: (leadId: string) => void;
}

const STAGES: { id: LeadStage; title: string; subtitle: string }[] = [
  { id: 'nuevo', title: '01. Nuevos Leads', subtitle: 'Primer mensaje recibido' },
  { id: 'interesado', title: '02. Interesados', subtitle: 'Viendo catálogo' },
  { id: 'cotizado', title: '03. Cotizados', subtitle: 'Con productos en carrito' },
  { id: 'negociacion', title: '04. En Cierre', subtitle: 'Cupón u objeción' },
  { id: 'pagado', title: '05. Pagados', subtitle: 'Venta concretada' },
];

export const CrmPipelineView: React.FC<CrmPipelineViewProps> = ({
  leads,
  botConfig,
  onChangeStage,
  onOpenLeadChat,
}) => {
  const [selectedStage, setSelectedStage] = useState<'all' | LeadStage>('all');

  const totalPipelineValue = leads.reduce((acc, lead) => {
    const calc = calculateOrderSummary(lead.cart, botConfig, lead.appliedCoupon);
    return acc + calc.total;
  }, 0);

  const closedRevenue = leads
    .filter((l) => l.stage === 'pagado')
    .reduce((acc, lead) => {
      const calc = calculateOrderSummary(lead.cart, botConfig, lead.appliedCoupon);
      return acc + calc.total;
    }, 0);

  const visibleLeads =
    selectedStage === 'all'
      ? leads
      : leads.filter((l) => l.stage === selectedStage);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Valor Total en Embudo</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {botConfig.currencySymbol}
            {totalPipelineValue}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {leads.length} conversaciones activas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Ventas Cerradas y Pagadas</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#008069] mt-1">
            {botConfig.currencySymbol}
            {closedRevenue}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {leads.filter((l) => l.stage === 'pagado').length} órdenes confirmadas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Automatización IA Activa</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {Math.round(
              (leads.filter((l) => l.botActive).length /
                Math.max(1, leads.length)) *
                100
            )}
            %
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Atendidos por {botConfig.agentName}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Cupón Comercial Activo</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {botConfig.activeCouponCode}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {botConfig.couponDiscountPercent}% OFF en cierre de objeciones
          </p>
        </div>
      </div>

      {/* Stage Filter Segmented Control */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Embudo de Clientes y Cotizaciones en WhatsApp
          </h2>
          <p className="text-xs text-slate-600">
            Gestiona la etapa de cada prospecto o abre su conversación directamente en el simulador.
          </p>
        </div>

        <div
          role="group"
          aria-label="Filtrar por etapa de embudo"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          <button
            type="button"
            onClick={() => setSelectedStage('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedStage === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos ({leads.length})
          </button>
          {STAGES.map((st) => {
            const count = leads.filter((l) => l.stage === st.id).length;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStage(st.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedStage === st.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.title.split('. ')[1]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* High-Density Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Cliente / WhatsApp</th>
                <th className="py-3 px-4">Ciudad</th>
                <th className="py-3 px-4">Productos en Carrito</th>
                <th className="py-3 px-4">Etapa del Embudo</th>
                <th className="py-3 px-4 text-right">Total Cotizado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleLeads.map((lead) => {
                const summary = calculateOrderSummary(
                  lead.cart,
                  botConfig,
                  lead.appliedCoupon
                );
                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full text-white font-semibold text-xs flex items-center justify-center shrink-0"
                          style={{ backgroundColor: lead.avatarColor }}
                        >
                          {lead.avatarInitials}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {lead.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">
                            {lead.phone}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600">{lead.city}</td>

                    <td className="py-3 px-4 text-slate-700">
                      {lead.cart.length === 0 ? (
                        <span className="text-slate-400">Sin productos aún</span>
                      ) : (
                        <div className="space-y-0.5">
                          {lead.cart.map((item) => (
                            <p key={item.productId} className="truncate max-w-xs">
                              <span className="font-mono tabular-nums font-semibold">
                                {item.quantity}x
                              </span>{' '}
                              {item.name}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <label htmlFor={`crm-stage-${lead.id}`} className="sr-only">
                        Cambiar etapa de {lead.name}
                      </label>
                      <select
                        id={`crm-stage-${lead.id}`}
                        value={lead.stage}
                        onChange={(e) =>
                          onChangeStage(lead.id, e.target.value as LeadStage)
                        }
                        className="px-2.5 py-1 text-xs font-medium bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                      >
                        <option value="nuevo">Nuevo Lead</option>
                        <option value="interesado">Interesado</option>
                        <option value="cotizado">Cotizado</option>
                        <option value="negociacion">En Cierre</option>
                        <option value="pagado">Pagado</option>
                      </select>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-900">
                        {botConfig.currencySymbol}
                        {summary.total}
                      </span>
                      {lead.appliedCoupon && (
                        <span className="block text-[10px] text-[#008069]">
                          Cupón {lead.appliedCoupon}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {lead.stage !== 'pagado' && (
                          <button
                            type="button"
                            onClick={() => onChangeStage(lead.id, 'pagado')}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#008069] bg-[#e7fce3] hover:bg-[#d1f7c9] rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Marcar Pagado</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenLeadChat(lead.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Abrir Chat</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
