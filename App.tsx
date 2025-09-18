
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Page, Event, Client, Expense, User, Notification, Announcement, Budget, BudgetItem, BudgetStatus, Inquiry, ActivityLog, AdminDashboardStats, ChatMessage, ScheduleItem } from './types';
import { getDashboardInsights, getInquiryReplySuggestion, getFollowUpEmailSuggestion, getBudgetItemsSuggestion, generateEventSchedule } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
    DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, 
    LogoutIcon, UserManagementIcon, AgendaIcon, CloseIcon, TrashIcon, PlusIcon, MenuIcon, 
    SuccessIcon, ErrorIcon, BellIcon, WarningIcon, AnnouncementIcon, SendIcon, BudgetIcon, 
    PdfIcon, EditIcon, EmailIcon, InquiryIcon, ActivityLogIcon, SparklesIcon, LogoIconOnly, 
    BrainCircuitIcon, MessageSquareIcon, ClipboardListIcon
} from './components/Icons.tsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, AuthSession } from '@supabase/supabase-js';
import { GoogleGenAI, Chat } from "@google/genai";

// --- SUPABASE CLIENT ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be provided in environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).");
}
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// --- GEMINI AI CLIENT ---
const apiKey = import.meta.env.VITE_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;


// --- TYPES ---
type AlertState = {
    isOpen: boolean;
    message: string;
    type: 'success' | 'error';
}

// --- HELPERS ---
const formatGuarani = (amount: number) =>
    new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(amount);

const logActivity = async (action: string, details?: object) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; 

    try {
        const { error } = await supabase.from('activity_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action: action,
            details: details,
        });

        if (error) {
            console.error('Error logging activity:', error.message);
        }
    } catch (e) {
        console.error("Exception in logActivity:", e);
    }
};

const getBase64ImageFromUrl = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
};

const generateBudgetPDF = async (budget: Budget, currentUser: User, client: Client | undefined) => {
    const doc = new jsPDF();
    const pageMargin = 15;
    const headStyles = { fillColor: '#2563eb', textColor: '#ffffff', fontStyle: 'bold' as 'bold' };

    // --- PDF Header ---
    const logoDataUrl = currentUser.companyLogoUrl ? await getBase64ImageFromUrl(currentUser.companyLogoUrl) : null;
    if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', pageMargin, 15, 25, 25);
    }
    
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor('#1d4ed8');
    doc.text(currentUser.company_name, logoDataUrl ? pageMargin + 30 : pageMargin, 25);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Presupuesto / Cotización`, logoDataUrl ? pageMargin + 30 : pageMargin, 32);

    // --- Client and Budget Info (using a borderless table for alignment) ---
    const clientInfo = `CLIENTE:\n${client?.name || 'N/A'}\n${client?.phone || ''}\n${client?.email || ''}`;
    const budgetInfo = `NÚMERO DE PRESUPUESTO:\nFECHA DE EMISIÓN:\nVÁLIDO HASTA:`;
    const budgetValues = `${budget.id.substring(0, 8).toUpperCase()}\n${new Date(budget.created_at).toLocaleDateString()}\n${budget.valid_until ? new Date(budget.valid_until).toLocaleDateString() : 'N/A'}`;
        
    autoTable(doc, {
        startY: 50,
        body: [[
            { content: clientInfo, styles: { cellPadding: { top: 0, left: 0 } } },
            { content: budgetInfo, styles: { halign: 'left', cellPadding: { top: 0, left: 0 } } },
            { content: budgetValues, styles: { halign: 'right', cellPadding: { top: 0, right: 0 }, fontStyle: 'bold' } },
        ]],
        theme: 'plain',
        styles: { fontSize: 9, font: 'helvetica' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40 },
            2: { cellWidth: 'auto' },
        },
    });

    // --- Items Table ---
    const itemsTableStartY = (doc as any).lastAutoTable.finalY + 10;
    const subtotal = budget.items.reduce((acc, item) => acc + item.quantity * item.price, 0);
    const total = subtotal - budget.discount;
    
    const tableBody = budget.items.map(item => [
        item.description,
        item.quantity,
        formatGuarani(item.price),
        formatGuarani(item.quantity * item.price)
    ]);

    autoTable(doc, {
        startY: itemsTableStartY,
        head: [['Descripción', 'Cantidad', 'Precio Unit.', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: headStyles,
        styles: { fontSize: 9, cellPadding: 2, font: 'helvetica' },
        columnStyles: {
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        },
        didDrawPage: (data) => {
            // --- PDF Footer ---
            const pageCount = (doc as any).internal.getNumberOfPages ? (doc as any).internal.getNumberOfPages() : 0;
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Generado por GestionSystem`, pageMargin, doc.internal.pageSize.height - 10);
            doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - pageMargin, doc.internal.pageSize.height - 10, { align: 'right' });
        }
    });

    // --- Totals Section ---
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setDrawColor(200); // Light gray line
    doc.line(doc.internal.pageSize.width / 2, finalY + 8, doc.internal.pageSize.width - pageMargin, finalY + 8);

    autoTable(doc, {
        startY: finalY + 10,
        theme: 'plain',
        tableWidth: 'wrap',
        margin: { left: doc.internal.pageSize.width / 2 },
        body: [
            ['Subtotal:', { content: formatGuarani(subtotal), styles: { halign: 'right' } }],
            ['Descuento:', { content: formatGuarani(budget.discount), styles: { halign: 'right' } }],
            [{
                content: 'TOTAL:',
                styles: { fontStyle: 'bold', fontSize: 12 }
            }, {
                content: formatGuarani(total),
                styles: { fontStyle: 'bold', fontSize: 12, halign: 'right' }
            }],
        ],
        styles: { fontSize: 10, cellPadding: { top: 1.5, right: 0, bottom: 1.5, left: 2 } },
    });

    // --- Notes Section ---
    const totalsFinalY = (doc as any).lastAutoTable.finalY;
    if (budget.notes) {
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.setFont('helvetica', 'italic');
        doc.text("Notas:", pageMargin, totalsFinalY + 15);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(doc.splitTextToSize(budget.notes, doc.internal.pageSize.width - (pageMargin * 2)), pageMargin, totalsFinalY + 20);
    }
    
    return doc;
};


// --- COMPONENT DEFINITIONS ---

const Logo: React.FC<{ size?: 'large' | 'small', className?: string }> = ({ size = 'small', className = '' }) => {
    const iconSize = size === 'large' ? 'w-12 h-12' : 'w-9 h-9';
    const textSize = size === 'large' ? 'text-3xl' : 'text-xl';
    
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <LogoIconOnly className={iconSize} />
            <span className={`${textSize} font-bold whitespace-nowrap`}>
                Gestion<span style={{color: '#2DD4BF'}}>SystemDj</span>
            </span>
        </div>
    );
};

const AuthScreen: React.FC<{ showAlert: (message: string, type: 'success' | 'error') => void; }> = ({ showAlert }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) showAlert(error.message, 'error');
        setLoading(false);
    };

    const DjIllustration = () => (
      <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
          <g transform="translate(20, 50) rotate(10 250 250) scale(0.9)">
              <path d="M100 200 L120 150 L380 150 L400 200 L400 350 L100 350 Z" fill="#374151" />
              <path d="M100 350 L120 300 L380 300 L400 350 Z" fill="#1F2937" />
              <circle cx="180" cy="225" r="50" fill="#111827" />
              <circle cx="180" cy="225" r="45" fill="#4B5563" />
              <circle cx="180"cy="225" r="10" fill="#111827" />
              <circle cx="320" cy="225" r="50" fill="#111827" />
              <circle cx="320" cy="225" r="45" fill="#4B5563" />
              <circle cx="320" cy="225" r="10" fill="#111827" />
              <rect x="235" y="260" width="30" height="60" rx="5" fill="#4B5563" />
              <rect x="230" y="270" width="40" height="8" rx="4" fill="#F87171" />
              <rect x="150" y="280" width="20" height="20" rx="3" fill="#D1D5DB" />
              <rect x="180" y="280" width="20" height="20" rx="3" fill="#D1D5DB" />
              <rect x="300" y="280" width="20" height="20" rx="3" fill="#D1D5DB" />
              <rect x="330" y="280" width="20" height="20" rx="3" fill="#D1D5DB" />
              <g opacity="0.5">
                  <rect x="50" y="150" width="80" height="40" rx="10" fill="#4F46E5" />
                  <rect x="65" y="165" width="50" height="10" rx="5" fill="#A5B4FC" />
                  <rect x="400" y="250" width="60" height="100" rx="10" fill="#EC4899" />
                  <rect x="410" y="260" width="40" height="10" rx="5" fill="#FBCFE8" />
                  <rect x="410" y="280" width="40" height="10" rx="5" fill="#FBCFE8" />
                  <rect x="410" y="300" width="40" height="10" rx="5" fill="#FBCFE8" />
              </g>
          </g>
      </svg>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
            <div className="flex w-full max-w-4xl lg:max-w-5xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-indigo-600 to-blue-800 p-12 flex-col justify-between relative overflow-hidden">
                    <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/10 rounded-full"></div>
                    <div className="absolute -bottom-24 -right-10 w-72 h-72 bg-white/10 rounded-full"></div>
                    <div>
                        <Logo size="large" className="text-white" />
                        <p className="text-white/80 mt-2">
                            Tu centro de control para eventos inolvidables. Organiza, gestiona y analiza cada detalle de tu carrera.
                        </p>
                    </div>
                    <div className="flex justify-center items-center">
                        <DjIllustration />
                    </div>
                    <div className="text-white/50 text-xs text-center">
                        &copy; {new Date().getFullYear()} GestionSystemDj. Todos los derechos reservados.
                    </div>
                </div>
                <div className="w-full lg:w-1/2 p-8 sm:p-12 flex flex-col justify-center">
                    <div className="mb-10">
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Bienvenido/a</h1>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Iniciar Sesión</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2 mb-8">Ingresa tus credenciales para acceder a tu panel.</p>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-gray-700 dark:text-gray-300 mb-2 sr-only" htmlFor="login-email">Email</label>
                            <input type="email" id="login-email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border-gray-200 bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 transition" required />
                        </div>
                        <div>
                             <label className="block text-gray-700 dark:text-gray-300 mb-2 sr-only" htmlFor="login-password">Contraseña</label>
                            <input type="password" id="login-password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 border-gray-200 bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 transition" required />
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition duration-300 disabled:bg-blue-400 font-semibold !mt-10">
                            {loading ? 'Cargando...' : 'Iniciar Sesión'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const AlertModal: React.FC<{ alertState: AlertState; onClose: () => void; }> = ({ alertState, onClose }) => {
    if (!alertState.isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-center`}>
                <div className="flex justify-center mb-4">
                    {alertState.type === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                </div>
                <div className={`mb-6 text-gray-700 dark:text-gray-300 text-lg`}>
                    <p className="whitespace-pre-wrap break-words">{alertState.message}</p>
                </div>
                <button onClick={onClose} className="w-full px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                    Aceptar
                </button>
            </div>
        </div>
    );
};


const AiSuggestionModal: React.FC<{
    title: string;
    suggestion: string;
    isLoading: boolean;
    onClose: () => void;
}> = ({ title, suggestion, isLoading, onClose }) => {
    const copyToClipboard = () => {
        navigator.clipboard.writeText(suggestion);
        alert('Copiado al portapapeles!');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg relative">
                <h3 className="text-xl font-semibold mb-4">{title}</h3>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <CloseIcon />
                </button>
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md min-h-[150px] whitespace-pre-wrap">
                    {isLoading ? "Generando sugerencia..." : suggestion}
                </div>
                {!isLoading && (
                    <div className="mt-4 flex justify-end">
                        <button onClick={copyToClipboard} className="px-4 py-2 rounded bg-primary-600 text-white">Copiar Texto</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const Sidebar: React.FC<{
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    currentUser: User;
    handleLogout: () => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    unreadSupportCount: number;
}> = ({ currentPage, setCurrentPage, currentUser, handleLogout, isOpen, setIsOpen, unreadSupportCount }) => {
    const navItems = useMemo(() => {
        let items: { page: Page; label: string; icon: React.ReactNode }[] = [
            { page: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
        ];
        if (currentUser.role === 'admin') {
            items.push(
                { page: 'userManagement', label: 'Usuarios', icon: <UserManagementIcon /> },
                { page: 'announcements', label: 'Anuncios', icon: <AnnouncementIcon /> },
                { page: 'sendNotification', label: 'Enviar Notificación', icon: <SendIcon /> },
                { page: 'activityLog', label: 'Registro de Actividad', icon: <ActivityLogIcon /> },
                { page: 'support', label: 'Soporte', icon: <MessageSquareIcon /> }
            );
        } else {
             items.push(
                { page: 'inquiries', label: 'Consultas', icon: <InquiryIcon /> },
                { page: 'budgets', label: 'Presupuestos', icon: <BudgetIcon /> },
                { page: 'events', label: 'Eventos', icon: <EventsIcon /> },
                { page: 'clients', label: 'Clientes', icon: <ClientsIcon /> },
                { page: 'agenda', label: 'Agenda', icon: <AgendaIcon /> },
                { page: 'reports', label: 'Reportes', icon: <ReportsIcon /> },
                { page: 'coach', label: 'Coach IA', icon: <BrainCircuitIcon /> },
                { page: 'support', label: 'Soporte', icon: <MessageSquareIcon /> }
            );
        }
        items.push({ page: 'settings', label: 'Configuración', icon: <SettingsIcon /> });
        return items;
    }, [currentUser.role]);

    const NavLink: React.FC<{ page: Page, label: string, icon: React.ReactNode }> = ({ page, label, icon }) => (
        <a
            href="#"
            onClick={(e) => {
                e.preventDefault();
                setCurrentPage(page);
                setIsOpen(false);
            }}
            className={`flex items-center p-3 my-1 rounded-lg transition-colors ${
                currentPage === page
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
        >
            {icon}
            <span className="ml-3 font-medium">{label}</span>
            {page === 'support' && unreadSupportCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadSupportCount}
                </span>
            )}
        </a>
    );

    return (
        <aside className={`fixed md:relative inset-y-0 left-0 bg-white dark:bg-gray-800 shadow-lg z-30 w-64 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out`}>
            <div className="flex flex-col h-full">
                <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                    <Logo size="small" className="text-gray-800 dark:text-gray-100" />
                    <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-500 dark:text-gray-400">
                        <CloseIcon />
                    </button>
                </div>
                <nav className="flex-1 p-4 overflow-y-auto">
                    {navItems.map(item => (
                        <NavLink key={item.page} {...item} />
                    ))}
                </nav>
                <div className="p-4 border-t dark:border-gray-700">
                    <button onClick={handleLogout} className="w-full flex items-center p-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors">
                        <LogoutIcon />
                        <span className="ml-3 font-medium">Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

const Header: React.FC<{
    currentUser: User;
    toggleTheme: () => void;
    theme: 'light' | 'dark';
    onMenuClick: () => void;
    notifications: Notification[];
    isNotificationsOpen: boolean;
    setIsNotificationsOpen: (isOpen: boolean) => void;
    markNotificationsAsRead: () => void;
    daysUntilExpiry: number | null;
}> = ({ currentUser, toggleTheme, theme, onMenuClick, notifications, isNotificationsOpen, setIsNotificationsOpen, markNotificationsAsRead, daysUntilExpiry }) => {
    
    const notificationRef = useRef<HTMLDivElement>(null);
    const unreadCount = notifications.filter(n => !n.is_read).length;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
                setIsNotificationsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsNotificationsOpen]);

    const handleBellClick = () => {
        setIsNotificationsOpen(!isNotificationsOpen);
        if (!isNotificationsOpen && unreadCount > 0) {
            markNotificationsAsRead();
        }
    }

    return (
        <header className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
            <div className="flex items-center">
                <button onClick={onMenuClick} className="md:hidden mr-4 text-gray-600 dark:text-gray-300">
                    <MenuIcon />
                </button>
                <h2 className="text-xl md:text-2xl font-semibold">
                    Bienvenido, <span className="text-primary-600 dark:text-primary-400">{currentUser.company_name}</span>
                </h2>
            </div>
            <div className="flex items-center space-x-4">
                {daysUntilExpiry !== null && daysUntilExpiry <= 10 && daysUntilExpiry >= 0 && (
                     <div className="hidden md:flex items-center space-x-2 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 px-3 py-1.5 rounded-full text-sm font-medium">
                         <WarningIcon />
                         <span>Tu licencia vence en {daysUntilExpiry} día{daysUntilExpiry !== 1 ? 's' : ''}.</span>
                     </div>
                )}
                <button onClick={toggleTheme} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>
                {currentUser.role === 'user' && (
                    <div className="relative" ref={notificationRef}>
                        <button onClick={handleBellClick} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                            <BellIcon />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                </span>
                            )}
                        </button>
                        {isNotificationsOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-20">
                                <div className="p-3 font-semibold border-b dark:border-gray-700">Notificaciones</div>
                                <div className="max-h-64 overflow-y-auto">
                                    {notifications.length > 0 ? (
                                        notifications.map(n => (
                                            <div key={n.id} className={`p-3 border-b dark:border-gray-700 last:border-b-0 flex items-start space-x-3 ${!n.is_read ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                                                <div className="flex-shrink-0 mt-1">
                                                     <WarningIcon />
                                                </div>
                                                <div>
                                                    <p className="text-sm">{n.message}</p>
                                                    <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-gray-500">No hay notificaciones.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

const AgendaPage: React.FC<{ events: Event[] }> = ({ events }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateEvents, setSelectedDateEvents] = useState<Event[]>([]);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();

    const calendarDays = useMemo(() => {
        const days = [];
        for (let i = 0; i < startDay; i++) {
            days.push({ day: null, date: null });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({ day: i, date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i) });
        }
        return days;
    }, [startDay, daysInMonth, currentDate]);

    const eventDates = useMemo(() => {
        const dates = new Set<string>();
        events.forEach(event => {
            const eventDate = new Date(event.date);
            dates.add(new Date(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()).toDateString());
        });
        return dates;
    }, [events]);

    const handleDateClick = (date: Date | null) => {
        if (!date) return;
        const clickedDateString = date.toDateString();
        const eventsOnDate = events.filter(event => {
            const eventDate = new Date(event.date);
            const eventDateUTC = new Date(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate());
            return eventDateUTC.toDateString() === clickedDateString;
        });
        setSelectedDateEvents(eventsOnDate);
    };

    return (
        <>
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700">Anterior</button>
                <h3 className="text-xl font-semibold">{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h3>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700">Siguiente</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-sm text-gray-500 dark:text-gray-400 mb-2">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((d, i) => (
                    <div
                        key={i}
                        onClick={() => handleDateClick(d.date)}
                        className={`p-2 h-20 flex justify-center items-center border dark:border-gray-700 rounded transition-colors ${
                            d.day === null ? 'bg-gray-50 dark:bg-gray-800/50' :
                            d.date && eventDates.has(d.date.toDateString()) ? 'bg-primary-100 dark:bg-primary-900/50 cursor-pointer hover:bg-primary-200' :
                            'bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        {d.day && <span>{d.day}</span>}
                    </div>
                ))}
            </div>
        </div>
        {selectedDateEvents.length > 0 && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={() => setSelectedDateEvents([])}>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                    <h3 className="text-xl font-semibold mb-4">Eventos del {selectedDateEvents[0] && new Date(selectedDateEvents[0].date).toLocaleDateString()}</h3>
                    <div className="space-y-4">
                        {selectedDateEvents.map(event => (
                            <div key={event.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                                <p className="font-bold">{event.name}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">Cliente: {event.client?.name || 'N/A'}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">Lugar: {event.location}</p>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setSelectedDateEvents([])} className="mt-6 w-full py-2 bg-primary-600 text-white rounded">Cerrar</button>
                </div>
            </div>
        )}
        </>
    );
};

const SettingsPage: React.FC<{
    currentUser: User;
    saveUser: (user: User, password?: string) => Promise<void>;
    uploadLogo: (userId: string, file: File) => Promise<string | null>;
    showAlert: (message: string, type: 'success' | 'error') => void;
}> = ({ currentUser, saveUser, uploadLogo, showAlert }) => {
    const [user, setUser] = useState<User>(currentUser);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setUser(currentUser);
    }, [currentUser]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUser({ ...user, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setLogoFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        let updatedUser = { ...user };
        if (logoFile) {
            const newLogoUrl = await uploadLogo(user.id, logoFile);
            if (newLogoUrl) {
                updatedUser.companyLogoUrl = newLogoUrl;
            } else {
                // Upload failed, stop saving
                setIsSaving(false);
                return;
            }
        }
        await saveUser(updatedUser);
        setLogoFile(null); 
        if(fileInputRef.current) fileInputRef.current.value = "";
        setIsSaving(false);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-6">Configuración de la Cuenta</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input type="email" value={user.email || ''} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50" disabled />
                </div>
                <div>
                    <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de Empresa</label>
                    <input type="text" id="company_name" name="company_name" value={user.company_name} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo de la Empresa</label>
                    <div className="flex items-center space-x-4">
                        {user.companyLogoUrl && <img src={user.companyLogoUrl} alt="Logo actual" className="w-16 h-16 rounded-full object-cover" />}
                        <input type="file" onChange={handleFileChange} ref={fileInputRef} accept="image/png, image/jpeg" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                    </div>
                </div>
                 {currentUser.role === 'admin' && (
                    <div>
                        <label htmlFor="notification_email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email para Notificaciones de Chat</label>
                        <input type="email" id="notification_email" name="notification_email" value={user.notification_email || ''} onChange={handleChange} placeholder="admin@example.com" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                        <p className="text-xs text-gray-500 mt-1">Recibe un aviso por correo cuando un usuario te envíe un mensaje de soporte.</p>
                    </div>
                 )}
                <div className="border-t dark:border-gray-700 pt-6">
                    <button type="submit" disabled={isSaving} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition duration-300 disabled:bg-primary-400">
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const PageContent: React.FC<{
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    currentUser: User;
    events: Event[];
    clients: Client[];
    budgets: Budget[];
    inquiries: Inquiry[];
    saveEvent: (event: Event) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
    saveClient: (client: Client) => Promise<Client | null>;
    deleteClient: (id: string) => Promise<void>;
    saveBudget: (budget: Budget) => Promise<void>;
    deleteBudget: (id: string) => Promise<void>;
    users: User[];
    saveUser: (user: User, password?: string) => Promise<void>;
    uploadLogo: (userId: string, file: File) => Promise<string | null>;
    showAlert: (message: string, type: 'success' | 'error') => void;
    announcements: Announcement[];
    saveAnnouncement: (announcement: Announcement, imageFile?: File | null) => Promise<void>;
    deleteAnnouncement: (id: string) => Promise<void>;
    toggleAnnouncementActive: (announcement: Announcement) => Promise<void>;
    sendNotificationToAll: (message: string) => Promise<void>;
    fetchInquiries: (userId: string) => Promise<void>;
    convertInquiryToBudget: (inquiry: Inquiry) => Promise<void>;
    isModalOpen: boolean;
    setIsModalOpen: (isOpen: boolean) => void;
    selectedBudget: Budget | null;
    setSelectedBudget: (budget: Budget | null) => void;
    adminStats: AdminDashboardStats | null;
    activityLogs: ActivityLog[];
    handleGetInquirySuggestion: (inquiry: Inquiry) => void;
    handleGetFollowUpSuggestion: (budget: Budget) => void;
    // Chat props
    chatConversations: User[];
    selectedChatUser: User | null;
    handleSelectChatUser: (user: User) => void;
    chatMessages: ChatMessage[];
    handleSendMessage: (content: string, recipientId?: string) => void;
    isSendingMessage: boolean;
    unreadCountsByConversation: Map<string, number>;
}> = (props) => {
    switch (props.currentPage) {
        case 'dashboard':
            return props.currentUser.role === 'admin' 
                ? <DashboardAdmin stats={props.adminStats} /> 
                : <DashboardUser events={props.events} />;
        case 'inquiries':
            return <InquiriesPage 
                        inquiries={props.inquiries}
                        convertInquiryToBudget={props.convertInquiryToBudget}
                        fetchInquiries={() => props.fetchInquiries(props.currentUser.id)}
                        currentUser={props.currentUser}
                        onGetSuggestion={props.handleGetInquirySuggestion}
                    />;
        case 'budgets':
            return <BudgetsPage 
                        budgets={props.budgets} 
                        clients={props.clients} 
                        currentUser={props.currentUser} 
                        saveBudget={props.saveBudget} 
                        deleteBudget={props.deleteBudget} 
                        showAlert={props.showAlert}
                        isModalOpen={props.isModalOpen}
                        setIsModalOpen={props.setIsModalOpen}
                        selectedBudget={props.selectedBudget}
                        setSelectedBudget={props.setSelectedBudget}
                        onGetSuggestion={props.handleGetFollowUpSuggestion}
                    />;
        case 'events':
            return <EventsPage events={props.events} clients={props.clients} saveEvent={props.saveEvent} deleteEvent={props.deleteEvent} showAlert={props.showAlert} />;
        case 'clients':
            return <ClientsPage clients={props.clients} saveClient={props.saveClient} deleteClient={props.deleteClient} />;
        case 'agenda':
            return <AgendaPage events={props.events} />;
        case 'reports':
            return <ReportsPage events={props.events} currentUser={props.currentUser} />;
        case 'settings':
             return <SettingsPage currentUser={props.currentUser} saveUser={props.saveUser} uploadLogo={props.uploadLogo} showAlert={props.showAlert} />;
        case 'userManagement':
            return <UserManagementPage users={props.users} saveUser={props.saveUser} />;
        case 'announcements':
            return <AnnouncementsPage announcements={props.announcements} saveAnnouncement={props.saveAnnouncement} deleteAnnouncement={props.deleteAnnouncement} toggleAnnouncementActive={props.toggleAnnouncementActive} />;
        case 'sendNotification':
            return <SendNotificationPage sendNotificationToAll={props.sendNotificationToAll} />;
        case 'activityLog':
            return <ActivityLogPage logs={props.activityLogs} />;
        case 'coach':
            return <CoachPage events={props.events} clients={props.clients} />;
        case 'support':
            return props.currentUser.role === 'admin' ? (
                <AdminSupportPage 
                    conversations={props.chatConversations}
                    selectedUser={props.selectedChatUser}
                    onSelectUser={props.handleSelectChatUser}
                    messages={props.chatMessages}
                    onSendMessage={props.handleSendMessage}
                    currentUser={props.currentUser}
                    unreadCountsByConversation={props.unreadCountsByConversation}
                />
            ) : (
                <UserChatPage 
                    currentUser={props.currentUser}
                    messages={props.chatMessages}
                    onSendMessage={props.handleSendMessage}
                    isLoading={props.isSendingMessage}
                />
            );
        default:
            return <div>Página no encontrada o en construcción.</div>;
    }
};

const DashboardAdmin: React.FC<{stats: AdminDashboardStats | null}> = ({stats}) => {
    if (!stats) {
        return <div className="text-center p-10">Cargando estadísticas...</div>
    }

    const { newUsersLast30Days, licensesExpiringSoon, totalEvents, growthChartData } = stats;
    
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Nuevos Usuarios (30d)</h4>
                    <p className="text-4xl font-bold text-green-500 mt-2">{newUsersLast30Days}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Licencias por Vencer (30d)</h4>
                    <p className="text-4xl font-bold text-yellow-500 mt-2">{licensesExpiringSoon}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Total de Eventos (Plataforma)</h4>
                    <p className="text-4xl font-bold text-blue-500 mt-2">{totalEvents}</p>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Crecimiento de Usuarios Registrados</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={growthChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128, 128, 128, 0.3)" />
                        <XAxis dataKey="name" tickFormatter={(dateStr) => new Date(dateStr).toLocaleDateString('es-ES', { month: 'short', day: 'numeric'})} />
                        <YAxis allowDecimals={false} />
                        <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })} />
                        <Legend />
                        <Line type="monotone" dataKey="Usuarios" stroke="#3b82f6" strokeWidth={2} name="Total de Usuarios" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ActivityLogPage: React.FC<{logs: ActivityLog[]}> = ({ logs }) => {
    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-4">Registro de Actividad del Sistema</h3>
            <div className="overflow-x-auto max-h-[70vh]">
                 <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700">
                        <tr className="border-b dark:border-gray-600">
                            <th className="p-2">Fecha</th>
                            <th className="p-2">Usuario</th>
                            <th className="p-2">Acción</th>
                            <th className="p-2">Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id} className="border-b dark:border-gray-600">
                                <td className="p-2 whitespace-nowrap">{new Date(log.created_at).toLocaleString('es-ES')}</td>
                                <td className="p-2">{log.user_email}</td>
                                <td className="p-2">{log.action.replace(/_/g, ' ')}</td>
                                <td className="p-2 font-mono text-xs">{log.details ? JSON.stringify(log.details) : 'N/A'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const DashboardUser: React.FC<{events: Event[]}> = ({events}) => {
    const [insights, setInsights] = useState<string>("Generando percepciones...");
    const [loadingInsights, setLoadingInsights] = useState(true);

    const { totalIncome, totalExpenses, netProfit, eventCount, monthlyData, topClients } = useMemo(() => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const currentMonthEvents = events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
        });

        const totalIncome = currentMonthEvents.reduce((acc, e) => acc + e.amount_charged, 0);
        const totalExpenses = currentMonthEvents.reduce((acc, e) => acc + e.expenses.reduce((expAcc, exp) => expAcc + exp.amount, 0), 0);
        const netProfit = totalIncome - totalExpenses;
        const eventCount = currentMonthEvents.length;
        
        const monthlyData = Array.from({ length: 12 }).map((_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const month = date.getMonth();
            const year = date.getFullYear();
            const monthName = date.toLocaleString('es-ES', { month: 'short' });
            
            const income = events
                .filter(e => {
                    const eventDate = new Date(e.date);
                    return eventDate.getMonth() === month && eventDate.getFullYear() === year;
                })
                .reduce((acc, e) => acc + e.amount_charged, 0);

            return { name: monthName, Ingresos: income };
        }).reverse();

        const clientCounts: {[key: string]: number} = {};
        events.forEach(event => {
            if (event.client) {
                clientCounts[event.client.name] = (clientCounts[event.client.name] || 0) + 1;
            }
        });
        const topClients = Object.entries(clientCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, Eventos: count }));

        return { totalIncome, totalExpenses, netProfit, eventCount, monthlyData, topClients };
    }, [events]);
    
    useEffect(() => {
        const fetchInsights = async () => {
            if (!ai) {
                setInsights("La funcionalidad de IA no está disponible. Configure la API Key.");
                setLoadingInsights(false);
                return;
            }
            if (eventCount > 0) {
                setLoadingInsights(true);
                try {
                    const result = await getDashboardInsights(totalIncome, totalExpenses, netProfit, eventCount);
                    setInsights(result);
                } finally {
                    setLoadingInsights(false);
                }
            } else {
                setInsights("No hay datos de eventos este mes para generar percepciones.");
                setLoadingInsights(false);
            }
        };
        fetchInsights();
    }, [totalIncome, totalExpenses, netProfit, eventCount]);

    const formatYAxis = (tickItem: number): string => {
        if (tickItem >= 1000000) return `${(tickItem / 1000000).toFixed(1)}M`;
        if (tickItem >= 1000) return `${Math.round(tickItem / 1000)}k`;
        return tickItem.toString();
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4">Tendencia de Ingresos (Últimos 12 meses)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128, 128, 128, 0.3)" />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={formatYAxis} />
                            <Tooltip formatter={(value) => formatGuarani(value as number)} />
                            <Legend />
                            <Line type="monotone" dataKey="Ingresos" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4">Top 5 Clientes</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topClients} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128, 128, 128, 0.3)" />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value) => `${value} eventos`} />
                            <Legend />
                            <Bar dataKey="Eventos" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
             <div className="lg:col-span-1 space-y-6">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Ingresos Totales (Mes)</h4>
                    <p className="text-3xl font-bold text-green-500 mt-2">{formatGuarani(totalIncome)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Gastos Totales (Mes)</h4>
                    <p className="text-3xl font-bold text-red-500 mt-2">{formatGuarani(totalExpenses)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Ganancia Neta (Mes)</h4>
                    <p className="text-3xl font-bold text-blue-500 mt-2">{formatGuarani(netProfit)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <div className="flex items-center mb-2">
                        <SparklesIcon />
                        <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 ml-2">Análisis con IA</h4>
                    </div>
                    {loadingInsights ? 
                        <p className="text-xs text-gray-500 italic">Generando percepciones...</p> : 
                        <p className="text-xs text-gray-700 dark:text-gray-300">{insights}</p>
                    }
                </div>
            </div>
        </div>
    );
};

const UserManagementPage: React.FC<{users: User[], saveUser: (user: User, password?: string) => Promise<void>}> = ({ users, saveUser }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const handleOpenModal = (user: User | null) => {
        if (user) {
            setSelectedUser(user);
        } else {
            const newUser: User = { 
                id: '', 
                email: '', 
                role: 'user', 
                status: 'active', 
                activeUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), 
                company_name: '' 
            };
            setSelectedUser(newUser);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (user: User, password?: string) => {
        await saveUser(user, password);
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Lista de Usuarios</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Nuevo Usuario</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2">Email</th><th className="p-2">Empresa</th><th className="p-2">Estado</th><th className="p-2">Activo Hasta</th><th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{user.email}</td>
                                <td className="p-2">{user.company_name}</td>
                                <td className="p-2"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.status}</span></td>
                                <td className="p-2">{new Date(user.activeUntil).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</td>
                                <td className="p-2"><button onClick={() => handleOpenModal(user)} className="text-primary-600 hover:underline">Editar</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <UserFormModal user={selectedUser} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const UserFormModal: React.FC<{user: User | null, onSave: (user: User, password?: string) => void, onClose: () => void }> = ({ user, onSave, onClose }) => {
    const isNewUser = !user?.id;
    const [formData, setFormData] = useState<User>(user || { id: '', email: '', role: 'user', status: 'active', activeUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], company_name: '' });
    const [password, setPassword] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, password);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">{isNewUser ? 'Crear' : 'Editar'} Usuario</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required disabled={!isNewUser} />
                    <input type="text" name="company_name" value={formData.company_name} onChange={handleChange} placeholder="Nombre de Empresa" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isNewUser ? "Contraseña" : "Nueva Contraseña (opcional)"} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required={isNewUser} />
                    <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                    </select>
                    <div>
                        <label className="block text-sm">Activo Hasta</label>
                        <input type="date" name="activeUntil" value={formData.activeUntil.split('T')[0]} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EventsPage: React.FC<{events: Event[], clients: Client[], saveEvent: (event: Event) => Promise<void>, deleteEvent: (id: string) => Promise<void>, showAlert: (message: string, type: 'success' | 'error') => void;}> = ({ events, clients, saveEvent, deleteEvent, showAlert }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    const handleOpenModal = (event: Event | null) => {
        setSelectedEvent(event);
        setIsModalOpen(true);
    };

    const handleSave = async (event: Event) => {
        await saveEvent(event);
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Mis Eventos</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Añadir Evento</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2">Evento</th><th className="p-2">Cliente</th><th className="p-2">Fecha</th><th className="p-2">Monto</th><th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map(event => (
                            <tr key={event.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{event.name}</td>
                                <td className="p-2">{event.client?.name || 'N/A'}</td>
                                <td className="p-2">{new Date(event.date).toLocaleDateString()}</td>
                                <td className="p-2">{formatGuarani(event.amount_charged)}</td>
                                <td className="p-2 flex space-x-2">
                                    <button onClick={() => handleOpenModal(event)} className="text-primary-600 hover:underline">Editar</button>
                                    <button onClick={() => deleteEvent(event.id)} className="text-red-500 hover:underline">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <EventFormModal event={selectedEvent} clients={clients} onSave={handleSave} onClose={() => setIsModalOpen(false)} showAlert={showAlert}/>}
        </div>
    );
};

const GenerateScheduleModal: React.FC<{
    onGenerate: (schedule: Omit<ScheduleItem, 'id'>[]) => void;
    onClose: () => void;
    showAlert: (message: string, type: 'success' | 'error') => void;
}> = ({ onGenerate, onClose, showAlert }) => {
    const [eventType, setEventType] = useState('Boda');
    const [startTime, setStartTime] = useState('20:00');
    const [endTime, setEndTime] = useState('04:00');
    const [keyMoments, setKeyMoments] = useState('Cena, Vals, Lanzamiento de ramo, Cotillón');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const scheduleJson = await generateEventSchedule(eventType, startTime, endTime, keyMoments);
            const scheduleItems = JSON.parse(scheduleJson);
            if (Array.isArray(scheduleItems)) {
                onGenerate(scheduleItems);
            } else {
                throw new Error("La respuesta de la IA no fue un array válido.");
            }
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "Un error desconocido ocurrió.";
            showAlert(`Error al generar cronograma: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg relative">
                 <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <SparklesIcon /> Director de Orquesta IA
                 </h3>
                 <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Proporciona los detalles clave y la IA creará un cronograma profesional para tu evento.</p>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <CloseIcon />
                </button>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="eventType" className="block text-sm font-medium">Tipo de Evento</label>
                        <select id="eventType" value={eventType} onChange={e => setEventType(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                           <option>Boda</option>
                           <option>15 Años</option>
                           <option>Evento Corporativo</option>
                           <option>Cumpleaños</option>
                           <option>Otro</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="startTime" className="block text-sm font-medium">Hora de Inicio</label>
                            <input type="time" id="startTime" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                        </div>
                        <div>
                            <label htmlFor="endTime" className="block text-sm font-medium">Hora de Fin</label>
                            <input type="time" id="endTime" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="keyMoments" className="block text-sm font-medium">Momentos Clave (separados por comas)</label>
                        <textarea id="keyMoments" value={keyMoments} onChange={e => setKeyMoments(e.target.value)} rows={3} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Ej: Cena, Vals, Show de fuegos artificiales..."></textarea>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button type="submit" disabled={isLoading} className="px-4 py-2 rounded bg-primary-600 text-white disabled:bg-primary-400">
                            {isLoading ? 'Generando...' : 'Generar Cronograma'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EventFormModal: React.FC<{event: Event | null, clients: Client[], onSave: (event: Event) => void, onClose: () => void, showAlert: (message: string, type: 'success' | 'error') => void;}> = ({ event, clients, onSave, onClose, showAlert }) => {
    const isNew = !event?.id;
    const initialEventState = useMemo(() => {
        return event 
            ? {...event, date: event.date.split('T')[0], expenses: event.expenses.map(e => ({...e, id: Math.random().toString()})), schedule_items: event.schedule_items?.map(s => ({...s, id: Math.random().toString()})) || []} 
            : { id: '', user_id: '', client_id: clients[0]?.id || null, client: null, name: '', location: '', date: new Date().toISOString().split('T')[0], amount_charged: 0, expenses: [], observations: '', schedule_items: [] };
    }, [event, clients]);

    const [formData, setFormData] = useState<Event>(initialEventState);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({...prev, [name]: name === 'amount_charged' ? parseFloat(value) : value }));
    };

    const handleExpenseChange = (index: number, field: 'type' | 'amount', value: string | number) => {
        const newExpenses = [...formData.expenses];
        if (field === 'amount') {
            newExpenses[index] = { ...newExpenses[index], amount: Number(value) };
        } else {
            newExpenses[index] = { ...newExpenses[index], type: String(value) };
        }
        setFormData(prev => ({...prev, expenses: newExpenses }));
    };
    
    const addExpense = () => {
        setFormData(prev => ({ ...prev, expenses: [...prev.expenses, { id: Math.random().toString(), type: '', amount: 0 }] }));
    };
    
    const removeExpense = (index: number) => {
        setFormData(prev => ({ ...prev, expenses: formData.expenses.filter((_, i) => i !== index) }));
    };

    const handleScheduleGenerated = (items: Omit<ScheduleItem, 'id'>[]) => {
        setFormData(prev => ({
            ...prev,
            schedule_items: items.map(item => ({ ...item, id: Math.random().toString() }))
        }));
        setIsScheduleModalOpen(false);
    };

    const handleScheduleItemChange = (index: number, field: 'activity' | 'details' | 'time', value: string) => {
        const newSchedule = [...(formData.schedule_items || [])];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        setFormData(prev => ({ ...prev, schedule_items: newSchedule }));
    };
    
    const removeScheduleItem = (index: number) => {
        setFormData(prev => ({...prev, schedule_items: formData.schedule_items?.filter((_, i) => i !== index) }));
    };
    
    const totalExpenses = formData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netProfit = formData.amount_charged - totalExpenses;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.client_id) {
            showAlert("Por favor, selecciona un cliente. Si no hay clientes, crea uno primero en la sección de Clientes.", 'error');
            return;
        }
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                 <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear Nuevo' : 'Editar'} Evento</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Event Name */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del Evento</label>
                        <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>

                    {/* Client Select */}
                    <div>
                        <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</label>
                        <select id="client_id" name="client_id" value={formData.client_id || ''} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required>
                            <option value="" disabled>Selecciona un cliente</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    
                    {/* Location and Date */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lugar</label>
                            <input type="text" id="location" name="location" value={formData.location} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fecha</label>
                            <input type="date" id="date" name="date" value={formData.date} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                    </div>

                    {/* Amount Charged */}
                    <div>
                        <label htmlFor="amount_charged" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Monto Cobrado</label>
                        <input type="number" id="amount_charged" name="amount_charged" value={formData.amount_charged} onChange={handleChange} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>

                    {/* Observations */}
                    <div>
                        <label htmlFor="observations" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Observaciones</label>
                        <textarea id="observations" name="observations" value={formData.observations || ''} onChange={handleChange} rows={3} className="mt-1 w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"></textarea>
                    </div>

                    {/* Expenses */}
                    <div className="border-t dark:border-gray-600 pt-4">
                        <h4 className="text-lg font-semibold mb-2">Gastos</h4>
                        {formData.expenses.map((exp, index) => (
                            <div key={exp.id} className="flex items-center space-x-2 mb-2">
                                <input type="text" placeholder="Tipo de Gasto" value={exp.type} onChange={e => handleExpenseChange(index, 'type', e.target.value)} className="w-1/2 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <input type="number" placeholder="Monto" value={exp.amount} onChange={e => handleExpenseChange(index, 'amount', e.target.value)} className="w-1/3 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <button type="button" onClick={() => removeExpense(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><TrashIcon /></button>
                            </div>
                        ))}
                        <button type="button" onClick={addExpense} className="mt-2 text-sm text-primary-600 hover:underline flex items-center"><PlusIcon /> Añadir Gasto</button>
                    </div>
                    
                    {/* AI Schedule */}
                    <div className="border-t dark:border-gray-600 pt-4">
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <ClipboardListIcon />
                                <h4 className="text-lg font-semibold">Cronograma del Evento (Director de Orquesta IA)</h4>
                            </div>
                            <button type="button" onClick={() => setIsScheduleModalOpen(true)} className="flex items-center gap-2 text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1.5 rounded-full hover:bg-blue-200 transition">
                                <SparklesIcon />
                                Generar con IA
                            </button>
                        </div>
                        {formData.schedule_items && formData.schedule_items.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                {formData.schedule_items.map((item, index) => (
                                    <div key={item.id} className="flex items-start space-x-2">
                                        <input type="text" value={item.time} onChange={(e) => handleScheduleItemChange(index, 'time', e.target.value)} className="w-1/4 p-1.5 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Hora" />
                                        <div className="w-3/4">
                                            <input type="text" value={item.activity} onChange={(e) => handleScheduleItemChange(index, 'activity', e.target.value)} className="w-full p-1.5 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Actividad" />
                                            <textarea value={item.details} onChange={(e) => handleScheduleItemChange(index, 'details', e.target.value)} className="w-full mt-1 p-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 text-xs" placeholder="Detalles para el DJ..." rows={2}></textarea>
                                        </div>
                                        <button type="button" onClick={() => removeScheduleItem(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full flex-shrink-0 mt-1"><TrashIcon /></button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 italic">No se ha generado un cronograma. Usa el botón "Generar con IA" para empezar.</p>
                        )}
                    </div>

                    {/* Totals */}
                    <div className="border-t dark:border-gray-600 pt-4 text-right">
                        <p>Total Gastos: <span className="font-semibold">{formatGuarani(totalExpenses)}</span></p>
                        <p>Ganancia Neta: <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatGuarani(netProfit)}</span></p>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar Evento</button>
                    </div>
                </form>
            </div>
            {isScheduleModalOpen && <GenerateScheduleModal onGenerate={handleScheduleGenerated} onClose={() => setIsScheduleModalOpen(false)} showAlert={showAlert} />}
        </div>
    );
};

const ClientsPage: React.FC<{clients: Client[], saveClient: (client: Client) => Promise<Client | null>, deleteClient: (id: string) => Promise<void>}> = ({ clients, saveClient, deleteClient }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    const handleOpenModal = (client: Client | null) => {
        setSelectedClient(client);
        setIsModalOpen(true);
    };

    const handleSave = async (client: Client) => {
        await saveClient(client);
        setIsModalOpen(false);
    };
    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Mis Clientes</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Añadir Cliente</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2">Nombre</th><th className="p-2">Teléfono</th><th className="p-2">Email</th><th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => (
                            <tr key={client.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{client.name}</td>
                                <td className="p-2">{client.phone}</td>
                                <td className="p-2">{client.email}</td>
                                <td className="p-2 flex space-x-2">
                                    <button onClick={() => handleOpenModal(client)} className="text-primary-600 hover:underline">Editar</button>
                                    <button onClick={() => deleteClient(client.id)} className="text-red-500 hover:underline">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <ClientFormModal client={selectedClient} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    )
}

const ClientFormModal: React.FC<{client: Client | null, onSave: (client: Client) => void, onClose: () => void}> = ({ client, onSave, onClose }) => {
    const isNew = !client?.id;
    const [formData, setFormData] = useState<Client>(client || { id: '', user_id: '', name: '', phone: '', email: '' });
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear Nuevo' : 'Editar'} Cliente</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Nombre Completo" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="Teléfono" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <input type="email" name="email" value={formData.email || ''} onChange={handleChange} placeholder="Email (Opcional)" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar Cliente</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ReportsPage: React.FC<{ events: Event[], currentUser: User }> = ({ events, currentUser }) => {
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    const filteredEvents = useMemo(() => {
        if (!startDate || !endDate) return events;
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include events on the end date
        return events.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= start && eventDate <= end;
        });
    }, [events, startDate, endDate]);

    const { totalIncome, totalExpenses, totalEvents, profit } = useMemo(() => {
        const income = filteredEvents.reduce((acc, e) => acc + e.amount_charged, 0);
        const expenses = filteredEvents.reduce((acc, e) => acc + e.expenses.reduce((subAcc, exp) => subAcc + exp.amount, 0), 0);
        return {
            totalIncome: income,
            totalExpenses: expenses,
            totalEvents: filteredEvents.length,
            profit: income - expenses
        };
    }, [filteredEvents]);

    const generatePDF = async () => {
        const doc = new jsPDF();
        const pageMargin = 15;
        const logoDataUrl = currentUser.companyLogoUrl ? await getBase64ImageFromUrl(currentUser.companyLogoUrl) : null;
        
        if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', pageMargin, 15, 20, 20);
        doc.setFontSize(18);
        doc.text(currentUser.company_name, logoDataUrl ? pageMargin + 25 : pageMargin, 22);
        doc.setFontSize(12);
        doc.text('Reporte de Eventos', logoDataUrl ? pageMargin + 25 : pageMargin, 28);
        
        const dateRangeText = (startDate && endDate) 
            ? `Periodo: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
            : 'Periodo: Todos los eventos';
        doc.setFontSize(10);
        doc.text(dateRangeText, pageMargin, 40);

        autoTable(doc, {
            startY: 50,
            head: [['Evento', 'Cliente', 'Fecha', 'Ingreso', 'Gastos', 'Ganancia']],
            body: filteredEvents.map(e => {
                const eventExpenses = e.expenses.reduce((acc, exp) => acc + exp.amount, 0);
                const eventProfit = e.amount_charged - eventExpenses;
                return [
                    e.name,
                    e.client?.name || 'N/A',
                    new Date(e.date).toLocaleDateString(),
                    formatGuarani(e.amount_charged),
                    formatGuarani(eventExpenses),
                    formatGuarani(eventProfit)
                ]
            }),
            theme: 'grid',
            headStyles: { fillColor: '#1d4ed8' }
        });

        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.text('Resumen General', pageMargin, finalY);
        autoTable(doc, {
            startY: finalY + 5,
            body: [
                ['Eventos Totales', totalEvents.toString()],
                ['Ingresos Totales', formatGuarani(totalIncome)],
                ['Gastos Totales', formatGuarani(totalExpenses)],
                ['Ganancia Neta', formatGuarani(profit)]
            ],
            theme: 'striped',
            styles: { fontStyle: 'bold' }
        });
        
        doc.save(`Reporte_GestionSystem_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h3 className="text-xl font-semibold">Reportes</h3>
                <div className="flex items-center gap-4">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <span>-</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    <button onClick={generatePDF} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Exportar PDF</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg"><h4 className="text-sm font-semibold">Eventos Totales</h4><p className="text-2xl font-bold">{totalEvents}</p></div>
                <div className="bg-green-100 dark:bg-green-900/50 p-4 rounded-lg"><h4 className="text-sm font-semibold">Ingresos Totales</h4><p className="text-2xl font-bold">{formatGuarani(totalIncome)}</p></div>
                <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-lg"><h4 className="text-sm font-semibold">Gastos Totales</h4><p className="text-2xl font-bold">{formatGuarani(totalExpenses)}</p></div>
                <div className="bg-blue-100 dark:bg-blue-900/50 p-4 rounded-lg"><h4 className="text-sm font-semibold">Ganancia Neta</h4><p className="text-2xl font-bold">{formatGuarani(profit)}</p></div>
            </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead><tr className="border-b dark:border-gray-700"><th className="p-2">Evento</th><th className="p-2">Fecha</th><th className="p-2">Ingreso</th><th className="p-2">Gastos</th><th className="p-2">Ganancia</th></tr></thead>
                    <tbody>
                    {filteredEvents.map(e => {
                        const eventExpenses = e.expenses.reduce((acc, exp) => acc + exp.amount, 0);
                        const eventProfit = e.amount_charged - eventExpenses;
                        return (
                             <tr key={e.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{e.name}</td>
                                <td className="p-2">{new Date(e.date).toLocaleDateString()}</td>
                                <td className="p-2 text-green-600">{formatGuarani(e.amount_charged)}</td>
                                <td className="p-2 text-red-600">{formatGuarani(eventExpenses)}</td>
                                <td className={`p-2 font-bold ${eventProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatGuarani(eventProfit)}</td>
                            </tr>
                        )
                    })}
                    </tbody>
                 </table>
            </div>
        </div>
    )
}

const AnnouncementsPage: React.FC<{announcements: Announcement[], saveAnnouncement: (announcement: Announcement, imageFile?: File | null) => Promise<void>, deleteAnnouncement: (id: string) => Promise<void>, toggleAnnouncementActive: (announcement: Announcement) => Promise<void>}> = ({ announcements, saveAnnouncement, deleteAnnouncement, toggleAnnouncementActive }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

    const handleOpenModal = (announcement: Announcement | null) => {
        setSelectedAnnouncement(announcement);
        setIsModalOpen(true);
    };

    const handleSave = async (announcement: Announcement, imageFile?: File | null) => {
        await saveAnnouncement(announcement, imageFile);
        setIsModalOpen(false);
    };

    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Anuncios</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Anuncio</button>
            </div>
            <div className="space-y-4">
                {announcements.map(ann => (
                    <div key={ann.id} className="p-4 border dark:border-gray-700 rounded-lg flex items-center justify-between">
                        <div>
                            <h4 className="font-bold">{ann.title}</h4>
                            <p className="text-sm text-gray-500">{ann.content}</p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={ann.is_active} onChange={() => toggleAnnouncementActive(ann)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                            </label>
                            <button onClick={() => handleOpenModal(ann)} className="text-primary-600">Editar</button>
                            <button onClick={() => deleteAnnouncement(ann.id)} className="text-red-500">Eliminar</button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <AnnouncementFormModal announcement={selectedAnnouncement} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const AnnouncementFormModal: React.FC<{announcement: Announcement | null, onSave: (announcement: Announcement, imageFile?: File | null) => void, onClose: () => void}> = ({ announcement, onSave, onClose }) => {
    const isNew = !announcement?.id;
    const [formData, setFormData] = useState<Announcement>(announcement || { id: '', title: '', content: '', is_active: true, created_at: new Date().toISOString() });
    const [imageFile, setImageFile] = useState<File | null>(null);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({...prev, [e.target.name]: e.target.value}));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, imageFile);
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear' : 'Editar'} Anuncio</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Título" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <textarea name="content" value={formData.content} onChange={handleChange} placeholder="Contenido" rows={4} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <div>
                        <label className="block text-sm text-gray-500">Imagen (Opcional)</label>
                        <input type="file" onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"/>
                    </div>
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SendNotificationPage: React.FC<{sendNotificationToAll: (message: string) => Promise<void>}> = ({ sendNotificationToAll }) => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message) return;
        setIsSending(true);
        await sendNotificationToAll(message);
        setMessage('');
        setIsSending(false);
    };

    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow max-w-lg mx-auto">
            <h3 className="text-xl font-semibold mb-4">Enviar Notificación a Todos los Usuarios</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Escribe tu mensaje aquí..." rows={5} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                <button type="submit" disabled={isSending} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                    {isSending ? 'Enviando...' : 'Enviar Notificación'}
                </button>
            </form>
        </div>
    );
};

const InquiriesPage: React.FC<{
    inquiries: Inquiry[],
    convertInquiryToBudget: (inquiry: Inquiry) => Promise<void>,
    fetchInquiries: () => void,
    currentUser: User,
    onGetSuggestion: (inquiry: Inquiry) => void
}> = ({ inquiries, convertInquiryToBudget, fetchInquiries, currentUser, onGetSuggestion }) => {
    
    const updateStatus = async (inquiryId: string, status: Inquiry['status']) => {
        const { error } = await supabase.from('inquiries').update({ status }).eq('id', inquiryId);
        if (error) {
            console.error("Error updating inquiry status:", error);
        } else {
            fetchInquiries(); // Re-fetch to update the UI
        }
    };
    
    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-4">Consultas de Clientes</h3>
            <div className="space-y-4">
                {inquiries.map(inquiry => (
                     <div key={inquiry.id} className="p-4 border dark:border-gray-700 rounded-lg">
                        <div className="flex justify-between items-start">
                             <div>
                                <p className="font-bold">{inquiry.client_name}</p>
                                <p className="text-sm">{inquiry.event_type} - {inquiry.event_date}</p>
                                <p className="text-sm text-gray-500 mt-2">{inquiry.message}</p>
                            </div>
                            <div className="flex items-center gap-4">
                               <select value={inquiry.status} onChange={(e) => updateStatus(inquiry.id, e.target.value as Inquiry['status'])} className="p-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600">
                                   <option>Nueva</option>
                                   <option>Contactado</option>
                                   <option>Presupuesto Enviado</option>
                               </select>
                                <button onClick={() => onGetSuggestion(inquiry)} title="Sugerencia de respuesta IA" className="p-2 text-yellow-500 hover:bg-yellow-100 rounded-full"><SparklesIcon /></button>
                                <button onClick={() => convertInquiryToBudget(inquiry)} className="text-sm bg-green-500 text-white px-3 py-1 rounded">Convertir a Presupuesto</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const BudgetsPage: React.FC<{
    budgets: Budget[], clients: Client[], currentUser: User,
    saveBudget: (budget: Budget) => Promise<void>,
    deleteBudget: (id: string) => Promise<void>,
    showAlert: (message: string, type: 'success' | 'error') => void,
    isModalOpen: boolean, setIsModalOpen: (isOpen: boolean) => void,
    selectedBudget: Budget | null, setSelectedBudget: (budget: Budget | null) => void,
    onGetSuggestion: (budget: Budget) => void
}> = (props) => {
    const { budgets, clients, currentUser, saveBudget, deleteBudget, showAlert, isModalOpen, setIsModalOpen, selectedBudget, setSelectedBudget, onGetSuggestion } = props;

    const handleOpenModal = (budget: Budget | null) => {
        setSelectedBudget(budget);
        setIsModalOpen(true);
    };

    const handleSave = async (budget: Budget) => {
        await saveBudget(budget);
        setIsModalOpen(false);
    };
    
    const handleGeneratePdf = async (budget: Budget) => {
        const client = clients.find(c => c.id === budget.client_id);
        const doc = await generateBudgetPDF(budget, currentUser, client);
        doc.save(`Presupuesto_${budget.id.substring(0,6)}_${client?.name || 'cliente'}.pdf`);
    };

    const getStatusColor = (status: BudgetStatus) => {
        switch (status) {
            case 'Aceptado': return 'bg-green-100 text-green-800';
            case 'Enviado': return 'bg-blue-100 text-blue-800';
            case 'Rechazado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    
    return (
         <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Presupuestos</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Presupuesto</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                     <thead><tr className="border-b dark:border-gray-700"><th className="p-2">Título</th><th className="p-2">Cliente</th><th className="p-2">Total</th><th className="p-2">Estado</th><th className="p-2">Acciones</th></tr></thead>
                    <tbody>
                        {budgets.map(budget => {
                             const total = budget.items.reduce((acc, item) => acc + item.quantity * item.price, 0) - budget.discount;
                             return (
                                <tr key={budget.id} className="border-b dark:border-gray-700">
                                    <td className="p-2">{budget.title}</td>
                                    <td className="p-2">{clients.find(c => c.id === budget.client_id)?.name || 'N/A'}</td>
                                    <td className="p-2">{formatGuarani(total)}</td>
                                    <td className="p-2"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(budget.status)}`}>{budget.status}</span></td>
                                    <td className="p-2 flex space-x-2 items-center">
                                         <button onClick={() => handleGeneratePdf(budget)} title="Descargar PDF"><PdfIcon /></button>
                                         <button onClick={() => onGetSuggestion(budget)} title="Sugerir email de seguimiento"><EmailIcon /></button>
                                         <button onClick={() => handleOpenModal(budget)} title="Editar"><EditIcon /></button>
                                         <button onClick={() => deleteBudget(budget.id)} title="Eliminar"><TrashIcon /></button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <BudgetFormModal budget={selectedBudget} clients={clients} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    )
};

const BudgetFormModal: React.FC<{budget: Budget | null, clients: Client[], onSave: (budget: Budget) => void, onClose: () => void}> = ({ budget, clients, onSave, onClose }) => {
    const isNew = !budget?.id;
    const initialBudgetState: Budget = {
        id: '', user_id: '', client_id: clients[0]?.id || '', title: '', status: 'Borrador',
        items: [{ id: Math.random().toString(), description: '', quantity: 1, price: 0 }],
        discount: 0, notes: '', valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], created_at: new Date().toISOString()
    };
    const [formData, setFormData] = useState<Budget>(budget ? {...budget, valid_until: budget.valid_until?.split('T')[0]} : initialBudgetState);
    const [eventDescription, setEventDescription] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({...prev, [name]: (name === 'discount' ? parseFloat(value) || 0 : value)}));
    };
    
    const handleItemChange = (index: number, field: keyof BudgetItem, value: string | number) => {
        const newItems = [...formData.items];
        (newItems[index] as any)[field] = (field === 'quantity' || field === 'price') ? Number(value) : value;
        setFormData(prev => ({...prev, items: newItems}));
    };

    const addItem = () => setFormData(prev => ({...prev, items: [...prev.items, { id: Math.random().toString(), description: '', quantity: 1, price: 0 }]}));
    const removeItem = (index: number) => setFormData(prev => ({...prev, items: prev.items.filter((_, i) => i !== index)}));
    const total = formData.items.reduce((acc, item) => acc + item.quantity * item.price, 0) - formData.discount;
    
    const handleGetSuggestions = async () => {
        if (!eventDescription) return;
        setIsSuggesting(true);
        const suggestions = await getBudgetItemsSuggestion(eventDescription);
        if (suggestions && suggestions !== "Error al generar sugerencias") {
            const suggestedItems = suggestions.split(',').map(s => s.trim()).filter(Boolean);
            const newItems = suggestedItems.map(desc => ({ id: Math.random().toString(), description: desc, quantity: 1, price: 0 }));
            setFormData(prev => ({...prev, items: newItems}));
        }
        setIsSuggesting(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_id) { alert('Por favor, selecciona un cliente.'); return; }
        onSave(formData);
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                 <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear' : 'Editar'} Presupuesto</h2>
                 <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Título del Presupuesto" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <select name="client_id" value={formData.client_id} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required>
                             <option value="" disabled>Seleccione un Cliente</option>
                             {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                     <div className="border-t dark:border-gray-700 pt-4">
                        <label className="block text-sm font-medium">Generar Items con IA</label>
                        <div className="flex gap-2 mt-1">
                            <input type="text" value={eventDescription} onChange={e => setEventDescription(e.target.value)} placeholder="Ej: Boda para 100 personas en una quinta" className="flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                            <button type="button" onClick={handleGetSuggestions} disabled={isSuggesting} className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-blue-400"><SparklesIcon /></button>
                        </div>
                    </div>
                     <div className="border-t dark:border-gray-700 pt-4">
                        <h4 className="text-lg font-semibold mb-2">Items</h4>
                         {formData.items.map((item, index) => (
                             <div key={item.id} className="grid grid-cols-12 gap-2 mb-2">
                                <input type="text" placeholder="Descripción" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="col-span-6 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <input type="number" placeholder="Cant." value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="col-span-2 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <input type="number" placeholder="Precio" value={item.price} onChange={e => handleItemChange(index, 'price', e.target.value)} className="col-span-3 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <button type="button" onClick={() => removeItem(index)} className="col-span-1 p-2 text-red-500 hover:bg-red-100 rounded-full flex justify-center items-center"><TrashIcon /></button>
                            </div>
                         ))}
                        <button type="button" onClick={addItem} className="mt-2 text-sm text-primary-600 hover:underline flex items-center"><PlusIcon /> Añadir Item</button>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"><option>Borrador</option><option>Enviado</option><option>Aceptado</option><option>Rechazado</option></select>
                        <input type="date" name="valid_until" value={formData.valid_until || ''} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                    </div>
                    <textarea name="notes" value={formData.notes || ''} onChange={handleChange} placeholder="Notas adicionales..." rows={3} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <div className="flex justify-between items-center border-t dark:border-gray-700 pt-4">
                        <div>
                            <label>Descuento:</label>
                            <input type="number" name="discount" value={formData.discount} onChange={handleChange} className="w-32 p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ml-2"/>
                        </div>
                        <div className="text-right">
                           <p className="text-gray-600 dark:text-gray-300">Total:</p>
                           <p className="text-xl font-bold">{formatGuarani(total)}</p>
                        </div>
                    </div>
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar Presupuesto</button>
                    </div>
                 </form>
            </div>
        </div>
    );
};

const CoachPage: React.FC<{ events: Event[], clients: Client[] }> = ({ events, clients }) => {
    const [topic, setTopic] = useState('');
    const [advice, setAdvice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chat = useRef<Chat | null>(null);

    useEffect(() => {
        if (ai) {
            chat.current = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: `Eres un coach de negocios experto para DJs y organizadores de eventos. Analiza los datos proporcionados y da consejos accionables. Los datos del usuario son: ${events.length} eventos y ${clients.length} clientes. Sé conciso y práctico.`
                }
            });
        }
    }, [events, clients]);

    const getAdvice = async () => {
        if (!topic || !chat.current) return;
        setIsLoading(true);
        setAdvice('');
        try {
            const result = await chat.current.sendMessageStream({ message: topic });
            for await (const chunk of result) {
                setAdvice(prev => prev + chunk.text);
            }
        } catch (error) {
            console.error("Error getting advice from Gemini:", error);
            setAdvice("Hubo un error al contactar al Coach de IA. Por favor, inténtalo de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow max-w-3xl mx-auto">
            <div className="text-center mb-6">
                <BrainCircuitIcon />
                <h3 className="text-2xl font-semibold mt-2">Tu Coach de Negocios IA</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Pregunta cualquier cosa sobre cómo mejorar tu negocio de eventos.</p>
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Ej: ¿Cómo puedo conseguir más clientes para bodas?"
                    className="flex-grow p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    onKeyDown={e => e.key === 'Enter' && getAdvice()}
                />
                <button onClick={getAdvice} disabled={isLoading || !topic} className="bg-primary-600 text-white px-6 py-3 rounded-lg disabled:bg-primary-400">
                    {isLoading ? 'Pensando...' : 'Preguntar'}
                </button>
            </div>
            {advice && (
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border dark:border-gray-600">
                    <h4 className="font-semibold mb-2">Consejo del Coach:</h4>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{advice}</p>
                </div>
            )}
        </div>
    );
};

const AdminSupportPage: React.FC<{
    conversations: User[],
    selectedUser: User | null,
    onSelectUser: (user: User) => void,
    messages: ChatMessage[],
    onSendMessage: (content: string) => void,
    currentUser: User,
    unreadCountsByConversation: Map<string, number>
}> = ({ conversations, selectedUser, onSelectUser, messages, onSendMessage, currentUser, unreadCountsByConversation }) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    
    const handleSend = () => {
        if (newMessage.trim()) {
            onSendMessage(newMessage);
            setNewMessage('');
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[80vh] flex">
            {/* Conversation List */}
            <div className="w-1/3 border-r dark:border-gray-700 flex flex-col">
                <div className="p-4 border-b dark:border-gray-700">
                    <h3 className="font-semibold">Conversaciones de Soporte</h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.map(user => (
                        <div
                            key={user.id}
                            onClick={() => onSelectUser(user)}
                            className={`p-4 cursor-pointer flex justify-between items-center ${selectedUser?.id === user.id ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            <span>{user.company_name}</span>
                             {(unreadCountsByConversation.get(user.id) || 0) > 0 && (
                                <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                    {unreadCountsByConversation.get(user.id)}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Window */}
            <div className="w-2/3 flex flex-col">
                {selectedUser ? (
                    <>
                        <div className="p-4 border-b dark:border-gray-700">
                            <h3 className="font-semibold">Chat con {selectedUser.company_name}</h3>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                            {messages.map(msg => (
                                <div key={msg.id} className={`flex mb-4 ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender_id === currentUser.id ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                                        <p>{msg.content}</p>
                                        <p className="text-xs opacity-75 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="p-4 border-t dark:border-gray-700 flex gap-2">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="Escribe un mensaje..."
                                className="flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            />
                            <button onClick={handleSend} className="bg-primary-600 text-white px-4 py-2 rounded">Enviar</button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex justify-center items-center text-gray-500">
                        Selecciona una conversación para empezar.
                    </div>
                )}
            </div>
        </div>
    );
};

const UserChatPage: React.FC<{
    currentUser: User,
    messages: ChatMessage[],
    onSendMessage: (content: string, recipientId?: string) => void,
    isLoading: boolean
}> = ({ currentUser, messages, onSendMessage, isLoading }) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = () => {
        if (newMessage.trim()) {
            onSendMessage(newMessage);
            setNewMessage('');
        }
    };
    
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[80vh] flex flex-col max-w-3xl mx-auto">
            <div className="p-4 border-b dark:border-gray-700 text-center">
                <h3 className="font-semibold text-xl">Contacto con Soporte Técnico</h3>
                <p className="text-sm text-gray-500">Estamos aquí para ayudarte. El horario de atención es de 9:00 a 18:00.</p>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                 {messages.map(msg => (
                    <div key={msg.id} className={`flex mb-4 ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender_id === currentUser.id ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                            <p>{msg.content}</p>
                            <p className="text-xs opacity-75 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString()}</p>
                        </div>
                    </div>
                ))}
                 <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Escribe tu consulta aquí..."
                    className="flex-grow p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                />
                <button onClick={handleSend} disabled={isLoading} className="bg-primary-600 text-white px-4 py-2 rounded disabled:bg-primary-400">
                    {isLoading ? 'Enviando...' : 'Enviar'}
                </button>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    // Auth & User State
    const [session, setSession] = useState<AuthSession | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    // App State
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Data State
    const [events, setEvents] = useState<Event[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);

    // Modal & Alert State
    const [alertState, setAlertState] = useState<AlertState>({ isOpen: false, message: '', type: 'success' });
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [aiSuggestionModal, setAiSuggestionModal] = useState({ isOpen: false, title: '', suggestion: '', isLoading: false });

    // Chat State
    const [chatConversations, setChatConversations] = useState<User[]>([]);
    const [selectedChatUser, setSelectedChatUser] = useState<User | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [adminUserId, setAdminUserId] = useState<string | null>(null);
    const [unreadCounts, setUnreadCounts] = useState(new Map<string, number>());
    
    // --- Effects ---

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchAnnouncements = useCallback(async () => {
        const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if(data) setAnnouncements(data);
        else console.error("Error fetching announcements:", error);
    }, []);

    const fetchAdminData = useCallback(async () => {
        // Fetch all users for management
        const { data: usersData, error: usersError } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (usersData) setUsers(usersData);
        else console.error("Error fetching users:", usersError);

        // Fetch activity logs
        const { data: logsData, error: logsError } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
        if (logsData) setActivityLogs(logsData);
        else console.error("Error fetching activity logs:", logsError);

        fetchAnnouncements();

        // Fetch stats
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: newUsersCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo);
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: expiringCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).lte('activeUntil', thirtyDaysFromNow).gte('activeUntil', new Date().toISOString());
        const { count: totalEventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true });

        if(usersData) {
            const userCountsByDate: Record<string, number> = {};
            for (const user of usersData) {
                const date = new Date(user.created_at).toISOString().split('T')[0];
                userCountsByDate[date] = (userCountsByDate[date] || 0) + 1;
            }
            const sortedDates = Object.keys(userCountsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            let cumulativeUsers = 0;
            const growthData = sortedDates.map(date => {
                cumulativeUsers += userCountsByDate[date];
                return { name: date, Usuarios: cumulativeUsers };
            });

            setAdminStats({
                newUsersLast30Days: newUsersCount || 0,
                licensesExpiringSoon: expiringCount || 0,
                totalEvents: totalEventsCount || 0,
                growthChartData: growthData.slice(-30),
            });
        }
    }, [fetchAnnouncements]);

    const fetchEvents = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('events').select('*, client:clients(*)').eq('user_id', userId);
        if (data) setEvents(data);
        else console.error("Error fetching events:", error);
    }, []);

    const fetchClients = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId);
        if (data) setClients(data);
        else console.error("Error fetching clients:", error);
    }, []);

    const fetchBudgets = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('budgets').select('*, client:clients(*)').eq('user_id', userId).order('created_at', { ascending: false });
        if (data) setBudgets(data);
        else console.error("Error fetching budgets:", error);
    }, []);

    const fetchInquiries = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('inquiries').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (data) setInquiries(data);
        else console.error("Error fetching inquiries:", error);
    }, []);

    const fetchNotifications = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
        if (data) setNotifications(data);
        else console.error("Error fetching notifications:", error);
    }, []);

    const fetchAdminUserId = useCallback(async () => {
        const { data, error } = await supabase.from('users').select('id').eq('role', 'admin').limit(1).single();
        if (data) setAdminUserId(data.id);
        else console.error("Could not find admin user:", error);
    }, []);

    const fetchUnreadCounts = useCallback(async () => {
        if (currentUser?.role !== 'admin') return;
        const { data, error } = await supabase.from('chat_messages').select('sender_id').eq('recipient_id', currentUser.id).eq('is_read', false);
        if (error) { console.error("Error fetching unread counts:", error); return; }
        if (data) {
            const counts = new Map<string, number>();
            for (const message of data) {
                if (message.sender_id) {
                    counts.set(message.sender_id, (counts.get(message.sender_id) || 0) + 1);
                }
            }
            setUnreadCounts(counts);
        }
    }, [currentUser]);

    const fetchAllData = useCallback(async (user: User) => {
        if (user.role === 'admin') {
            fetchAdminData();
        } else {
            fetchEvents(user.id);
            fetchClients(user.id);
            fetchBudgets(user.id);
            fetchInquiries(user.id);
            fetchNotifications(user.id);
            fetchAdminUserId();
        }
    }, [fetchAdminData, fetchEvents, fetchClients, fetchBudgets, fetchInquiries, fetchNotifications, fetchAdminUserId]);

    const fetchChatConversations = useCallback(async () => {
        if (!currentUser || currentUser.role !== 'admin') return;
        const { data, error } = await supabase.rpc('get_conversations', { admin_id: currentUser.id });
        if (error) console.error("Error fetching conversations:", error);
        else if (data) setChatConversations(data);
    }, [currentUser]);
    
    const fetchUserProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (data) setCurrentUser(data);
        else {
            console.error("Error fetching profile:", error);
            await supabase.auth.signOut();
        }
    }, []);

    useEffect(() => {
        if (session?.user) {
            fetchUserProfile(session.user.id);
        }
    }, [session, fetchUserProfile]);

    useEffect(() => {
        if (currentUser) {
            fetchAllData(currentUser);
        }
    }, [currentUser, fetchAllData]);
    
    // --- Realtime Subscriptions ---
    useEffect(() => {
        if (!currentUser) return;
        
        const handleNewMessage = (payload: any) => {
            const newMessage = payload.new as ChatMessage;
            const isForMe = newMessage.recipient_id === currentUser.id;
            
            if (isForMe) {
                 if(currentUser.role === 'admin') {
                    if(selectedChatUser && newMessage.sender_id === selectedChatUser.id) {
                         setChatMessages(prev => [...prev, newMessage]);
                    }
                    fetchUnreadCounts();
                 } else {
                    setChatMessages(prev => [...prev, newMessage]);
                 }
            }
        };

        const messageChannel = supabase
            .channel('public:chat_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, handleNewMessage)
            .subscribe();
            
        return () => { supabase.removeChannel(messageChannel); };
    }, [currentUser, selectedChatUser, fetchUnreadCounts]);

    useEffect(() => {
        if (currentUser?.role === 'admin') {
            fetchChatConversations();
            fetchUnreadCounts();
            const conversationSubscription = supabase
                .channel('public:chat_messages:conversations')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
                    fetchChatConversations();
                    fetchUnreadCounts();
                })
                .subscribe();
            return () => { supabase.removeChannel(conversationSubscription); };
        }
    }, [currentUser, fetchChatConversations, fetchUnreadCounts]);

    // --- Helper & Data Functions ---
    const toggleTheme = () => setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    const showAlert = (message: string, type: 'success' | 'error') => setAlertState({ isOpen: true, message, type });

    const saveEvent = useCallback(async (event: Event) => {
        const eventToSave = {
            ...event,
            user_id: currentUser!.id,
            schedule_items: event.schedule_items?.map(({ id, ...rest }) => rest),
            expenses: event.expenses.map(({ id, ...rest }) => rest)
        };
        delete eventToSave.client;

        const { data, error } = await supabase.from('events').upsert(eventToSave).select('*, client:clients(*)').single();
        if (error) showAlert(error.message, 'error');
        else if(data) {
            showAlert('Evento guardado con éxito.', 'success');
            setEvents(prev => event.id ? prev.map(e => e.id === data.id ? data : e) : [...prev, data]);
            logActivity('save_event', { eventId: data.id, eventName: data.name });
        }
    }, [currentUser]);

    const deleteEvent = useCallback(async (id: string) => {
        if (!window.confirm('¿Estás seguro de que quieres eliminar este evento?')) return;
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) showAlert(error.message, 'error');
        else {
            setEvents(prev => prev.filter(e => e.id !== id));
            showAlert('Evento eliminado.', 'success');
            logActivity('delete_event', { eventId: id });
        }
    }, []);

    const saveClient = useCallback(async (client: Client): Promise<Client | null> => {
        const clientToSave = { ...client, user_id: currentUser!.id };
        const { data, error } = await supabase.from('clients').upsert(clientToSave).select().single();
        if (error) {
            showAlert(error.message, 'error');
            return null;
        }
        else if (data) {
            showAlert('Cliente guardado.', 'success');
            setClients(prev => client.id ? prev.map(c => c.id === data.id ? data : c) : [...prev, data]);
            logActivity('save_client', { clientId: data.id, clientName: data.name });
            return data;
        }
        return null;
    }, [currentUser]);

    const deleteClient = useCallback(async (id: string) => {
        const associatedEvents = events.filter(e => e.client_id === id);
        if (associatedEvents.length > 0) {
            showAlert(`No se puede eliminar. El cliente está asociado a ${associatedEvents.length} evento(s).`, 'error');
            return;
        }
        if (!window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) return;
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) showAlert(error.message, 'error');
        else {
            setClients(prev => prev.filter(c => c.id !== id));
            showAlert('Cliente eliminado.', 'success');
            logActivity('delete_client', { clientId: id });
        }
    }, [events]);

    const saveBudget = useCallback(async (budget: Budget) => {
        const budgetToSave = { ...budget, user_id: currentUser!.id, items: budget.items.map(({ id, ...rest }) => rest) };
        delete budgetToSave.client;

        const { data, error } = await supabase.from('budgets').upsert(budgetToSave).select('*, client:clients(*)').single();
        if (error) showAlert(error.message, 'error');
        else if(data) {
            showAlert('Presupuesto guardado.', 'success');
            setBudgets(prev => budget.id ? prev.map(b => b.id === data.id ? data : b) : [...prev, data]);
            logActivity('save_budget', { budgetId: data.id, budgetTitle: data.title });
        }
    }, [currentUser]);

    const deleteBudget = useCallback(async (id: string) => {
        if (!window.confirm('¿Estás seguro de que quieres eliminar este presupuesto?')) return;
        const { error } = await supabase.from('budgets').delete().eq('id', id);
        if (error) showAlert(error.message, 'error');
        else {
            setBudgets(prev => prev.filter(b => b.id !== id));
            showAlert('Presupuesto eliminado.', 'success');
            logActivity('delete_budget', { budgetId: id });
        }
    }, []);

    const saveUser = useCallback(async (user: User, password?: string) => {
        if (user.id) { // Existing user
            if (password) {
                 showAlert('La actualización de contraseña para usuarios existentes debe hacerse a través del flujo de recuperación de contraseña de Supabase.', 'error');
            }
            const { data, error } = await supabase.from('users').update({
                company_name: user.company_name,
                status: user.status,
                activeUntil: user.activeUntil,
                notification_email: user.notification_email
            }).eq('id', user.id).select().single();

            if (error) showAlert(error.message, 'error');
            else if (data) {
                setUsers(prev => prev.map(u => u.id === data.id ? data : u));
                if (currentUser?.id === data.id) setCurrentUser(data);
                showAlert('Usuario actualizado.', 'success');
                logActivity('update_user', { userId: data.id, userEmail: data.email });
            }
        } else { // New user
            const { data: { user: newAuthUser }, error: authError } = await supabase.auth.signUp({
                email: user.email!,
                password: password!,
            });
            if (authError) { showAlert(authError.message, 'error'); return; }
            if (newAuthUser) {
                const { data, error } = await supabase.from('users').insert({
                    id: newAuthUser.id,
                    email: newAuthUser.email,
                    company_name: user.company_name,
                    status: user.status,
                    activeUntil: user.activeUntil,
                    role: user.role
                }).select().single();
                if (error) showAlert(error.message, 'error');
                else if(data) {
                    setUsers(prev => [...prev, data]);
                    showAlert('Usuario creado.', 'success');
                    logActivity('create_user', { userId: data.id, userEmail: data.email });
                }
            }
        }
    }, [currentUser]);

    const uploadLogo = useCallback(async (userId: string, file: File): Promise<string | null> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true });
        if (uploadError) { showAlert(`Error al subir logo: ${uploadError.message}`, 'error'); return null; }
        const { data } = supabase.storage.from('logos').getPublicUrl(fileName);
        return data.publicUrl;
    }, []);

    const saveAnnouncement = useCallback(async (announcement: Announcement, imageFile?: File | null) => {
        let imageUrl = announcement.image_url;
        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `announcement-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('announcements').upload(fileName, imageFile);
            if (uploadError) { showAlert(`Error al subir imagen: ${uploadError.message}`, 'error'); return; }
            const { data } = supabase.storage.from('announcements').getPublicUrl(fileName);
            imageUrl = data.publicUrl;
        }
        
        const annToSave = { ...announcement, image_url: imageUrl };
        const { data, error } = await supabase.from('announcements').upsert(annToSave).select().single();
        if (error) showAlert(error.message, 'error');
        else if (data) {
            setAnnouncements(prev => announcement.id ? prev.map(a => a.id === data.id ? data : a) : [...prev, data]);
            showAlert('Anuncio guardado.', 'success');
        }
    }, []);

    const deleteAnnouncement = useCallback(async (id: string) => {
        if (!window.confirm('¿Seguro que quieres eliminar este anuncio?')) return;
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) showAlert(error.message, 'error');
        else {
            setAnnouncements(prev => prev.filter(a => a.id !== id));
            showAlert('Anuncio eliminado.', 'success');
        }
    }, []);

    const toggleAnnouncementActive = useCallback(async (announcement: Announcement) => {
        const { data, error } = await supabase.from('announcements').update({ is_active: !announcement.is_active }).eq('id', announcement.id).select().single();
        if (error) showAlert(error.message, 'error');
        else if(data) setAnnouncements(prev => prev.map(a => a.id === data.id ? data : a));
    }, []);
    
    const sendNotificationToAll = useCallback(async (message: string) => {
        const { data: usersToNotify, error } = await supabase.from('users').select('id').eq('role', 'user');
        if (error || !usersToNotify) { showAlert('Error al obtener usuarios.', 'error'); return; }
        const notificationsToInsert = usersToNotify.map(user => ({ user_id: user.id, message: message, type: 'announcement' }));
        const { error: insertError } = await supabase.from('notifications').insert(notificationsToInsert);
        if (insertError) showAlert(insertError.message, 'error');
        else showAlert(`Notificación enviada a ${usersToNotify.length} usuarios.`, 'success');
    }, []);

    const convertInquiryToBudget = useCallback(async (inquiry: Inquiry) => {
        let client = clients.find(c => c.email === inquiry.client_email || c.phone === inquiry.client_phone);

        if (!client) {
            const newClient = await saveClient({ id: '', user_id: currentUser!.id, name: inquiry.client_name, email: inquiry.client_email, phone: inquiry.client_phone });
            if(newClient) client = newClient;
        }

        if (client) {
            const newBudget: Budget = {
                id: '', user_id: currentUser!.id, client_id: client.id, title: `Presupuesto para ${inquiry.event_type || 'evento'}`,
                status: 'Borrador', items: [{ id: Math.random().toString(), description: '', quantity: 1, price: 0 }], discount: 0,
                notes: `Basado en la consulta recibida el ${new Date(inquiry.created_at).toLocaleDateString()}.\n\nMensaje original: ${inquiry.message}`,
                valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), created_at: new Date().toISOString(),
            };
            setSelectedBudget(newBudget);
            setCurrentPage('budgets');
            setIsBudgetModalOpen(true);
        } else {
            showAlert('No se pudo crear o encontrar un cliente para la consulta.', 'error');
        }
    }, [clients, currentUser, saveClient]);
    
    const handleGetInquirySuggestion = useCallback(async (inquiry: Inquiry) => {
        setAiSuggestionModal({ isOpen: true, title: "Sugerencia de Respuesta", suggestion: '', isLoading: true });
        const suggestion = await getInquiryReplySuggestion(inquiry.message || '');
        setAiSuggestionModal(prev => ({ ...prev, suggestion, isLoading: false }));
    }, []);

    const handleGetFollowUpSuggestion = useCallback(async (budget: Budget) => {
        const clientName = clients.find(c => c.id === budget.client_id)?.name || 'Cliente';
        setAiSuggestionModal({ isOpen: true, title: "Sugerencia de Seguimiento", suggestion: '', isLoading: true });
        const suggestion = await getFollowUpEmailSuggestion(clientName, budget.title);
        setAiSuggestionModal(prev => ({ ...prev, suggestion, isLoading: false }));
    }, [clients]);
    
    const markNotificationsAsRead = useCallback(async () => {
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser!.id).eq('is_read', false);
        if (!error) setNotifications(prev => prev.map(n => ({...n, is_read: true})));
    }, [currentUser]);

    const handleSelectChatUser = useCallback(async (user: User) => {
        setSelectedChatUser(user);
        const { data, error } = await supabase.from('chat_messages').select('*')
            .or(`(sender_id.eq.${currentUser!.id},recipient_id.eq.${user.id}),(sender_id.eq.${user.id},recipient_id.eq.${currentUser!.id})`)
            .order('created_at');
        if (error) showAlert('Error al cargar mensajes.', 'error');
        else {
            setChatMessages(data || []);
            const { error: updateError } = await supabase.from('chat_messages').update({ is_read: true }).eq('sender_id', user.id).eq('recipient_id', currentUser!.id);
            if (!updateError) fetchUnreadCounts();
        }
    }, [currentUser, fetchUnreadCounts]);

    const handleSendMessage = useCallback(async (content: string, recipientId?: string) => {
        setIsSendingMessage(true);
        let finalRecipientId: string | null = null;
        if (currentUser?.role === 'admin') finalRecipientId = selectedChatUser?.id || null;
        else finalRecipientId = recipientId || adminUserId;
        if (!finalRecipientId) {
            showAlert('No se pudo determinar el destinatario.', 'error'); setIsSendingMessage(false); return;
        }
        const newMessage: Omit<ChatMessage, 'id' | 'created_at'> = { sender_id: currentUser!.id, recipient_id: finalRecipientId, content: content, is_read: false };
        const { data, error } = await supabase.from('chat_messages').insert(newMessage).select().single();
        if (error) showAlert('Error al enviar mensaje.', 'error');
        else if(data && currentUser?.role !== 'admin') setChatMessages(prev => [...prev, data]);
        setIsSendingMessage(false);
    }, [currentUser, selectedChatUser, adminUserId]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setCurrentUser(null);
    };
    
    const daysUntilExpiry = useMemo(() => {
        if (!currentUser?.activeUntil) return null;
        const diffTime = new Date(currentUser.activeUntil).getTime() - new Date().getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }, [currentUser]);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">Cargando...</div>;

    if (!session || !currentUser) {
        return (
            <div className={theme}>
                <AuthScreen showAlert={showAlert} />
                <AlertModal alertState={alertState} onClose={() => setAlertState({ ...alertState, isOpen: false })} />
            </div>
        );
    }

    return (
        <div className={`flex min-h-screen ${theme}`}>
            <Sidebar 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage} 
                currentUser={currentUser} 
                handleLogout={handleLogout} 
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                unreadSupportCount={Array.from(unreadCounts.values()).reduce((a,b) => a+b, 0)}
            />
            <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'md:ml-0' : 'md:ml-64'}`}>
                <main className="flex-1 p-4 md:p-6 bg-gray-100 dark:bg-gray-900">
                    <Header 
                        currentUser={currentUser} 
                        toggleTheme={toggleTheme} 
                        theme={theme} 
                        onMenuClick={() => setIsSidebarOpen(true)}
                        notifications={notifications}
                        isNotificationsOpen={isNotificationsOpen}
                        setIsNotificationsOpen={setIsNotificationsOpen}
                        markNotificationsAsRead={markNotificationsAsRead}
                        daysUntilExpiry={daysUntilExpiry}
                    />
                    <PageContent
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        currentUser={currentUser}
                        events={events}
                        clients={clients}
                        budgets={budgets}
                        inquiries={inquiries}
                        saveEvent={saveEvent}
                        deleteEvent={deleteEvent}
                        saveClient={saveClient}
                        deleteClient={deleteClient}
                        saveBudget={saveBudget}
                        deleteBudget={deleteBudget}
                        users={users}
                        saveUser={saveUser}
                        uploadLogo={uploadLogo}
                        showAlert={showAlert}
                        announcements={announcements}
                        saveAnnouncement={saveAnnouncement}
                        deleteAnnouncement={deleteAnnouncement}
                        toggleAnnouncementActive={toggleAnnouncementActive}
                        sendNotificationToAll={sendNotificationToAll}
                        fetchInquiries={fetchInquiries}
                        convertInquiryToBudget={convertInquiryToBudget}
                        isModalOpen={isBudgetModalOpen}
                        setIsModalOpen={setIsBudgetModalOpen}
                        selectedBudget={selectedBudget}
                        setSelectedBudget={setSelectedBudget}
                        adminStats={adminStats}
                        activityLogs={activityLogs}
                        handleGetInquirySuggestion={handleGetInquirySuggestion}
                        handleGetFollowUpSuggestion={handleGetFollowUpSuggestion}
                        chatConversations={chatConversations}
                        selectedChatUser={selectedChatUser}
                        handleSelectChatUser={handleSelectChatUser}
                        chatMessages={chatMessages}
                        handleSendMessage={handleSendMessage}
                        isSendingMessage={isSendingMessage}
                        unreadCountsByConversation={unreadCounts}
                    />
                </main>
            </div>
            <AlertModal alertState={alertState} onClose={() => setAlertState({ ...alertState, isOpen: false })} />
            {aiSuggestionModal.isOpen && (
                <AiSuggestionModal
                    title={aiSuggestionModal.title}
                    suggestion={aiSuggestionModal.suggestion}
                    isLoading={aiSuggestionModal.isLoading}
                    onClose={() => setAiSuggestionModal({ isOpen: false, title: '', suggestion: '', isLoading: false })}
                />
            )}
            {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-20 md:hidden"></div>}
        </div>
    );
};

export default App;

