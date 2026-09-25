import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  Boxes,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Footprints,
  Sparkles,
  Upload,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { parseBrandPrefix, generateSku } from '../../utils/sku.ts';
import { BrandLogo } from '../common/BrandLogo.tsx';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';

interface BrandManagementProps {
  currentUser: any;
  companySettings?: any;
  onNavigateToInventory?: (brandId?: number) => void;
}

export const BrandManagement: React.FC<BrandManagementProps> = ({
  currentUser,
  companySettings: _companySettings,
  onNavigateToInventory,
}) => {
  const [brands, setBrands] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<{ id: number; name: string; logo?: string } | null>(null);
  const [brandNameInput, setBrandNameInput] = useState('');
  const [brandLogoInput, setBrandLogoInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete confirmation modal
  const [deletingBrand, setDeletingBrand] = useState<{ id: number; name: string; logo?: string; productCount: number } | null>(null);

  const userRole = (currentUser?.role || '').toLowerCase();
  const isCashier = userRole === 'cashier';
  const isAdmin = !isCashier && (userRole === 'admin' || userRole === 'manager');

  useEffect(() => {
    loadData();
  }, []);

  // Auto-dismiss feedback after 4 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const isRefreshingRef = useRef(false);

  const loadData = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsLoading(true);
    try {
      const brandsRes = await api.brandCategory.getBrands();
      setBrands(brandsRes.brands || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Failed to load shoe brands: ' + (err.message || err) });
    } finally {
      isRefreshingRef.current = false;
      setIsLoading(false);
      triggerStatRecount();
    }
  };

  const openAddModal = () => {
    setBrandNameInput('');
    setBrandLogoInput('');
    setEditingBrand(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (brand: any) => {
    setEditingBrand({ id: brand.id, name: brand.name, logo: brand.logo || '' });
    setBrandNameInput(brand.name);
    setBrandLogoInput(brand.logo || '');
    setIsAddModalOpen(true);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = brandNameInput.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Brand name cannot be empty.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const trimmedLogo = brandLogoInput.trim();
      if (editingBrand) {
        await api.brandCategory.updateBrand(editingBrand.id, trimmed, trimmedLogo);
        setFeedback({ type: 'success', message: `Brand "${trimmed}" updated successfully!` });
      } else {
        await api.brandCategory.createBrand(trimmed, trimmedLogo);
        setFeedback({ type: 'success', message: `Brand "${trimmed}" added to store!` });
      }

      setIsAddModalOpen(false);
      setBrandNameInput('');
      setBrandLogoInput('');
      setEditingBrand(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBrand) return;
    setIsSubmitting(true);
    try {
      await api.brandCategory.deleteBrand(deletingBrand.id);
      setFeedback({ type: 'success', message: `Brand "${deletingBrand.name}" removed.` });
      setDeletingBrand(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete brand.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items
  const filteredBrands = brands.filter((b) => {
    const term = searchTerm.toLowerCase().trim();
    const prefix = parseBrandPrefix(b.name).toLowerCase();
    return b.name.toLowerCase().includes(term) || prefix.includes(term);
  });

  const totalBrandProducts = brands.reduce((acc, b) => acc + (Number(b.product_count) || 0), 0);
  const totalBrandUnits = brands.reduce((acc, b) => acc + (Number(b.total_units) || 0), 0);

  // Live preview for modal
  const previewPrefix = parseBrandPrefix(brandNameInput || 'Nike');
  const previewSku = generateSku(previewPrefix, 'SP-0001', 1);

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC] dark:bg-[#0A0E1A] text-slate-800 dark:text-slate-100 transition-colors select-none">
      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-bold">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-lg transition text-slate-500 dark:text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Action Controls */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs dark:shadow-lg dark:shadow-purple-950/40 text-slate-900 dark:text-white"
      >
        <div>
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 rounded-xl border border-blue-100 dark:border-purple-400/30 shadow-2xs">
              <Tag className="w-5 h-5 stroke-[2.2]" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Shoe Brand Management
                </h1>
                <span className="bg-blue-100 dark:bg-purple-500/30 text-blue-700 dark:text-purple-200 border border-blue-200 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wide">
                  Brand Prefixes &amp; SKU Lines
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 mt-0.5">
                Organize footwear manufacturers and brand lines with their automatic 3-letter SKU prefix codes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadData}
            title={isLoading ? "Refreshing brands..." : "Refresh list"}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] text-xs font-semibold active:scale-[0.98] cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-purple-300 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {isAdmin && !isCashier && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white text-xs font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] active:scale-[0.98] cursor-pointer transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add New Brand</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Summary KPI Cards matching Dashboard theme */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Registered Shoe Brands */}
        <StatCard
          layout="horizontal"
          title="Registered Shoe Brands"
          value={brands.length}
          icon={Tag}
          iconColor="blue"
          loading={isLoading}
          delay={0}
          duration={1200}
          subtext={<span className="text-slate-400 dark:text-slate-500">Footwear manufacturers</span>}
        />

        {/* Card 2: Active Shoe Models Linked */}
        <StatCard
          layout="horizontal"
          title="Active Shoe Models Linked"
          value={totalBrandProducts}
          icon={Boxes}
          iconColor="purple"
          loading={isLoading}
          delay={0}
          duration={1200}
          subtext={<span className="text-slate-400 dark:text-slate-500">Catalog footwear items</span>}
        />

        {/* Card 3: Total Units in Physical Stock */}
        <StatCard
          layout="horizontal"
          title="Total Units in Physical Stock"
          value={totalBrandUnits}
          icon={Footprints}
          iconColor="cyan"
          loading={isLoading}
          delay={0}
          duration={1200}
          subtext={<span className="text-slate-400 dark:text-slate-500">Pairs available on shelf</span>}
        />
      </div>

      {/* Brands Table Container */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="bg-white dark:bg-[#0E1628] rounded-2xl border border-slate-200/90 dark:border-purple-800/60 shadow-xs overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-purple-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-200 dark:border-purple-400/30 rounded-xl shadow-2xs">
              <Tag className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700 dark:text-white uppercase tracking-wider">
                All Brands
              </span>
              <span className="bg-slate-200/80 dark:bg-purple-500/30 text-slate-700 dark:text-purple-200 border border-slate-300 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center">
                {isLoading ? '...' : brands.length}
              </span>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 dark:text-purple-300/80 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search brand name or prefix..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-purple-950/40 text-slate-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/50 border border-slate-200 dark:border-purple-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-purple-500/40 focus:border-blue-500 dark:focus:border-purple-400 dark:focus:bg-purple-950/70 transition shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:text-purple-300 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0B1120] border-b border-slate-200 dark:border-[#1A263D] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-16 text-center">Logo</th>
                <th className="py-3 px-4">Brand Name</th>
                <th className="py-3 px-4 text-center">SKU Prefix (3-Letter)</th>
                <th className="py-3 px-4 text-center">Shoe Models</th>
                <th className="py-3 px-4 text-center">Stock In Hand</th>
                <th className="py-3 px-4">Catalog Action</th>
                {isAdmin && <th className="py-3 px-4 text-right">Manage</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1A263D]">
              {isLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                      <p className="font-medium text-xs">Loading shoe brands directory...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredBrands.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <Tag className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">No shoe brands found</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      {searchTerm ? 'Try a different search keyword.' : 'Click "Add New Brand" to register your first brand.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBrands.map((brand) => {
                  const productCount = Number(brand.product_count) || 0;
                  const totalUnits = Number(brand.total_units) || 0;
                  const prefix = parseBrandPrefix(brand.name);
                  const exampleSku = generateSku(prefix, 'SP-0001', 1);

                  return (
                    <tr key={brand.id} className="hover:bg-slate-50/80 dark:hover:bg-[#131D33] transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center">
                          <BrandLogo logo={brand.logo} name={brand.name} size="md" />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{brand.name}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">ID #{brand.id}</div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border border-blue-200/80 dark:border-cyan-500/30">
                            {prefix}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            ex: {exampleSku}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-800/60">
                          {productCount}&nbsp;{productCount === 1 ? 'model' : 'models'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            totalUnits > 0
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60'
                              : 'bg-slate-100 dark:bg-[#0B1120] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#1A263D]'
                          }`}
                        >
                          {totalUnits}&nbsp;pairs
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {onNavigateToInventory && (
                          <button
                            onClick={() => onNavigateToInventory(brand.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] hover:border-blue-300 transition cursor-pointer"
                            title="Filter products by this brand in catalog"
                          >
                            <span>View in Catalog</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => openEditModal(brand)}
                              title="Edit Brand Name & Logo"
                              className="p-1.5 rounded-lg bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-slate-600 dark:text-purple-200 dark:hover:text-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setDeletingBrand({
                                  id: brand.id,
                                  name: brand.name,
                                  logo: brand.logo,
                                  productCount,
                                })
                              }
                              title="Delete Brand"
                              className="p-1.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-[#1A263D] transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ADD / EDIT BRAND MODAL */}
      {isAddModalOpen && !isCashier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header - Purple/Indigo theme in Dark Mode, identical to Shoe Box Side-End Label */}
            <div className="p-5 border-b border-slate-200 dark:border-purple-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-900 dark:text-white">
              <div className="flex items-center space-x-3">
                <span className="p-2 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 rounded-xl border border-blue-100 dark:border-purple-400/30 shadow-2xs">
                  <Tag className="w-5 h-5 stroke-[2.2]" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                      {editingBrand ? 'Edit Brand' : 'Add New Brand'}
                    </h3>
                    <span className="bg-blue-100 dark:bg-purple-500/30 text-blue-700 dark:text-purple-200 border border-blue-200 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                      Brand Profile
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-0.5">
                    Define manufacturer name, logo &amp; automated 3-letter SKU prefix
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Brand Name
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Nike, Adidas, Clarks, Bata, Puma, Service, Hush Puppies"
                  value={brandNameInput}
                  onChange={(e) => setBrandNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-purple-950/40 text-slate-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/50 border border-slate-300 dark:border-purple-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-purple-500/40 focus:border-blue-500 dark:focus:border-purple-400 dark:focus:bg-purple-950/70 transition shadow-2xs"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  Manufacturer name used across POS counter, receipts, and catalog lookups.
                </p>
              </div>

              {/* Brand Logo Field (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    Brand Logo <span className="text-[10px] font-normal text-slate-400 dark:text-slate-400">(Optional)</span>
                  </label>
                  {brandLogoInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setBrandLogoInput('');
                        if (logoFileInputRef.current) logoFileInputRef.current.value = '';
                      }}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 font-semibold cursor-pointer"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-purple-950/20 border border-slate-200 dark:border-purple-700/50 rounded-xl">
                  {/* Live preview avatar/badge */}
                  <BrandLogo
                    logo={brandLogoInput}
                    name={brandNameInput || 'Brand'}
                    size="lg"
                    className="shrink-0"
                  />

                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="Paste image URL (https://... or data:image/...)"
                      value={brandLogoInput}
                      onChange={(e) => setBrandLogoInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-purple-950/50 text-slate-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/50 border border-slate-300 dark:border-purple-700/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={logoFileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              setFeedback({ type: 'error', message: 'Logo image should be under 2MB.' });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setBrandLogoInput((ev.target?.result as string) || '');
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => logoFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-purple-900/40 text-slate-700 dark:text-purple-200 border border-slate-300 dark:border-purple-700/70 hover:bg-slate-50 dark:hover:bg-purple-800/40 cursor-pointer transition shadow-2xs"
                      >
                        <Upload className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                        <span>Upload Image</span>
                      </button>
                      <span className="text-[10px] text-slate-400 dark:text-slate-400">
                        {brandLogoInput ? 'Custom logo loaded' : 'Placeholder icon used if blank'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview of 3-Letter Prefix & SKU */}
              <div className="bg-blue-50/70 dark:bg-purple-950/30 p-3.5 rounded-xl space-y-2 border border-blue-200/80 dark:border-purple-800/60">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-900 dark:text-purple-300">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-purple-400" />
                  <span>Auto-Generated SKU Prefix Preview</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-950 dark:text-slate-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-blue-700 dark:text-purple-300 font-medium">3-Letter Prefix:</span>{' '}
                    <strong className="font-mono bg-white dark:bg-purple-950/70 text-blue-900 dark:text-purple-200 px-2 py-0.5 rounded border border-blue-200 dark:border-purple-700/60 shadow-2xs">
                      {previewPrefix}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-blue-700 dark:text-purple-300 font-medium">Sample SKU:</span>{' '}
                    <strong className="font-mono bg-white dark:bg-purple-950/70 text-blue-900 dark:text-purple-200 px-2 py-0.5 rounded border border-blue-200 dark:border-purple-700/60 shadow-2xs">
                      {previewSku}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 -mx-5 -mb-5 mt-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-100 dark:border-purple-800/80 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5 text-slate-500 dark:text-purple-300" />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !brandNameInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white text-xs font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span>{editingBrand ? 'Save Changes' : 'Create Brand'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingBrand && !isCashier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-rose-700 dark:border-rose-900/60 flex items-center justify-between bg-rose-600 dark:bg-gradient-to-r dark:from-rose-900 dark:via-rose-950 dark:to-slate-900 text-white">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Delete Brand</h3>
              </div>
              <button
                onClick={() => setDeletingBrand(null)}
                className="p-1 text-rose-200 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <BrandLogo logo={deletingBrand.logo} name={deletingBrand.name} size="md" />
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Are you sure you want to delete brand{' '}
                  <strong className="text-slate-900 dark:text-white font-bold">"{deletingBrand.name}"</strong>?
                </p>
              </div>

              {deletingBrand.productCount > 0 ? (
                <div className="p-3 rounded-xl text-xs space-y-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
                  <div className="font-bold flex items-center space-x-1.5 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{deletingBrand.productCount} shoe models currently belong to this brand!</span>
                  </div>
                  <p className="text-amber-700 dark:text-amber-200/90 pl-5.5">
                    Deleting it will NOT delete your shoe products or sales history. Those items will simply become Unbranded.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No products are currently attached to this brand. It will be safely removed.
                </p>
              )}
            </div>

            <div className="px-5 py-4 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-100 dark:border-purple-800/80 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setDeletingBrand(null)}
                disabled={isSubmitting}
                className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs font-bold shadow-xs shadow-rose-500/25 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
