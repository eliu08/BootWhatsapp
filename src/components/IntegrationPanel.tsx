import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
  Trash2,
  Unplug,
} from 'lucide-react';
import { BotConfig, Product } from '../types/sales';
import {
  buildWaMeDirectLink,
  calculateOrderSummary,
  formatOrderReceiptForRealWhatsApp,
  formatProductCardForRealWhatsApp,
  generateWhatsAppWebScript,
} from '../utils/salesEngine';

export interface GatewaySafetyConfig {
  ignoreGroups: boolean;
  onlyWhitelist: boolean;
  whitelistPhones: string[];
  allowSelfChat: boolean;
  globalBotAutoReply?: boolean;
  metaVerifyToken: string;
  metaPhoneNumberId: string;
}

export interface GatewayStatusState {
  connectionState:
    | 'disconnected'
    | 'connecting'
    | 'qr_ready'
    | 'connected'
    | 'error';
  statusDetail?: string | null;
  qrDataUrl: string | null;
  pairingCode: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastError: string | null;
  totalRealChatsCount?: number;
  totalBotRepliesSent?: number;
}

interface IntegrationPanelProps {
  products: Product[];
  botConfig: BotConfig;
  gatewayStatus: GatewayStatusState;
  safetyConfig: GatewaySafetyConfig;
  onUpdateSafetyConfig: (next: GatewaySafetyConfig) => void;
  onStartQrConnection: (pairingPhone?: string) => Promise<void>;
  onDisconnectWhatsApp: () => Promise<void>;
  onSendRealWhatsAppMessage: (
    phone: string,
    text: string
  ) => Promise<{ sentViaSocket: boolean; waMeUrl: string }>;
}

export const IntegrationPanel: React.FC<IntegrationPanelProps> = ({
  products,
  botConfig,
  gatewayStatus,
  safetyConfig,
  onUpdateSafetyConfig,
  onStartQrConnection,
  onDisconnectWhatsApp,
  onSendRealWhatsAppMessage,
}) => {
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [newWhitelistPhone, setNewWhitelistPhone] = useState('');
  const [whitelistError, setWhitelistError] = useState('');

  // Direct Real WhatsApp Test Launcher State
  const [testTargetPhone, setTestTargetPhone] = useState('+52 55 4829 1034');
  const [testTemplateType, setTestTemplateType] = useState<
    'product' | 'order' | 'catalog'
  >('product');
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id || ''
  );
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  // Code Exporter Tabs
  const [activeCodeTab, setActiveCodeTab] = useState<
    'userscript' | 'baileys' | 'webhook'
  >('userscript');
  const [copiedCode, setCopiedCode] = useState(false);

  const selectedProduct =
    products.find((p) => p.id === selectedProductId) || products[0];

  const getDirectTestMessage = (): string => {
    if (testTemplateType === 'product' && selectedProduct) {
      return formatProductCardForRealWhatsApp(selectedProduct, botConfig);
    }
    if (testTemplateType === 'order' && selectedProduct) {
      const summary = calculateOrderSummary(
        [
          {
            productId: selectedProduct.id,
            name: selectedProduct.name,
            price: selectedProduct.price,
            quantity: 1,
            sku: selectedProduct.sku,
          },
        ],
        botConfig,
        botConfig.activeCouponCode,
        'WV-REAL-01'
      );
      return formatOrderReceiptForRealWhatsApp(summary, botConfig);
    }
    const listLines = products
      .map(
        (p) =>
          `• *${p.name}* (${p.sku}): *${botConfig.currencySymbol}${p.price}*`
      )
      .join('\n');
    return `¡Hola! 👋 Bienvenido a *${botConfig.businessName}*.\n\nCatálogo oficial con stock inmediato:\n${listLines}\n\n🎁 Usa el cupón *${botConfig.activeCouponCode}* para un *${botConfig.couponDiscountPercent}% OFF* y envío gratis desde ${botConfig.currencySymbol}${botConfig.freeShippingThreshold}.`;
  };

  const previewText = getDirectTestMessage();
  const waMeHref = buildWaMeDirectLink(testTargetPhone, previewText);

  const originUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';

  const { userscript, baileysCode } = generateWhatsAppWebScript(
    products,
    botConfig,
    originUrl
  );

  const webhookGuide = `# Webhook Oficial para WhatsApp Business Cloud API (Meta for Developers)

URL de Callback (pegar en Panel de Meta > WhatsApp > Configuración):
${originUrl}/api/webhook/whatsapp

Token de verificación (Verify Token):
${safetyConfig.metaVerifyToken}

Eventos a suscribir:
messages (v21.0)`;

  const currentCodeContent =
    activeCodeTab === 'userscript'
      ? userscript
      : activeCodeTab === 'baileys'
      ? baileysCode
      : webhookGuide;

  const handleAddWhitelistPhone = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newWhitelistPhone.trim();
    if (cleaned.replace(/\D/g, '').length < 8) {
      setWhitelistError(
        'Ingresa un número válido con código de país (mínimo 8 dígitos).'
      );
      return;
    }
    if (!safetyConfig.whitelistPhones.includes(cleaned)) {
      onUpdateSafetyConfig({
        ...safetyConfig,
        whitelistPhones: [...safetyConfig.whitelistPhones, cleaned],
      });
    }
    setNewWhitelistPhone('');
    setWhitelistError('');
  };

  const handleRemoveWhitelistPhone = (phoneToRemove: string) => {
    onUpdateSafetyConfig({
      ...safetyConfig,
      whitelistPhones: safetyConfig.whitelistPhones.filter(
        (p) => p !== phoneToRemove
      ),
    });
  };

  const handleSendViaActiveSocket = async () => {
    setDispatchStatus('Enviando mensaje al socket de WhatsApp...');
    const res = await onSendRealWhatsAppMessage(testTargetPhone, previewText);
    if (res.sentViaSocket) {
      setDispatchStatus(
        '¡Mensaje enviado directamente por el socket vinculado de WhatsApp!'
      );
    } else {
      setDispatchStatus(
        'Tu WhatsApp aún no está vinculado por QR. Usa el botón "Abrir en WhatsApp Real (wa.me)" de al lado o vincula el QR arriba.'
      );
    }
    setTimeout(() => setDispatchStatus(null), 5000);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCodeContent);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* TOP ROW: QR/PAIRING CONNECTION + PRODUCTION SAFETY SHIELD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Real WhatsApp Web QR & Pairing Code Linker */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  01. Vincular tu WhatsApp Real (Dispositivos Vinculados)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Conecta tu sesión mediante el protocolo oficial de WhatsApp Web (Baileys Multi-Device) escaneando el código QR o con código numérico.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-[#008069] shrink-0">
                {gatewayStatus.connectionState === 'connected'
                  ? `CONECTADO (+${gatewayStatus.connectedPhone})`
                  : gatewayStatus.connectionState === 'qr_ready'
                  ? 'QR LISTO'
                  : gatewayStatus.connectionState === 'connecting'
                  ? 'CONECTANDO...'
                  : 'DESCONECTADO'}
              </span>
            </div>

            {/* QR Canvas or Connected Status */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-5">
              <div className="w-48 h-48 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 p-2 shadow-2xs">
                {gatewayStatus.connectionState === 'connected' ? (
                  <div className="text-center p-3 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-[#e7fce3] text-[#008069] flex items-center justify-center mx-auto">
                      <Check className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-900">
                      WhatsApp Vinculado
                    </p>
                    <p className="text-[11px] font-mono text-slate-600">
                      +{gatewayStatus.connectedPhone}
                    </p>
                  </div>
                ) : gatewayStatus.qrDataUrl ? (
                  <img
                    src={gatewayStatus.qrDataUrl}
                    alt="Código QR oficial de WhatsApp Web"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-center p-3 space-y-2 text-slate-400">
                    <QrCode className="w-12 h-12 mx-auto stroke-1" />
                    <p className="text-[11px] text-slate-500">
                      Haz clic en <strong>Generar QR en Vivo</strong> para iniciar sesión.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 text-xs">
                <p className="font-semibold text-slate-900">
                  Pasos para conectar tu celular:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                  <li>Abre WhatsApp en tu teléfono.</li>
                  <li>
                    Toca <strong>Menú (⋮)</strong> o <strong>Configuración</strong> y selecciona <strong>Dispositivos vinculados</strong>.
                  </li>
                  <li>
                    Toca <strong>Vincular un dispositivo</strong> y apunta al código QR de la izquierda.
                  </li>
                </ol>

                {gatewayStatus.statusDetail && (
                  <p className="text-xs font-medium text-[#008069] bg-[#e7fce3] px-2.5 py-2 rounded-lg border border-[#00a884]/30">
                    {gatewayStatus.statusDetail}
                  </p>
                )}

                {gatewayStatus.pairingCode && (
                  <div className="p-2.5 bg-[#e7fce3] border border-[#00a884]/40 rounded-lg">
                    <p className="text-[11px] text-[#008069] font-medium">
                      Código de vinculación de 8 dígitos:
                    </p>
                    <p className="text-base font-mono font-bold tracking-widest text-slate-900 mt-0.5">
                      {gatewayStatus.pairingCode}
                    </p>
                  </div>
                )}

                {gatewayStatus.lastError && (
                  <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                    {gatewayStatus.lastError}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onStartQrConnection()}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>
                      {gatewayStatus.qrDataUrl
                        ? 'Actualizar Código QR'
                        : 'Generar QR en Vivo'}
                    </span>
                  </button>

                  {gatewayStatus.connectionState !== 'disconnected' && (
                    <button
                      type="button"
                      onClick={() => onDisconnectWhatsApp()}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Unplug className="w-3.5 h-3.5" />
                      <span>Desconectar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pairing Code by Phone Alternative */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div className="flex-1">
              <label htmlFor="pairing-phone-input" className="sr-only">
                Vincular con número de teléfono en lugar de QR
              </label>
              <input
                id="pairing-phone-input"
                type="text"
                value={pairingPhoneInput}
                onChange={(e) => setPairingPhoneInput(e.target.value)}
                placeholder="¿Sin cámara? Ingresa tu número (ej. +52 55 1234 5678)"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                pairingPhoneInput.trim() &&
                onStartQrConnection(pairingPhoneInput.trim())
              }
              className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Pedir Código de 8 Dígitos</span>
            </button>
          </div>
        </div>

        {/* Column 2: Production Safety Shield */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#e7fce3] text-[#008069] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  02. Escudo de Seguridad para tu WhatsApp Personal
                </h2>
                <p className="text-xs text-slate-600">
                  Evita que el bot responda por accidente a tus grupos personales o contactos familiares mientras pruebas.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900">
                  Ignorar todos los Grupos y Estados de WhatsApp
                </p>
                <p className="text-[11px] text-slate-500">
                  Bloquea respuestas en grupos (@g.us) y listas de difusión.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyConfig.ignoreGroups}
                onChange={(e) =>
                  onUpdateSafetyConfig({
                    ...safetyConfig,
                    ignoreGroups: e.target.checked,
                  })
                }
                className="rounded text-[#00a884] focus:ring-[#00a884] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900">
                  Modo Lista Blanca (Responder solo a números autorizados)
                </p>
                <p className="text-[11px] text-slate-500">
                  Si está activo, el bot solo contestará a los teléfonos listados abajo.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyConfig.onlyWhitelist}
                onChange={(e) =>
                  onUpdateSafetyConfig({
                    ...safetyConfig,
                    onlyWhitelist: e.target.checked,
                  })
                }
                className="rounded text-[#00a884] focus:ring-[#00a884] w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900">
                  Permitir auto-prueba enviándote mensajes a ti mismo
                </p>
                <p className="text-[11px] text-slate-500">
                  Permite probar el bot escribiendo desde tu propio chat en WhatsApp.
                </p>
              </div>
              <input
                type="checkbox"
                checked={safetyConfig.allowSelfChat}
                onChange={(e) =>
                  onUpdateSafetyConfig({
                    ...safetyConfig,
                    allowSelfChat: e.target.checked,
                  })
                }
                className="rounded text-[#00a884] focus:ring-[#00a884] w-4 h-4"
              />
            </label>
          </div>

          {/* Whitelist Phone Manager */}
          <div className="pt-2 space-y-2.5">
            <p className="text-xs font-bold text-slate-900">
              Números Autorizados en Lista Blanca ({safetyConfig.whitelistPhones.length})
            </p>

            <form
              onSubmit={handleAddWhitelistPhone}
              className="flex items-center gap-2"
            >
              <label htmlFor="whitelist-phone-input" className="sr-only">
                Agregar número de teléfono a lista blanca
              </label>
              <input
                id="whitelist-phone-input"
                type="text"
                value={newWhitelistPhone}
                onChange={(e) => {
                  setNewWhitelistPhone(e.target.value);
                  setWhitelistError('');
                }}
                placeholder="Ej. +54 9 11 6204 8819"
                className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Autorizar Número</span>
              </button>
            </form>

            {whitelistError && (
              <p className="text-xs text-red-600 font-medium">
                {whitelistError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {safetyConfig.whitelistPhones.map((phone) => (
                <div
                  key={phone}
                  className="inline-flex items-center gap-2 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-mono text-slate-800"
                >
                  <span>{phone}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveWhitelistPhone(phone)}
                    aria-label={`Quitar número autorizado ${phone}`}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: REAL WHATSAPP DIRECT TESTER + USERSCRIPT / WEBHOOK CODE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Direct Real WhatsApp Message Launcher */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              03. Probar Envío Real a tu WhatsApp Ahora Mismo
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Envía una ficha de catálogo o recibo de compra real a tu teléfono mediante el socket vinculado o abriendo WhatsApp directo (`wa.me`).
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="test-target-phone"
                className="block font-medium text-slate-700 mb-1"
              >
                Tu Número de WhatsApp Real (con código de país)
              </label>
              <input
                id="test-target-phone"
                type="text"
                value={testTargetPhone}
                onChange={(e) => setTestTargetPhone(e.target.value)}
                placeholder="+52 55 4829 1034"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="test-template-type"
                  className="block font-medium text-slate-700 mb-1"
                >
                  Tipo de Mensaje Comercial
                </label>
                <select
                  id="test-template-type"
                  value={testTemplateType}
                  onChange={(e) =>
                    setTestTemplateType(
                      e.target.value as 'product' | 'order' | 'catalog'
                    )
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                >
                  <option value="product">Ficha de Producto con Oferta</option>
                  <option value="order">Orden de Compra con Cupón</option>
                  <option value="catalog">Resumen de Catálogo Completo</option>
                </select>
              </div>

              {testTemplateType !== 'catalog' && (
                <div>
                  <label
                    htmlFor="test-product-select"
                    className="block font-medium text-slate-700 mb-1"
                  >
                    Producto del Catálogo
                  </label>
                  <select
                    id="test-product-select"
                    value={selectedProduct?.id || ''}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({botConfig.currencySymbol}
                        {p.price})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <p className="font-medium text-slate-700 mb-1">
                Vista previa del mensaje real de WhatsApp:
              </p>
              <pre className="p-3 rounded-lg bg-[#d9fdd3]/60 border border-[#00a884]/30 text-xs font-sans whitespace-pre-wrap text-slate-900 max-h-44 overflow-y-auto">
                {previewText}
              </pre>
            </div>

            {dispatchStatus && (
              <p className="text-xs font-medium text-[#008069] bg-[#e7fce3] p-2.5 rounded-lg">
                {dispatchStatus}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSendViaActiveSocket}
                className="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar por Socket Servidor</span>
              </button>

              <a
                href={waMeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span>Abrir en mi WhatsApp (wa.me)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Column 2: Browser Userscript Injector, Webhook & Baileys Standalone */}
        <div className="lg:col-span-7 bg-slate-900 text-slate-100 rounded-xl overflow-hidden flex flex-col border border-slate-800">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Seleccionar método de código de producción"
              className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800"
            >
              <button
                type="button"
                onClick={() => setActiveCodeTab('userscript')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeCodeTab === 'userscript'
                    ? 'bg-[#00a884] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Inyector web.whatsapp.com</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCodeTab('webhook')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeCodeTab === 'webhook'
                    ? 'bg-[#00a884] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Webhook Meta Cloud API</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCodeTab('baileys')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeCodeTab === 'baileys'
                    ? 'bg-[#00a884] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>CLI Node.js</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Código Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed flex-1 max-h-[420px]">
            <code>{currentCodeContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
