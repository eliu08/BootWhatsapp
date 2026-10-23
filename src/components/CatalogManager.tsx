import React, { useState } from 'react';
import { Plus, Search, Send, Trash2 } from 'lucide-react';
import { Product, ProductVisualType } from '../types/sales';
import { ProductVisual } from './ProductVisual';

interface CatalogManagerProps {
  products: Product[];
  currencySymbol: string;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProductPriceStock: (
    productId: string,
    price: number,
    stock: number
  ) => void;
  onDeleteProduct: (productId: string) => void;
  onSendProductToActiveChat: (product: Product) => void;
}

export const CatalogManager: React.FC<CatalogManagerProps> = ({
  products,
  currencySymbol,
  onAddProduct,
  onUpdateProductPriceStock,
  onDeleteProduct,
  onSendProductToActiveChat,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todos');
  const [showAddModal, setShowAddModal] = useState(false);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<Product['category']>('Audio');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [stock, setStock] = useState('20');
  const [description, setDescription] = useState('');
  const [visualType, setVisualType] = useState<ProductVisualType>('headphones');
  const [formError, setFormError] = useState('');

  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      categoryFilter === 'Todos' || p.category === categoryFilter;
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (!name.trim() || !sku.trim() || !numericPrice || numericPrice <= 0) {
      setFormError(
        'Completa nombre, código SKU y un precio válido mayor a cero.'
      );
      return;
    }

    onAddProduct({
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      category,
      price: numericPrice,
      originalPrice: originalPrice ? Number(originalPrice) : undefined,
      stock: Number.isNaN(numericStock) ? 15 : numericStock,
      description:
        description.trim() ||
        'Producto oficial con envío inmediato y garantía escrita.',
      highlights: ['Despacho 24hs', 'Garantía Oficial'],
      visualType,
      warrantyMonths: 12,
    });

    setName('');
    setSku('');
    setPrice('');
    setOriginalPrice('');
    setStock('20');
    setDescription('');
    setFormError('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Catálogo Sincronizado con el Bot de Ventas
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Cada cambio de precio o stock impacta al instante en las respuestas automáticas y cotizaciones de WhatsApp Web.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal((prev) => !prev)}
          className="px-4 py-2.5 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Producto al Catálogo</span>
        </button>
      </div>

      {/* New Product Form */}
      {showAddModal && (
        <form
          onSubmit={handleCreateProduct}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Nuevo Producto para Venta en WhatsApp
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setFormError('');
              }}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cerrar formulario
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="prod-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nombre Comercial *
              </label>
              <input
                id="prod-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFormError('');
                }}
                placeholder="Ej. Micrófono Podcast USB-C"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div>
              <label
                htmlFor="prod-sku"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Código SKU *
              </label>
              <input
                id="prod-sku"
                type="text"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setFormError('');
                }}
                placeholder="Ej. MIC-PRO-09"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div>
              <label
                htmlFor="prod-category"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Categoría
              </label>
              <select
                id="prod-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Product['category'])
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              >
                <option value="Audio">Audio</option>
                <option value="Wearables">Wearables</option>
                <option value="Hogar">Hogar</option>
                <option value="Accesorios">Accesorios</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="prod-visual"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Ilustración de Ficha
              </label>
              <select
                id="prod-visual"
                value={visualType}
                onChange={(e) =>
                  setVisualType(e.target.value as ProductVisualType)
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              >
                <option value="headphones">Auriculares Studio</option>
                <option value="smartwatch">Smartwatch Ultra</option>
                <option value="espresso">Cafetera Barista</option>
                <option value="keyboard">Teclado Mecánico</option>
                <option value="speaker">Parlante 360</option>
                <option value="backpack">Mochila Ejecutiva</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="prod-price"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Precio de Venta ({currencySymbol}) *
              </label>
              <input
                id="prod-price"
                type="number"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setFormError('');
                }}
                placeholder="129"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div>
              <label
                htmlFor="prod-orig-price"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Precio Anterior ({currencySymbol})
              </label>
              <input
                id="prod-orig-price"
                type="number"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="159"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div>
              <label
                htmlFor="prod-stock"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Unidades en Stock
              </label>
              <input
                id="prod-stock"
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <div>
              <label
                htmlFor="prod-desc"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Argumento Comercial para el Bot
              </label>
              <input
                id="prod-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beneficio clave que dirá el bot..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs font-medium text-red-600">{formError}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Guardar en Catálogo
            </button>
          </div>
        </form>
      )}

      {/* Search & Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="catalog-search" className="sr-only">
            Buscar producto en catálogo
          </label>
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="catalog-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nombre, SKU o beneficio..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar categoría de productos"
          className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
        >
          {['Todos', 'Audio', 'Wearables', 'Hogar', 'Accesorios'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === cat
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
          >
            <div>
              <ProductVisual
                visualType={product.visualType}
                className="w-full h-36"
              />
              <div className="p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                  <span>
                    {product.category} · {product.sku}
                  </span>
                  <span>Stock: {product.stock} uds</span>
                </div>

                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <h3 className="text-base font-bold text-slate-900">
                    {product.name}
                  </h3>
                  <div className="flex items-baseline gap-1.5 shrink-0 font-mono tabular-nums">
                    {product.originalPrice && (
                      <span className="text-xs text-slate-400 line-through">
                        {currencySymbol}
                        {product.originalPrice}
                      </span>
                    )}
                    <span className="text-base font-bold text-[#008069]">
                      {currencySymbol}
                      {product.price}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  {product.description}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Ajuste rápido stock:</span>
                  <div className="flex items-center gap-1.5 font-mono tabular-nums">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProductPriceStock(
                          product.id,
                          product.price,
                          Math.max(0, product.stock - 1)
                        )
                      }
                      aria-label={`Reducir stock de ${product.name}`}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                    >
                      -1
                    </button>
                    <span className="w-7 text-center font-semibold text-slate-900">
                      {product.stock}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProductPriceStock(
                          product.id,
                          product.price,
                          product.stock + 1
                        )
                      }
                      aria-label={`Aumentar stock de ${product.name}`}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onSendProductToActiveChat(product)}
                className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar al Chat Activo</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteProduct(product.id)}
                aria-label={`Eliminar ${product.name}`}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
