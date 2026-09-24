import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Layers,
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
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { parseCategoryPrefix, generateSuggestedArticle } from '../../utils/sku.ts';
import { StatCard, triggerStatRecount } from '../common/StatCard.tsx';

interface CategoryManagementProps {
  currentUser: any;
  companySettings: any;
  onNavigateToInventory?: (categoryId?: number) => void;
}

export const CategoryManagement: React.FC<CategoryManagementProps> = ({
  currentUser,
  companySettings,
  onNavigateToInventory,
}) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: number; name: string; lowStockLimit?: number | null } | null>(null);
  const [itemNameInput, setItemNameInput] = useState('');
  const [lowStockLimitInput, setLowStockLimitInput] = useState<number | ''>(
    companySettings?.low_stock_limit ?? companySettings?.lowStockLimit ?? 5
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal
  const [deletingItem, setDeletingItem] = useState<{ id: number; name: string; productCount: number } | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';
  const defaultSettingLimit = companySettings?.low_stock_limit ?? companySettings?.lowStockLimit ?? 5;

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

  const loadData = async () => {
    setIsLoading(true);
    try {
      const catsRes = await api.brandCategory.getCategories();
      setCategories(catsRes.categories || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Failed to load categories: ' + (err.message || err) });
    } finally {
      setIsLoading(false);
      triggerStatRecount();
    }
  };

  const openAddModal = () => {
    setItemNameInput('');
    setLowStockLimitInput(defaultSettingLimit);
    setEditingItem(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: any) => {
    const threshold =
      item.low_stock_limit !== undefined && item.low_stock_limit !== null
        ? item.low_stock_limit
        : (item.lowStockLimit !== undefined && item.lowStockLimit !== null
          ? item.lowStockLimit
          : defaultSettingLimit);
    setEditingItem({ id: item.id, name: item.name, lowStockLimit: threshold });
    setItemNameInput(item.name);
    setLowStockLimitInput(threshold);
    setIsAddModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = itemNameInput.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Category name cannot be empty.' });
      return;
    }

    const thresholdVal =
      lowStockLimitInput === '' || isNaN(Number(lowStockLimitInput))
        ? null
        : Math.max(1, Math.round(Number(lowStockLimitInput)));

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await api.brandCategory.updateCategory(editingItem.id, trimmed, thresholdVal);
        setFeedback({ type: 'success', message: `Category "${trimmed}" updated successfully!` });
      } else {
        await api.brandCategory.createCategory(trimmed, thresholdVal);
        setFeedback({ type: 'success', message: `Category "${trimmed}" added to store!` });
      }

      setIsAddModalOpen(false);
      setItemNameInput('');
      setLowStockLimitInput(defaultSettingLimit);
      setEditingItem(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Operation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsSubmitting(true);
    try {
      await api.brandCategory.deleteCategory(deletingItem.id);
      setFeedback({ type: 'success', message: `Category "${deletingItem.name}" removed.` });
      setDeletingItem(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete category.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items
  const filteredCategories = categories.filter((c) => {
    const term = searchTerm.toLowerCase().trim();
    const prefix = parseCategoryPrefix(c.name).toLowerCase();
    return c.name.toLowerCase().includes(term) || prefix.includes(term);
  });

  const totalCategoryProducts = categories.reduce((acc, c) => acc + (Number(c.product_count) || 0), 0);
  const totalCategoryUnits = categories.reduce((acc, c) => acc + (Number(c.total_units) || 0), 0);

  // Live calculation for modal preview
  const previewPrefix = parseCategoryPrefix(itemNameInput || 'Sneakers');
  const previewArticle = generateSuggestedArticle(previewPrefix, 1);

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
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-purple-800/80 shadow-xs dark:text-white transition-colors"
      >
        <div>
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 rounded-xl border border-blue-100 dark:border-purple-400/30 shadow-2xs">
              <Layers className="w-5 h-5 stroke-[2.2]" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Shoe Category Management
                </h1>
                <span className="bg-blue-100 dark:bg-purple-500/30 text-blue-700 dark:text-purple-200 border border-blue-200 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wide">
                  Category Prefixes &amp; Article Lines
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 mt-0.5">
                Organize footwear classifications, styles, and their automatic 2-letter article prefix codes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 self-start sm:self-auto">
          <button
            onClick={loadData}
            title="Refresh list"
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-white dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] text-xs font-semibold active:scale-[0.98] cursor-pointer transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-purple-300 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {isAdmin ? (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white text-xs font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] active:scale-[0.98] cursor-pointer transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add New Category</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-purple-950/40 text-slate-500 dark:text-purple-300/80 border border-slate-200 dark:border-purple-800/60 text-xs font-semibold">
              Admin rights required
            </span>
          )}
        </div>
      </motion.div>

      {/* Summary KPI Cards matching Dashboard theme */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Registered Categories */}
        <StatCard
          layout="horizontal"
          title="Registered Shoe Categories"
          value={categories.length}
          icon={Layers}
          iconColor="blue"
          loading={isLoading}
          delay={0}
          duration={1200}
          subtext={<span className="text-slate-400 dark:text-slate-500">Active classification groups</span>}
        />

        {/* Card 2: Categorized Shoe Models */}
        <StatCard
          layout="horizontal"
          title="Active Shoe Models Linked"
          value={totalCategoryProducts}
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
          value={totalCategoryUnits}
          icon={Footprints}
          iconColor="cyan"
          loading={isLoading}
          delay={0}
          duration={1200}
          subtext={<span className="text-slate-400 dark:text-slate-500">Pairs available on shelf</span>}
        />
      </div>

      {/* Categories Table Container */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="bg-white dark:bg-[#0E1628] rounded-2xl border border-slate-200/90 dark:border-purple-800/60 shadow-xs overflow-hidden"
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-purple-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-200 dark:border-purple-400/30 rounded-xl shadow-2xs">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700 dark:text-white uppercase tracking-wider">
                All Categories
              </span>
              <span className="bg-slate-200/80 dark:bg-purple-500/30 text-slate-700 dark:text-purple-200 border border-slate-300 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center">
                {isLoading ? '...' : categories.length}
              </span>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 dark:text-purple-300/80 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search category name or code..."
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
              <tr className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-500 dark:text-white font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Category Name</th>
                <th className="py-3 px-4 text-center">Article Prefix (2-Letter)</th>
                <th className="py-3 px-4 text-center">Shoe Models</th>
                <th className="py-3 px-4 text-center">Stock In Hand</th>
                <th className="py-3 px-4 text-center">Low Stock Alert</th>
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
                      <p className="font-medium text-xs">Loading shoe categories directory...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <Layers className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">No shoe categories found</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      {searchTerm ? 'Try a different search keyword.' : 'Click "Add New Category" to create your first category.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const productCount = Number(cat.product_count) || 0;
                  const totalUnits = Number(cat.total_units) || 0;
                  const prefix = parseCategoryPrefix(cat.name);
                  const exampleArticle = generateSuggestedArticle(prefix, 1);
                  const categoryLimit =
                    cat.low_stock_limit !== undefined && cat.low_stock_limit !== null
                      ? cat.low_stock_limit
                      : (cat.lowStockLimit !== undefined && cat.lowStockLimit !== null
                        ? cat.lowStockLimit
                        : defaultSettingLimit);

                  return (
                    <tr key={cat.id} className="hover:bg-slate-50/80 dark:hover:bg-[#131D33] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-cyan-400 shadow-2xs">
                            <Layers className="w-4 h-4 stroke-[2.2]" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900 dark:text-white">{cat.name}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">ID #{cat.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-cyan-400 border border-blue-200/80 dark:border-cyan-500/30">
                            {prefix}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            ex: {exampleArticle}
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

                      <td className="py-3.5 px-4 text-center font-mono">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold font-mono bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>≤ {categoryLimit} prs</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {onNavigateToInventory && (
                          <button
                            onClick={() => onNavigateToInventory(cat.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] hover:border-blue-300 transition cursor-pointer"
                            title="Filter products by this category in catalog"
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
                              onClick={() => openEditModal(cat)}
                              title="Edit Category Name"
                              className="p-1.5 rounded-lg bg-slate-50 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-slate-600 dark:text-purple-200 dark:hover:text-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setDeletingItem({
                                  id: cat.id,
                                  name: cat.name,
                                  productCount,
                                })
                              }
                              title="Delete Category"
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

      {/* ADD / EDIT CATEGORY MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 dark:border-purple-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900">
              <div className="flex items-center space-x-2.5">
                <span className="p-2 bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 rounded-xl border border-blue-100 dark:border-purple-400/30 shadow-2xs">
                  <Layers className="w-5 h-5 stroke-[2.2]" />
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                      {editingItem ? 'Edit Category' : 'Add New Category'}
                    </h3>
                    <span className="bg-blue-100 dark:bg-purple-500/30 text-blue-700 dark:text-purple-200 border border-blue-200 dark:border-purple-400/40 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                      Category Profile
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-0.5">
                    Define category classification &amp; automated 2-letter article prefix
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-purple-200 mb-1">
                  Category Name
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Formal Dress Shoes, Casual Shoes, Sandals & Chappals, Flat Sandals"
                  value={itemNameInput}
                  onChange={(e) => setItemNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-purple-950/40 text-slate-900 dark:text-purple-100 placeholder-slate-400 dark:placeholder-purple-300/50 border border-slate-300 dark:border-purple-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-purple-500/40 focus:border-blue-500 dark:focus:border-purple-400 dark:focus:bg-purple-950/70 transition shadow-2xs"
                />
                <p className="text-[11px] text-slate-400 dark:text-purple-300/70 mt-1">
                  Categorizes shoes for POS lookups, stock audits, and auto-generates article codes.
                </p>
              </div>

              {/* Category-Based Low Stock Threshold Alert */}
              <div className="p-3.5 bg-slate-50 dark:bg-purple-950/30 border border-slate-200 dark:border-purple-800/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-purple-200">
                    Low Stock Threshold Alert (Pairs)
                  </label>
                  <span className="text-[10px] font-semibold text-blue-700 dark:text-purple-200 bg-blue-50 dark:bg-purple-500/30 border border-blue-200 dark:border-purple-400/40 px-2 py-0.5 rounded-md">
                    Default from Settings: {defaultSettingLimit} pairs
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    placeholder={`Default: ${defaultSettingLimit}`}
                    value={lowStockLimitInput}
                    onChange={(e) =>
                      setLowStockLimitInput(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono font-bold text-slate-900 dark:text-purple-100 bg-white dark:bg-purple-950/40 border border-slate-300 dark:border-purple-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-purple-500/40 focus:border-blue-500 dark:focus:border-purple-400"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-purple-200/80 leading-tight">
                  Shoe products belonging to this category will trigger low-stock alerts when remaining total inventory drops to or below this pair limit.
                </p>
              </div>

              {/* Live Preview of 2-Letter Code & Article */}
              <div className="bg-blue-50/70 dark:bg-purple-950/30 p-3.5 rounded-xl space-y-2 border border-blue-200/80 dark:border-purple-800/60">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-900 dark:text-purple-200">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-purple-300" />
                  <span>Auto-Generated Article Code Preview</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-950 dark:text-purple-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-blue-700 dark:text-purple-300 font-medium">2-Letter Code:</span>{' '}
                    <strong className="font-mono bg-white dark:bg-purple-950/70 text-blue-900 dark:text-purple-200 px-2 py-0.5 rounded border border-blue-200 dark:border-purple-400/40 shadow-2xs">
                      {previewPrefix}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-blue-700 dark:text-purple-300 font-medium">Sample Article:</span>{' '}
                    <strong className="font-mono bg-white dark:bg-purple-950/70 text-blue-900 dark:text-purple-200 px-2 py-0.5 rounded border border-blue-200 dark:border-purple-400/40 shadow-2xs">
                      {previewArticle}
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
                  disabled={isSubmitting || !itemNameInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white text-xs font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span>{editingItem ? 'Save Changes' : 'Create Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0E1628] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#1A263D] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-rose-700 flex items-center justify-between bg-rose-600 text-white">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Delete Category</h3>
              </div>
              <button
                onClick={() => setDeletingItem(null)}
                className="p-1 text-rose-200 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Are you sure you want to delete category{' '}
                <strong className="text-slate-900 dark:text-white font-bold">"{deletingItem.name}"</strong>?
              </p>

              {deletingItem.productCount > 0 ? (
                <div className="p-3 rounded-xl text-xs space-y-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
                  <div className="font-bold flex items-center space-x-1.5 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{deletingItem.productCount} shoe models currently belong to this category!</span>
                  </div>
                  <p className="text-amber-700 dark:text-amber-200/90 pl-5.5">
                    Deleting it will NOT delete your shoe products or sales history. Those items will simply become Uncategorized.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No shoe models are currently assigned to this category. It will be safely removed.
                </p>
              )}

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-[#1A263D]">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white text-xs font-semibold border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] transition cursor-pointer"
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
        </div>
      )}
    </div>
  );
};
