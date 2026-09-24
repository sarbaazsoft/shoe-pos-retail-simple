import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Bell,
  Settings,
  ChevronDown,
  Menu,
  Sun,
  Moon,
  Monitor,
  UserCog,
  LogOut,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  ArrowLeftRight,
  Truck,
  Database,
  RefreshCw,
  CheckCheck,
  Check,
  Boxes,
  Users,
  X,
  ShieldCheck,
  User,
  ShoppingCart,
} from 'lucide-react';
import { UserAvatar } from './UserAvatar.tsx';
import { ThemeDropdown } from './ThemeDropdown.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { api } from '../../services/api.ts';

interface HeaderProps {
  currentTab: string;
  onTabChange?: (tab: string) => void;
  currentUser: any;
  companySettings: any;
  onLogout: () => void;
  onToggleMobileMenu: () => void;
  onOpenProfile?: () => void;
  onSwitchRole?: (role: 'ADMIN' | 'CASHIER') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  companySettings: _companySettings,
  onLogout,
  onToggleMobileMenu,
  onOpenProfile,
  onSwitchRole,
}) => {
  const { theme, themeMode, setThemeMode } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    products: any[];
    customers: any[];
    screens: { id: string; label: string; shortcut?: string }[];
  }>({ products: [], customers: [], screens: [] });

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearching(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick navigation screens list
  const availableScreens = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'pos', label: 'POS Terminal', shortcut: 'F1' },
    { id: 'inventory', label: 'Shoe Catalog', shortcut: 'F2' },
    { id: 'brands', label: 'Brands & SKU Prefixes' },
    { id: 'categories', label: 'Categories' },
    { id: 'ledger', label: 'Stock Movement Ledger' },
    { id: 'purchases', label: 'Stock Purchases', shortcut: 'F3' },
    { id: 'suppliers', label: 'Suppliers & Vendors' },
    { id: 'returns', label: 'Sales Returns', shortcut: 'F4' },
    { id: 'customers', label: 'Customers', shortcut: 'F5' },
    { id: 'reports', label: 'Reports & Analytics', shortcut: 'F6' },
    { id: 'settings', label: 'Settings', shortcut: 'F7' },
  ];

  // Handle global search input
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ products: [], customers: [], screens: [] });
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const matchedScreens = availableScreens.filter((s) =>
      s.label.toLowerCase().includes(q)
    );

    // Debounced search query for products and customers
    const timer = setTimeout(async () => {
      try {
        const [prodRes, custRes] = await Promise.all([
          api.products.list({ search: q }).catch(() => ({ products: [] })),
          api.customers.list(q).catch(() => ({ customers: [] })),
        ]);

        setSearchResults({
          products: (prodRes?.products || []).slice(0, 4),
          customers: (custRes?.customers || []).slice(0, 3),
          screens: matchedScreens.slice(0, 4),
        });
      } catch {
        setSearchResults({ products: [], customers: [], screens: matchedScreens });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectScreen = (tabId: string) => {
    onTabChange?.(tabId);
    setIsSearching(false);
    setSearchQuery('');
  };

  // Real-time system notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pos_read_notifications');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  const fetchLiveNotifications = async () => {
    try {
      setIsLoadingNotifs(true);
      const res = await api.notifications.list();
      if (res && Array.isArray(res.notifications)) {
        setNotifications(res.notifications);
      }
    } catch (err) {
      console.warn('Could not fetch real-time notifications:', err);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  useEffect(() => {
    fetchLiveNotifications();

    // Periodic live sync every 30 seconds
    const interval = setInterval(fetchLiveNotifications, 30000);

    // Event listeners for POS sales, returns, purchases, and inventory adjustments
    const handleLiveEvent = () => {
      fetchLiveNotifications();
    };

    window.addEventListener('pos:sale-completed', handleLiveEvent);
    window.addEventListener('inventory:updated', handleLiveEvent);
    window.addEventListener('pos:return-completed', handleLiveEvent);
    window.addEventListener('pos:purchase-completed', handleLiveEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pos:sale-completed', handleLiveEvent);
      window.removeEventListener('inventory:updated', handleLiveEvent);
      window.removeEventListener('pos:return-completed', handleLiveEvent);
      window.removeEventListener('pos:purchase-completed', handleLiveEvent);
    };
  }, []);

  const markAsRead = (id: string) => {
    setReadNotifIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem('pos_read_notifications', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadNotifIds((prev) => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem('pos_read_notifications', JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  const unreadCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length;

  const renderNotificationIcon = (iconName: string) => {
    switch (iconName) {
      case 'boxes':
        return <Boxes className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      case 'alert-circle':
        return <AlertCircle className="w-3 h-3 text-rose-500 stroke-[2]" />;
      case 'alert-triangle':
        return <AlertTriangle className="w-3 h-3 text-amber-500 stroke-[2]" />;
      case 'shopping-bag':
        return <ShoppingBag className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      case 'check-circle':
        return <CheckCircle2 className="w-3 h-3 text-emerald-500 stroke-[2]" />;
      case 'arrow-left-right':
        return <ArrowLeftRight className="w-3 h-3 text-indigo-500 stroke-[2]" />;
      case 'truck':
        return <Truck className="w-3 h-3 text-cyan-500 stroke-[2]" />;
      case 'database':
        return <Database className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
      default:
        return <Bell className="w-3 h-3 text-purple-600 dark:text-purple-300 stroke-[2]" />;
    }
  };

  return (
    <header className="bg-white dark:bg-[#0D1322] border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 select-none no-print sticky top-0 z-20 h-13 sm:h-14 flex items-center px-3 sm:px-5 justify-between gap-3 sm:gap-4 md:gap-6 transition-colors">
      {/* LEFT: Mobile Menu Button + Global Search Bar */}
      <div className="flex items-center gap-2.5 flex-1 max-w-sm sm:max-w-md min-w-0">
        {/* Mobile Menu Toggle Button (< lg) */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="lg:hidden h-8 w-8 sm:h-8.5 sm:w-8.5 flex items-center justify-center p-1.5 rounded-lg border border-slate-200 dark:border-purple-400/40 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-purple-500/20 dark:text-purple-200 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] cursor-pointer shrink-0 shadow-2xs transition"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-4 h-4 stroke-[2.2] dark:text-purple-200" />
        </button>

        {/* Global Search Bar (Exact match to Reference Image) */}
        <div ref={searchRef} className="relative w-full min-w-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearching(true);
              }}
              onFocus={() => {
                setIsSearching(true);
                setShowNotifications(false);
                setShowUserDropdown(false);
                setShowThemeDropdown(false);
              }}
              placeholder="Search products, customers, sales..."
              className="h-8 sm:h-8.5 w-full bg-slate-50 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 pl-8 pr-7 py-1 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearching(false);
                }}
                className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Instant Global Search Results Dropdown */}
          <AnimatePresence>
            {isSearching && searchQuery.trim().length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'top center' }}
                className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0E1628] border border-slate-200 dark:border-[#1A263D] rounded-xl shadow-2xl p-1.5 z-50 max-h-96 overflow-y-auto space-y-1"
              >
              {/* Screen Jumps */}
              {searchResults.screens.length > 0 && (
                <div className="mb-1">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                    Navigation
                  </div>
                  {searchResults.screens.map((screen) => (
                    <button
                      key={screen.id}
                      type="button"
                      onClick={() => handleSelectScreen(screen.id)}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#131F38] hover:text-[#3B82F6] transition cursor-pointer"
                    >
                      <span>{screen.label}</span>
                      {screen.shortcut && (
                        <kbd className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#162238] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#1E2D4A]">
                          {screen.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Products Found */}
              {searchResults.products.length > 0 && (
                <div className="mb-1">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                    Products
                  </div>
                  {searchResults.products.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectScreen('inventory')}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#131F38] hover:text-[#3B82F6] transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Boxes className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{prod.article || prod.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {prod.sku}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Customers Found */}
              {searchResults.customers.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                    Customers
                  </div>
                  {searchResults.customers.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectScreen('customers')}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#131F38] hover:text-[#3B82F6] transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{cust.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {cust.phone}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.screens.length === 0 &&
                searchResults.products.length === 0 &&
                searchResults.customers.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No results for "{searchQuery}"
                  </div>
                )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

      {/* RIGHT: Notifications, Theme Dropdown, and User Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto pl-1 sm:pl-2">
        {/* Real-time Notifications Menu */}
        <div ref={notifRef} className="relative">
          <button
            id="header-notifications-trigger"
            type="button"
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowUserDropdown(false);
              setShowThemeDropdown(false);
              setIsSearching(false);
              if (!showNotifications) {
                fetchLiveNotifications();
              }
            }}
            className={`h-8 sm:h-8.5 flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer border ${
              showNotifications
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 ring-2 ring-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.4)]'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
            }`}
            title="System Notifications"
            aria-label="View system notifications"
            aria-expanded={showNotifications}
            aria-haspopup="true"
          >
            <div className="relative shrink-0 flex items-center justify-center">
              <Bell className="w-3 h-3 stroke-[2]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[12px] h-2.5 px-0.5 rounded-full bg-rose-500 text-white font-bold text-[7.5px] flex items-center justify-center ring-1 ring-white dark:ring-[#120726]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span
              className={`hidden sm:inline-block text-xs font-semibold ${
                showNotifications ? 'text-white' : 'text-slate-700 dark:text-purple-200'
              }`}
            >
              Alerts
            </span>
            <ChevronDown
              className={`w-2.5 h-2.5 transition-transform duration-200 ease-out hidden sm:inline-block opacity-75 ${
                showNotifications ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Notifications Dropdown Menu */}
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 sm:right-auto sm:left-0 top-full mt-1.5 w-72 sm:w-76 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-400/40 rounded-xl shadow-2xl dark:shadow-[0_0_25px_rgba(147,51,234,0.25)] p-1.5 z-50 backdrop-blur-md origin-top-right sm:origin-top-left"
              >
                {/* Header */}
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-purple-800/40 mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-purple-100">Live System Alerts</span>
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 ? (
                      <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-200 bg-purple-50 dark:bg-purple-500/20 px-1.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-400/40">
                        {unreadCount} New
                      </span>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-400 dark:text-purple-300/70 bg-slate-100 dark:bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                        All Caught Up
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchLiveNotifications();
                      }}
                      disabled={isLoadingNotifs}
                      className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:text-purple-200 dark:hover:text-white hover:bg-purple-50/40 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border dark:border-purple-400/40 dark:shadow-[0_0_10px_rgba(147,51,234,0.2)] transition cursor-pointer"
                      title="Refresh notifications"
                      aria-label="Refresh notifications"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isLoadingNotifs ? 'animate-spin text-purple-600 dark:text-purple-200' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Notifications List */}
                <div className="max-h-[300px] overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 dark:text-purple-300/60">
                      <Bell className="w-4 h-4 mx-auto mb-1.5 opacity-40 stroke-[1.8] dark:text-purple-300" />
                      <p className="text-xs font-medium dark:text-purple-200">No system notifications</p>
                      <p className="text-[10px] mt-0.5 dark:text-purple-300/60">Database and registers operating normally</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const isRead = readNotifIds.includes(n.id);
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            markAsRead(n.id);
                            onTabChange?.(n.actionTab);
                            setShowNotifications(false);
                          }}
                          className={`w-full flex items-start gap-2 px-2 py-1.5 text-xs rounded-lg transition cursor-pointer ${
                            isRead
                              ? 'opacity-70 hover:opacity-100 hover:bg-purple-50/40 dark:hover:bg-purple-500/20'
                              : 'bg-slate-50/80 dark:bg-purple-950/20 hover:bg-purple-50/40 dark:hover:bg-purple-500/25 border border-transparent dark:border-purple-800/30'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center shadow-2xs ${n.color.includes('border') ? n.color : `${n.color} border border-purple-100 dark:border-purple-400/40`}`}>
                            {renderNotificationIcon(n.icon)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[11px] font-semibold ${isRead ? 'text-slate-700 dark:text-purple-200/80' : 'text-slate-900 dark:text-purple-100'}`}>
                                {n.title}
                              </span>
                              <span className="text-[9px] text-slate-400 dark:text-purple-300/70 shrink-0 font-normal">
                                {n.time}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-slate-500 dark:text-purple-300/80 mt-0.5 line-clamp-2 leading-tight">
                              {n.message}
                            </p>
                          </div>
                          {!isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 dark:bg-purple-400 dark:shadow-[0_0_8px_rgba(192,132,252,0.8)] mt-1.5 shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="px-2.5 py-1 border-t border-slate-100 dark:border-purple-800/40 mt-1 flex items-center justify-between text-[11px]">
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAllAsRead();
                      }}
                      className="text-purple-600 dark:text-purple-200 hover:text-purple-700 dark:hover:text-white hover:bg-purple-50/40 dark:hover:bg-purple-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1 cursor-pointer font-medium transition-colors text-[10px]"
                    >
                      <CheckCheck className="w-2.5 h-2.5" />
                      Mark all as read
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-purple-300/70 text-[9px]">Real-time live sync</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onTabChange?.('inventory');
                      setShowNotifications(false);
                    }}
                    className="text-slate-500 dark:text-purple-300 hover:text-slate-800 dark:hover:text-purple-100 cursor-pointer font-medium text-[10px]"
                  >
                    View Stock &rarr;
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          {/* Three-Way Theme Dropdown Sub-Component */}
          <ThemeDropdown
            id="header-theme-dropdown-trigger"
            isOpen={showThemeDropdown}
            onOpenChange={(open) => {
              setShowThemeDropdown(open);
              if (open) {
                setShowUserDropdown(false);
                setShowNotifications(false);
              }
            }}
          />

          {/* Quick return button for Admins browsing in Cashier Mode */}
          {Boolean(
            ((currentUser?.originalRole || '').toUpperCase() === 'ADMIN' ||
              (currentUser?.isSimulatedCashier && (currentUser?.originalRole || '').toUpperCase() !== 'CASHIER')) &&
              (currentUser?.role || '').toUpperCase() === 'CASHIER'
          ) && (
            <button
              type="button"
              id="header-quick-browse-admin-btn"
              onClick={() => {
                if (onSwitchRole) {
                  onSwitchRole('ADMIN');
                } else {
                  try {
                    const cached = localStorage.getItem('pos_current_user');
                    if (cached) {
                      const u = JSON.parse(cached);
                      if ((u.originalRole || '').toUpperCase() === 'ADMIN') {
                        u.role = 'ADMIN';
                        u.isSimulatedCashier = false;
                        localStorage.setItem('pos_current_user', JSON.stringify(u));
                      }
                    }
                  } catch {}
                }
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 active:scale-95 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 border border-blue-200 dark:border-blue-700/60 text-blue-700 dark:text-blue-300 text-xs font-bold transition shadow-2xs cursor-pointer"
              title="You are browsing in Cashier Mode. Click to switch back to Admin mode."
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Browse as Admin</span>
            </button>
          )}

          {/* User Avatar + Name + Dropdown Chevron */}
          <div ref={userRef} className="relative">
            <button
              id="header-user-menu-trigger"
              type="button"
              onClick={() => {
                setShowUserDropdown((prev) => !prev);
                setShowThemeDropdown(false);
                setShowNotifications(false);
              }}
              className={`h-8 sm:h-8.5 flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer border ${
                showUserDropdown
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 ring-2 ring-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.4)]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-purple-200 dark:hover:text-white dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)]'
              }`}
              aria-label="User menu"
              aria-expanded={showUserDropdown}
              aria-haspopup="true"
            >
              <User className="w-3 h-3 stroke-[2] shrink-0 text-current opacity-90" />
              <span
                className={`hidden sm:inline-block text-xs font-bold max-w-[100px] truncate ${
                  showUserDropdown ? 'text-white' : 'text-slate-800 dark:text-purple-200'
                }`}
              >
                {currentUser?.name || 'Admin'}
              </span>
              <ChevronDown
                className={`w-2.5 h-2.5 transition-transform duration-200 ease-out opacity-75 ${
                  showUserDropdown ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* User Profile Dropdown Menu */}
            <AnimatePresence>
              {showUserDropdown && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  style={{ transformOrigin: 'top right' }}
                  className="absolute right-0 left-auto top-full mt-1.5 w-60 sm:w-64 bg-white dark:bg-[#120726] border border-slate-200 dark:border-purple-400/40 rounded-xl shadow-2xl dark:shadow-[0_0_25px_rgba(147,51,234,0.25)] p-1.5 z-50 backdrop-blur-md space-y-0.5"
                >
                  {/* Unified Identity & Role Card: User info DP + Role card wrapped in one card with dark mode gradient */}
                  <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border border-slate-100 dark:border-purple-800/80 dark:text-white transition-colors mb-0.5 space-y-1.5">
                    {/* Row 1: Enlarged circular DP on Left, Name and Email on Right */}
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        name={currentUser?.name}
                        avatarUrl={currentUser?.avatarUrl || currentUser?.avatar_url}
                        role={currentUser?.role}
                        size="md"
                        className="shrink-0 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                          {currentUser?.name || 'Admin'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-purple-200/80 truncate leading-tight mt-0.5">
                          {currentUser?.email || 'admin@store.com'}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Role Card with Login as Cashier / Return to Admin Button */}
                    {(() => {
                      const isRealAdmin =
                        (currentUser?.originalRole || '').toUpperCase() === 'ADMIN' ||
                        ((currentUser?.role || '').toUpperCase() === 'ADMIN' &&
                          (currentUser?.originalRole || '').toUpperCase() !== 'CASHIER');
                      const isAdminMode = (currentUser?.role || 'ADMIN').toUpperCase() === 'ADMIN';

                      if (isAdminMode) {
                        return (
                          <div className="p-1.5 rounded-md bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1.5 dark:shadow-[0_0_10px_rgba(16,185,129,0.15)] backdrop-blur-xs">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 min-w-0">
                                <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-[9px] font-bold tracking-wide uppercase truncate">
                                  Role: Admin
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[7.5px] font-bold bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950 uppercase tracking-wider shrink-0">
                                <span className="w-1 h-1 rounded-full bg-white dark:bg-emerald-950 animate-pulse" />
                                Verified
                              </span>
                            </div>

                            {/* Action button in role admin badge: Browse as Cashier */}
                            <button
                              type="button"
                              id="header-browse-as-cashier-btn"
                              onClick={() => {
                                setShowUserDropdown(false);
                                if (onSwitchRole) {
                                  onSwitchRole('CASHIER');
                                } else {
                                  try {
                                    const cached = localStorage.getItem('pos_current_user');
                                    if (cached) {
                                      const u = JSON.parse(cached);
                                      if ((u.originalRole || u.role || '').toUpperCase() === 'ADMIN') {
                                        u.role = 'CASHIER';
                                        u.originalRole = 'ADMIN';
                                        u.isSimulatedCashier = true;
                                        localStorage.setItem('pos_current_user', JSON.stringify(u));
                                      }
                                    }
                                  } catch {}
                                }
                                onTabChange?.('pos');
                              }}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-[10.5px] font-bold transition shadow-xs cursor-pointer"
                              title="Browse as cashier to operate POS terminal"
                            >
                              <ShoppingCart className="w-2.5 h-2.5 stroke-[2.2] shrink-0" />
                              <span>Browse as Cashier</span>
                            </button>
                          </div>
                        );
                      }

                      // User is in Cashier mode (currentUser.role === 'CASHIER')
                      return (
                        <div
                          className={`p-1.5 rounded-md bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300 dark:shadow-[0_0_10px_rgba(59,130,246,0.15)] backdrop-blur-xs ${
                            isRealAdmin ? 'space-y-1.5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <ShoppingCart className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="text-[9px] font-bold tracking-wide uppercase truncate">
                                Role: Cashier Mode
                              </span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[7.5px] font-bold bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950 uppercase tracking-wider shrink-0">
                              POS Terminal
                            </span>
                          </div>

                          {/* Action button in role cashier badge: Browse as Admin (ONLY for Admins browsing as Cashier) */}
                          {isRealAdmin && (
                            <button
                              type="button"
                              id="header-browse-as-admin-btn"
                              onClick={() => {
                                setShowUserDropdown(false);
                                if (onSwitchRole) {
                                  onSwitchRole('ADMIN');
                                } else {
                                  try {
                                    const cached = localStorage.getItem('pos_current_user');
                                    if (cached) {
                                      const u = JSON.parse(cached);
                                      if ((u.originalRole || '').toUpperCase() === 'ADMIN') {
                                        u.role = 'ADMIN';
                                        u.isSimulatedCashier = false;
                                        localStorage.setItem('pos_current_user', JSON.stringify(u));
                                      }
                                    }
                                  } catch {}
                                }
                              }}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-[10.5px] font-bold transition shadow-xs cursor-pointer"
                              title="Browse as full Store Administrator"
                            >
                              <ShieldCheck className="w-2.5 h-2.5 stroke-[2.2] shrink-0" />
                              <span>Browse as Admin</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Profile & Security Item */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onOpenProfile?.();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                  >
                    <UserCog className="w-3 h-3 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                    <span className="truncate text-[11px]">Profile & Security</span>
                  </button>

                  {/* Theme Switcher Quick Row */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowThemeDropdown(true);
                    }}
                    className="w-full flex items-center justify-between px-2 py-1 text-xs font-medium rounded-lg transition cursor-pointer text-slate-700 dark:text-purple-200 hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {themeMode === 'dark' ? (
                        <Moon className="w-3 h-3 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      ) : themeMode === 'light' ? (
                        <Sun className="w-3 h-3 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      ) : (
                        <Monitor className="w-3 h-3 stroke-[2] transition-colors shrink-0 text-current opacity-80 group-hover:opacity-100" />
                      )}
                      <span className="capitalize truncate text-[11px]">Theme: {themeMode}</span>
                    </div>
                    <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-200 group-hover:text-white group-hover:bg-white/20 group-hover:border-white/30 bg-purple-50 dark:bg-purple-500/20 px-1.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-400/40 transition-colors shrink-0">
                      Change
                    </span>
                  </button>

                  {/* System Settings Item (Active when currentTab === 'settings') */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(false);
                      onTabChange?.('settings');
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1 text-xs transition cursor-pointer rounded-lg ${
                      currentTab === 'settings'
                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white font-semibold shadow-md shadow-purple-600/25 border border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)]'
                        : 'text-slate-700 dark:text-purple-200 font-medium hover:bg-gradient-to-r hover:from-purple-600 hover:via-indigo-600 hover:to-purple-700 hover:text-white dark:hover:text-white dark:hover:bg-purple-500/25 group border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Settings
                        className={`w-3 h-3 stroke-[2] transition-colors shrink-0 ${
                          currentTab === 'settings'
                            ? 'text-white'
                            : 'text-current opacity-80 group-hover:opacity-100'
                        }`}
                      />
                      <span className="truncate text-[11px]">System Settings</span>
                    </div>
                    {currentTab === 'settings' && (
                      <Check className="w-3 h-3 text-white stroke-[2.5] shrink-0" />
                    )}
                  </button>

                  {/* Log Out Option */}
                  <div className="pt-0.5 border-t border-slate-100 dark:border-purple-800/40">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserDropdown(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 stroke-[2.2] shrink-0" />
                      <span className="truncate text-[11px]">Log Out / Switch</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
    </header>
  );
};
