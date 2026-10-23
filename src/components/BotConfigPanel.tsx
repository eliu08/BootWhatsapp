import React, { useState } from 'react';
import { Bot, Check, Plus, Sparkles, Trash2 } from 'lucide-react';
import { AutomatedRule, BotConfig } from '../types/sales';

interface BotConfigPanelProps {
  botConfig: BotConfig;
  onUpdateBotConfig: (updated: BotConfig) => void;
}

export const BotConfigPanel: React.FC<BotConfigPanelProps> = ({
  botConfig,
  onUpdateBotConfig,
}) => {
  const [savedToast, setSavedToast] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleResponse, setNewRuleResponse] = useState('');
  const [newRuleAttachCatalog, setNewRuleAttachCatalog] = useState(false);

  const handleFieldChange = <K extends keyof BotConfig>(
    key: K,
    value: BotConfig[K]
  ) => {
    onUpdateBotConfig({
      ...botConfig,
      [key]: value,
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  const handleToggleRule = (ruleId: string) => {
    const updatedRules = botConfig.rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    handleFieldChange('rules', updatedRules);
  };

  const handleDeleteRule = (ruleId: string) => {
    const updatedRules = botConfig.rules.filter((r) => r.id !== ruleId);
    handleFieldChange('rules', updatedRules);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim() || !newRuleKeywords.trim() || !newRuleResponse.trim()) {
      return;
    }

    const created: AutomatedRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName.trim(),
      triggerKeywords: newRuleKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      actionDescription: 'Respuesta automática personalizada',
      responseTemplate: newRuleResponse.trim(),
      attachCatalog: newRuleAttachCatalog,
      enabled: true,
    };

    handleFieldChange('rules', [...botConfig.rules, created]);
    setNewRuleName('');
    setNewRuleKeywords('');
    setNewRuleResponse('');
    setNewRuleAttachCatalog(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Core Sales Brain */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#e7fce3] text-[#008069] flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Configuración de tu Secretaria IA y Negocio
              </h2>
              <p className="text-xs text-slate-600">
                Personaliza cómo te asiste tu secretaria en WhatsApp, a quién reporta y qué información maneja.
              </p>
            </div>
          </div>

          {savedToast && (
            <span className="text-xs font-medium text-[#008069] flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Sincronizado</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="cfg-owner-name"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Tu Nombre (A quién reporta la Secretaria)
            </label>
            <input
              id="cfg-owner-name"
              type="text"
              placeholder="Ej. Ezequiel"
              value={botConfig.ownerName || ''}
              onChange={(e) => handleFieldChange('ownerName', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>

          <div>
            <label
              htmlFor="cfg-business-name"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Nombre de tu Empresa / Negocio
            </label>
            <input
              id="cfg-business-name"
              type="text"
              value={botConfig.businessName}
              onChange={(e) =>
                handleFieldChange('businessName', e.target.value)
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>

          <div>
            <label
              htmlFor="cfg-agent-name"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Nombre de tu Secretaria / Asistente
            </label>
            <input
              id="cfg-agent-name"
              type="text"
              value={botConfig.agentName}
              onChange={(e) => handleFieldChange('agentName', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>

          <div>
            <label
              htmlFor="cfg-assistant-role"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Modo Principal de Operación
            </label>
            <select
              id="cfg-assistant-role"
              value={botConfig.assistantRole || 'secretaria'}
              onChange={(e) =>
                handleFieldChange(
                  'assistantRole',
                  e.target.value as BotConfig['assistantRole']
                )
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="secretaria">
                Secretaria Personal (Responde natural 1-2 líneas + Resume chats)
              </option>
              <option value="solo_resumen">
                Solo Resumen Silencioso (No responde en WhatsApp, solo resume)
              </option>
              <option value="ventas">
                Vendedora Comercial (Ofrece catálogo, precios y cupones)
              </option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="cfg-secretary-instructions"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Instrucciones para tu Secretaria (Horarios, a qué te dedicas, cómo filtrar mensajes)
          </label>
          <textarea
            id="cfg-secretary-instructions"
            rows={3}
            placeholder="Ej. Atiendo de 9am a 6pm. Si un cliente pide soporte técnico o cotización de sistemas, pregúntale qué equipo necesita y dile que Ezequiel le responde en breve..."
            value={botConfig.secretaryInstructions || ''}
            onChange={(e) =>
              handleFieldChange('secretaryInstructions', e.target.value)
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="cfg-currency-symbol"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Moneda del Negocio
            </label>
            <select
              id="cfg-currency-symbol"
              value={botConfig.currencySymbol || 'RD$'}
              onChange={(e) =>
                handleFieldChange('currencySymbol', e.target.value)
              }
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="RD$">RD$ · Peso Dominicano (Rep. Dom.)</option>
              <option value="US$">US$ · Dólar Estadounidense</option>
              <option value="$">$ · Peso / Dólar General</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="cfg-coupon-code"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Código de Descuento (Modo Ventas)
            </label>
            <input
              id="cfg-coupon-code"
              type="text"
              value={botConfig.activeCouponCode}
              onChange={(e) =>
                handleFieldChange(
                  'activeCouponCode',
                  e.target.value.toUpperCase()
                )
              }
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>

          <div>
            <label
              htmlFor="cfg-tone"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Tono de Conversación
            </label>
            <select
              id="cfg-tone"
              value={botConfig.tone}
              onChange={(e) =>
                handleFieldChange('tone', e.target.value as BotConfig['tone'])
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="consultivo">
                Cálido, Humano y Ejecutivo (Como una persona real)
              </option>
              <option value="directo">
                Breve y Directo (1 sola oración al grano)
              </option>
              <option value="persuasivo">
                Comercial y Enfocado a Ventas
              </option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="cfg-welcome"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Saludo Inicial de Referencia (Variables: {'{nombre}'}, {'{negocio}'}, {'{agente}'})
          </label>
          <textarea
            id="cfg-welcome"
            rows={2}
            value={botConfig.welcomeMessage}
            onChange={(e) =>
              handleFieldChange('welcomeMessage', e.target.value)
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          />
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={botConfig.autoSendProductCards}
              onChange={(e) =>
                handleFieldChange('autoSendProductCards', e.target.checked)
              }
              className="rounded text-[#00a884] focus:ring-[#00a884]"
            />
            <span>Adjuntar fichas de catálogo automáticamente (Solo en Modo Ventas)</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={botConfig.autoQualifyLeadStage}
              onChange={(e) =>
                handleFieldChange('autoQualifyLeadStage', e.target.checked)
              }
              className="rounded text-[#00a884] focus:ring-[#00a884]"
            />
            <span>Avanzar etapa del cliente en el CRM automáticamente</span>
          </label>
        </div>
      </div>

      {/* Right Column: Continuous Learned Memory & Keyword Triggers */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Sparkles className="w-4 h-4 text-[#008069]" />
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Memoria Aprendida de tus Respuestas ({botConfig.currencySymbol || 'RD$'})
            </h3>
            <p className="text-xs text-slate-600">
              Servicios, artículos y precios en {botConfig.currencySymbol || 'RD$'} que la secretaria aprendió cuando tú respondiste un chat.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {(botConfig.learnedKnowledge || []).length === 0 ? (
            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
              Aún no hay respuestas aprendidas. Cuando respondas una pregunta nueva en un chat (ej. &quot;Sí, hacemos currículo en RD$ 350&quot;), aparecerá aquí automáticamente.
            </p>
          ) : (
            (botConfig.learnedKnowledge || []).map((fact) => (
              <div
                key={fact.id}
                className="p-3 rounded-lg border border-slate-200 bg-[#f8fafc] space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {fact.learnedFact}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleFieldChange(
                        'learnedKnowledge',
                        (botConfig.learnedKnowledge || []).filter(
                          (item) => item.id !== fact.id
                        )
                      )
                    }
                    className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                    title="Eliminar de la memoria"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>Palabras: {fact.keywords.slice(0, 5).join(', ')}</span>
                  {fact.priceRd && (
                    <span className="font-bold text-[#008069]">
                      RD$ {fact.priceRd.toLocaleString('en-US')}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 space-y-3">
          <h4 className="text-xs font-bold text-slate-900">
            Disparadores Fijos por Palabra Clave
          </h4>
          {botConfig.rules.map((rule) => (
            <div
              key={rule.id}
              className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {rule.name}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleRule(rule.id)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                      rule.enabled
                        ? 'bg-[#e7fce3] text-[#008069] border-[#00a884]/30'
                        : 'bg-white text-slate-500 border-slate-300'
                    }`}
                  >
                    {rule.enabled ? 'Activa' : 'Pausada'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    aria-label={`Eliminar regla ${rule.name}`}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[11px] font-mono text-slate-600">
                Palabras clave: {rule.triggerKeywords.join(' · ')}
              </p>
              <p className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-200/80">
                {rule.responseTemplate}
              </p>
            </div>
          ))}
        </div>

        {/* Add New Trigger Form */}
        <form
          onSubmit={handleAddRule}
          className="pt-4 border-t border-slate-200 space-y-3"
        >
          <h4 className="text-xs font-bold text-slate-900">
            Agregar nueva regla automática
          </h4>
          <div>
            <label htmlFor="rule-name" className="sr-only">
              Nombre de la regla
            </label>
            <input
              id="rule-name"
              type="text"
              placeholder="Título (ej. Consulta de Horarios / Sucursal)"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>
          <div>
            <label htmlFor="rule-keywords" className="sr-only">
              Palabras clave separadas por coma
            </label>
            <input
              id="rule-keywords"
              type="text"
              placeholder="Palabras separadas por coma (ej. horario, direccion, local)"
              value={newRuleKeywords}
              onChange={(e) => setNewRuleKeywords(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>
          <div>
            <label htmlFor="rule-response" className="sr-only">
              Respuesta del bot
            </label>
            <textarea
              id="rule-response"
              rows={2}
              placeholder="Respuesta que enviará el bot (puedes usar {nombre} y {cupon})..."
              value={newRuleResponse}
              onChange={(e) => setNewRuleResponse(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={newRuleAttachCatalog}
                onChange={(e) => setNewRuleAttachCatalog(e.target.checked)}
                className="rounded text-[#00a884]"
              />
              <span>Adjuntar catálogo</span>
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Regla</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

