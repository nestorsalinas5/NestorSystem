
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Page, Event, Client, Expense, User, Notification, Announcement, Budget, BudgetItem, BudgetStatus, Inquiry, ActivityLog, AdminDashboardStats, ChatMessage } from './types';
import { getDashboardInsights, getInquiryReplySuggestion, getFollowUpEmailSuggestion, getBudgetItemsSuggestion } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
    DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, 
    LogoutIcon, UserManagementIcon, AgendaIcon, CloseIcon, TrashIcon, PlusIcon, MenuIcon, 
    SuccessIcon, ErrorIcon, BellIcon, WarningIcon, AnnouncementIcon, SendIcon, BudgetIcon, 
    PdfIcon, EditIcon, EmailIcon, InquiryIcon, ActivityLogIcon, SparklesIcon, LogoIconOnly, 
    MessageSquareIcon, BrainCircuitIcon
} from './components/Icons.tsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, AuthSession } from '@supabase/supabase-js';
import { GoogleGenAI, Chat } from "@google/genai";

// --- SUPABASE CLIENT ---
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be provided in environment variables.");
}
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// --- GEMINI AI CLIENT ---
const ai = process.env.API_KEY ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null;


// --- TYPES ---
type AlertState = {
    isOpen: boolean;
    message: string;
    type: 'success' | 'error';
}

type ChatUser = {
    user_id: string;
    company_name: string;
    email: string;
    last_message_at: string;
    unread_count: number;
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
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                <div className="flex justify-center mb-4">
                    {alertState.type === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                </div>
                <p className="text-lg mb-6 text-gray-700 dark:text-gray-300">{alertState.message}</p>
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
}> = ({ currentPage, setCurrentPage, currentUser, handleLogout, isOpen, setIsOpen }) => {
    const navItems = useMemo(() => {
        let items: { page: Page; label: string; icon: React.ReactNode }[] = [
            { page: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
        ];
        if (currentUser.role === 'admin') {
            items.push(
                { page: 'userManagement', label: 'Usuarios', icon: <UserManagementIcon /> },
                { page: 'announcements', label: 'Anuncios', icon: <AnnouncementIcon /> },
                { page: 'sendNotification', label: 'Enviar Notificación', icon: <SendIcon /> },
                { page: 'supportChat', label: 'Mensajes de Soporte', icon: <MessageSquareIcon /> },
                { page: 'activityLog', label: 'Registro de Actividad', icon: <ActivityLogIcon /> }
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
                { page: 'supportChat', label: 'Soporte', icon: <MessageSquareIcon /> }
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
    isBudgetModalOpen: boolean;
    setIsBudgetModalOpen: (isOpen: boolean) => void;
    selectedBudget: Budget | null;
    setSelectedBudget: (budget: Budget | null) => void;
    adminStats: AdminDashboardStats | null;
    activityLogs: ActivityLog[];
    fetchAdminData: () => Promise<void>;
    handleGetInquirySuggestion: (inquiry: Inquiry) => void;
    handleGetFollowUpSuggestion: (budget: Budget) => void;
    chatUsers: ChatUser[];
    chatMessages: ChatMessage[];
    fetchChatUsers: () => Promise<void>;
    chatError: string | null;
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
                        isModalOpen={props.isBudgetModalOpen}
                        setIsModalOpen={props.setIsBudgetModalOpen}
                        selectedBudget={props.selectedBudget}
                        setSelectedBudget={props.setSelectedBudget}
                        onGetSuggestion={props.handleGetFollowUpSuggestion}
                    />;
        case 'events':
            return <EventsPage events={props.events} clients={props.clients} saveEvent={props.saveEvent} deleteEvent={props.deleteEvent} />;
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
            return <CoachPage />;
        case 'supportChat':
            return <SupportChatPage 
                        currentUser={props.currentUser} 
                        allMessages={props.chatMessages}
                        chatUsers={props.chatUsers}
                        fetchChatUsers={props.fetchChatUsers}
                        chatError={props.chatError}
                        setCurrentPage={props.setCurrentPage}
                    />;
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

const EventsPage: React.FC<{events: Event[], clients: Client[], saveEvent: (event: Event) => Promise<void>, deleteEvent: (id: string) => Promise<void>}> = ({ events, clients, saveEvent, deleteEvent }) => {
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
            {isModalOpen && <EventFormModal event={selectedEvent} clients={clients} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const EventFormModal: React.FC<{event: Event | null, clients: Client[], onSave: (event: Event) => void, onClose: () => void}> = ({ event, clients, onSave, onClose }) => {
    const isNew = !event?.id;
    const initialEventState = useMemo(() => {
        return event 
            ? {...event, date: event.date.split('T')[0], expenses: event.expenses.map(e => ({...e, id: Math.random().toString()}))} 
            : { id: '', user_id: '', client_id: clients[0]?.id || null, client: null, name: '', location: '', date: new Date().toISOString().split('T')[0], amount_charged: 0, expenses: [], observations: '' };
    }, [event, clients]);

    const [formData, setFormData] = useState<Event>(initialEventState);

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
    
    const totalExpenses = formData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netProfit = formData.amount_charged - totalExpenses;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.client_id) {
            alert("Por favor, selecciona un cliente. Si no hay clientes, crea uno primero en la sección de Clientes.");
            return;
        }
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6">{isNew ? 'Añadir' : 'Editar'} Evento</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Nombre del Evento" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="Lugar" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="number" name="amount_charged" value={formData.amount_charged} onChange={handleChange} placeholder="Monto Cobrado" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Cliente</label>
                        <select name="client_id" value={formData.client_id || ''} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="border-t pt-4">
                        <h3 className="font-semibold mb-2">Gastos</h3>
                        {formData.expenses.map((exp, i) => (
                            <div key={exp.id} className="flex items-center space-x-2 mb-2">
                                <input type="text" value={exp.type} onChange={e => handleExpenseChange(i, 'type', e.target.value)} placeholder="Tipo de Gasto" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <input type="number" value={exp.amount} onChange={e => handleExpenseChange(i, 'amount', e.target.value)} placeholder="Monto" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                <button type="button" onClick={() => removeExpense(i)} className="p-2 text-red-500"><TrashIcon /></button>
                            </div>
                        ))}
                        <button type="button" onClick={addExpense} className="flex items-center text-primary-600"><PlusIcon /> <span className="ml-1">Añadir Gasto</span></button>
                        <p className="text-right font-semibold">Total Gastos: {formatGuarani(totalExpenses)}</p>
                    </div>
                     <textarea name="observations" value={formData.observations} onChange={handleChange} placeholder="Observaciones..." rows={3} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <div className="text-right font-bold text-lg">Ganancia Neta del Evento: {formatGuarani(netProfit)}</div>
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar Evento</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ClientsPage: React.FC<{ clients: Client[], saveClient: (client: Client) => Promise<Client | null>, deleteClient: (id: string) => Promise<void>}> = ({ clients, saveClient, deleteClient }) => {
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
                                <td className="p-2">{client.email || 'N/A'}</td>
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
    );
};

const ClientFormModal: React.FC<{client: Client | null, onSave: (client: Client) => void, onClose: () => void,}> = ({ client, onSave, onClose }) => {
    const isNew = !client?.id;
    const [formData, setFormData] = useState<Client>(client || { id: '', user_id: '', name: '', phone: '', email: '' });
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">{isNew ? 'Añadir' : 'Editar'} Cliente</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Nombre Completo" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                     <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="Teléfono" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                     <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email (Opcional)" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ReportsPage: React.FC<{ events: Event[], currentUser: User }> = ({ events, currentUser }) => {
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    const filteredEvents = useMemo(() => {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        return events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= start && eventDate <= end;
        });
    }, [events, startDate, endDate]);

    const totals = useMemo(() => {
        const income = filteredEvents.reduce((sum, e) => sum + e.amount_charged, 0);
        const expenses = filteredEvents.reduce((sum, e) => sum + e.expenses.reduce((expSum, exp) => expSum + exp.amount, 0), 0);
        return { income, expenses, net: income - expenses };
    }, [filteredEvents]);

    const exportToPDF = async () => {
        const doc = new jsPDF();
        const headStyles = { fillColor: '#2563eb', textColor: '#ffffff', fontStyle: 'bold' as 'bold' };
        
        const logoDataUrl = currentUser.companyLogoUrl ? await getBase64ImageFromUrl(currentUser.companyLogoUrl) : null;
        
        const pageMargin = 15;

        // --- PDF Header ---
        if (logoDataUrl) {
            doc.addImage(logoDataUrl, 'PNG', pageMargin, 15, 20, 20);
        }
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#1d4ed8'); // primary-700
        doc.text(currentUser.company_name, logoDataUrl ? pageMargin + 25 : pageMargin, 22);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Reporte de Eventos`, logoDataUrl ? pageMargin + 25 : pageMargin, 29);
        doc.text(`Período: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, logoDataUrl ? pageMargin + 25 : pageMargin, 34);

        // --- PDF Table ---
        const tableBody: any[] = [];
        filteredEvents.forEach(event => {
            const totalEventExpenses = event.expenses.reduce((sum, exp) => sum + exp.amount, 0);
            const netProfit = event.amount_charged - totalEventExpenses;

            tableBody.push([
                event.name,
                event.client?.name || 'N/A',
                new Date(event.date).toLocaleDateString(),
                formatGuarani(event.amount_charged),
                formatGuarani(totalEventExpenses),
                formatGuarani(netProfit)
            ]);
        });

        autoTable(doc, {
            head: [["Evento", "Cliente", "Fecha", "Ingreso", "Gastos", "Ganancia"]],
            body: tableBody,
            startY: 50,
            headStyles: headStyles,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: {
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right' }
            },
            didDrawPage: (data) => {
                // --- PDF Footer ---
                const pageCount = (doc as any).internal.getNumberOfPages ? (doc as any).internal.getNumberOfPages() : 0;
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Generado por GestionSystem`, data.settings.margin.left, doc.internal.pageSize.height - 10);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - data.settings.margin.right, doc.internal.pageSize.height - 10, { align: 'right' });
            },
            margin: { left: pageMargin, right: pageMargin }
        });

        // --- PDF Summary ---
        const finalY = (doc as any).lastAutoTable.finalY || 50;
        
        autoTable(doc, {
            startY: finalY + 10,
            theme: 'plain',
            tableWidth: 'wrap',
            margin: { left: doc.internal.pageSize.width - 70 - pageMargin }, // Align to the right
            body: [
                ['Total Ingresos:', { content: formatGuarani(totals.income), styles: { halign: 'right' } }],
                ['Total Gastos:', { content: formatGuarani(totals.expenses), styles: { halign: 'right' } }],
                [{
                    content: 'Ganancia Neta Total:',
                    styles: { fontStyle: 'bold' as 'bold' }
                }, {
                    content: formatGuarani(totals.net),
                    styles: { fontStyle: 'bold' as 'bold', halign: 'right' }
                }],
            ],
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 40 } },
        });

        doc.save(`Reporte_GestionSystem_${startDate}_${endDate}.pdf`);
    };
    
    const exportToCSV = () => {
         let csvContent = "data:text/csv;charset=utf-8,";
         csvContent += "Evento,Cliente,Fecha,Ingreso,Gastos,Ganancia\r\n";
         filteredEvents.forEach(event => {
             const eventExpenses = event.expenses.reduce((sum, exp) => sum + exp.amount, 0);
             const net = event.amount_charged - eventExpenses;
             const row = [event.name, event.client?.name || 'N/A', event.date, event.amount_charged, eventExpenses, net].join(',');
             csvContent += row + "\r\n";
         });
         const encodedUri = encodeURI(csvContent);
         const link = document.createElement("a");
         link.setAttribute("href", encodedUri);
         link.setAttribute("download", `Reporte_GestionSystem_${startDate}_${endDate}.csv`);
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
    };

    return (
         <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow space-y-6">
            <h3 className="text-xl font-semibold">Generar Reportes</h3>
            <div className="flex flex-wrap items-center gap-4">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                <span>hasta</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                 <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded"><h4>Ingresos: {formatGuarani(totals.income)}</h4></div>
                 <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded"><h4>Gastos: {formatGuarani(totals.expenses)}</h4></div>
                 <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded"><h4>Ganancia: {formatGuarani(totals.net)}</h4></div>
            </div>
            <div className="flex space-x-4">
                <button onClick={exportToPDF} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Exportar PDF</button>
                <button onClick={exportToCSV} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Exportar CSV</button>
            </div>
        </div>
    );
};

const AnnouncementsPage: React.FC<{
    announcements: Announcement[],
    saveAnnouncement: (announcement: Announcement, imageFile?: File | null) => Promise<void>,
    deleteAnnouncement: (id: string) => Promise<void>,
    toggleAnnouncementActive: (announcement: Announcement) => Promise<void>
}> = ({ announcements, saveAnnouncement, deleteAnnouncement, toggleAnnouncementActive }) => {
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
                <h3 className="text-xl font-semibold">Gestionar Anuncios</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Anuncio</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2">Título</th><th className="p-2">Activo</th><th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {announcements.map(ann => (
                            <tr key={ann.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{ann.title}</td>
                                <td className="p-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={ann.is_active} onChange={() => toggleAnnouncementActive(ann)} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                                    </label>
                                </td>
                                <td className="p-2 flex space-x-2">
                                    <button onClick={() => handleOpenModal(ann)} className="text-primary-600 hover:underline">Editar</button>
                                    <button onClick={() => deleteAnnouncement(ann.id)} className="text-red-500 hover:underline">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <AnnouncementFormModal announcement={selectedAnnouncement} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const AnnouncementFormModal: React.FC<{
    announcement: Announcement | null,
    onSave: (announcement: Announcement, imageFile?: File | null) => void,
    onClose: () => void
}> = ({ announcement, onSave, onClose }) => {
    const isNew = !announcement;
    const [formData, setFormData] = useState<Announcement>(announcement || { id: '', title: '', content: '', is_active: false, created_at: '' });
    const [imageFile, setImageFile] = useState<File | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) setImageFile(e.target.files[0]); };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData, imageFile); };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear' : 'Editar'} Anuncio</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Título" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <textarea name="content" value={formData.content} onChange={handleChange} placeholder="Contenido del anuncio..." rows={4} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <div>
                        <label className="block text-sm font-medium mb-1">Imagen (Opcional)</label>
                        <input type="file" onChange={handleFileChange} accept="image/*" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                    </div>
                    <div className="flex justify-end space-x-4 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SendNotificationPage: React.FC<{ sendNotificationToAll: (message: string) => Promise<void> }> = ({ sendNotificationToAll }) => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        await sendNotificationToAll(message);
        setIsSending(false);
        setMessage('');
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-4">Enviar Notificación a Usuarios</h3>
            <p className="text-sm text-gray-500 mb-6">El mensaje se enviará a la campana de notificaciones y al correo electrónico de todos los usuarios activos.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Escribe tu mensaje aquí..." rows={5} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                <button type="submit" disabled={isSending} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                    {isSending ? 'Enviando...' : 'Enviar Notificación'}
                </button>
            </form>
        </div>
    );
};

const AnnouncementModal: React.FC<{
    announcement: Announcement,
    onClose: () => void
}> = ({ announcement, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-11/12 md:w-3/4 lg:w-2/3 max-w-5xl relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 z-10">
                    <CloseIcon />
                </button>
                <h2 className="text-2xl font-bold mb-4 pr-8">{announcement.title}</h2>
                {announcement.image_url && (
                    <div className="mb-4">
                        <img 
                            src={announcement.image_url} 
                            alt={announcement.title} 
                            className="w-full rounded-md max-h-[70vh] object-contain" 
                        />
                    </div>
                )}
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{announcement.content}</p>
            </div>
        </div>
    )
}

const BudgetsPage: React.FC<{
    budgets: Budget[];
    clients: Client[];
    currentUser: User;
    saveBudget: (budget: Budget) => Promise<void>;
    deleteBudget: (id: string) => Promise<void>;
    showAlert: (message: string, type: 'success' | 'error') => void;
    isModalOpen: boolean;
    setIsModalOpen: (isOpen: boolean) => void;
    selectedBudget: Budget | null;
    setSelectedBudget: (budget: Budget | null) => void;
    onGetSuggestion: (budget: Budget) => void;
}> = ({ budgets, clients, currentUser, saveBudget, deleteBudget, showAlert, isModalOpen, setIsModalOpen, selectedBudget, setSelectedBudget, onGetSuggestion }) => {

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [budgetToSend, setBudgetToSend] = useState<Budget | null>(null);

    const handleOpenModal = (budget: Budget | null) => {
        setSelectedBudget(budget);
        setIsModalOpen(true);
    };

    const handleSave = async (budget: Budget) => {
        await saveBudget(budget);
        setIsModalOpen(false);
    };

    const handleOpenEmailModal = (budget: Budget) => {
        setBudgetToSend(budget);
        setIsEmailModalOpen(true);
    };
    
    const handleViewPdf = async (budget: Budget) => {
        const newTab = window.open('', '_blank');
        if (!newTab) {
            showAlert("Por favor, permite las ventanas emergentes para ver el PDF.", "error");
            return;
        }
        newTab.document.write('Generando PDF, por favor espera...');
        try {
            const client = clients.find(c => c.id === budget.client_id);
            const doc = await generateBudgetPDF(budget, currentUser, client);
            newTab.location.href = doc.output('bloburl').toString();
        } catch (e) {
            console.error("PDF generation failed:", e);
            newTab.document.write('Ocurrió un error al generar el PDF.');
            showAlert("Ocurrió un error al generar el PDF.", "error");
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Mis Presupuestos</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Presupuesto</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2">Título</th><th className="p-2">Cliente</th><th className="p-2">Fecha</th><th className="p-2">Estado</th><th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {budgets.map(budget => (
                            <tr key={budget.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{budget.title}</td>
                                <td className="p-2">{budget.client?.name || 'N/A'}</td>
                                <td className="p-2">{new Date(budget.created_at).toLocaleDateString()}</td>
                                <td className="p-2">{budget.status}</td>
                                <td className="p-2">
                                    <div className="flex items-center space-x-2">
                                        <button title="Ver PDF" onClick={() => handleViewPdf(budget)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                                            <PdfIcon />
                                        </button>
                                        <button title="Enviar por Correo" onClick={() => handleOpenEmailModal(budget)} className="p-1.5 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/50">
                                            <EmailIcon />
                                        </button>
                                        <button title="Editar" onClick={() => handleOpenModal(budget)} className="p-1.5 rounded text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50">
                                            <EditIcon />
                                        </button>
                                        <button title="Eliminar" onClick={() => deleteBudget(budget.id)} className="p-1.5 rounded text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50">
                                            <TrashIcon />
                                        </button>
                                        {budget.status === 'Enviado' && (
                                            <button title="Sugerencia de Seguimiento IA" onClick={() => onGetSuggestion(budget)} className="p-1.5 rounded text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/50">
                                                <SparklesIcon />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <BudgetFormModal budget={selectedBudget} clients={clients} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
            {isEmailModalOpen && budgetToSend && <EmailBudgetModal budget={budgetToSend} currentUser={currentUser} clients={clients} onClose={() => setIsEmailModalOpen(false)} showAlert={showAlert} />}
        </div>
    );
};

const BudgetFormModal: React.FC<{
    budget: Budget | null;
    clients: Client[];
    onSave: (budget: Budget) => void;
    onClose: () => void;
}> = ({ budget, clients, onSave, onClose }) => {
    const isNew = !budget?.id;
    const initialBudget: Budget = useMemo(() => {
        return budget || {
            id: '', user_id: '', client_id: clients[0]?.id || '', title: '', status: 'Borrador',
            items: [{ id: Math.random().toString(), description: '', quantity: 1, price: 0 }],
            discount: 0, notes: '', created_at: new Date().toISOString()
        }
    }, [budget, clients]);

    const [formData, setFormData] = useState<Budget>(initialBudget);
    const [aiDescription, setAiDescription] = useState('');
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [isAiLoading, setIsAiLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: (name === 'discount') ? parseFloat(value) || 0 : value }));
    };
    
    const handleItemChange = (index: number, field: keyof BudgetItem, value: string) => {
        const newItems = [...formData.items];
        const item = newItems[index];
        if (field === 'quantity' || field === 'price') {
            item[field] = parseFloat(value) || 0;
        } else if (field === 'description') {
            item[field] = value;
        }
        setFormData(prev => ({...prev, items: newItems}));
    };

    const addItem = (description?: string) => {
        setFormData(prev => ({...prev, items: [...prev.items, { id: Math.random().toString(), description: description || '', quantity: 1, price: 0 }]}));
    };
    
    const removeItem = (index: number) => {
        setFormData(prev => ({...prev, items: formData.items.filter((_, i) => i !== index)}));
    };

    const { subtotal, total } = useMemo(() => {
        const sub = formData.items.reduce((acc, item) => acc + (item.quantity * item.price), 0);
        const tot = sub - formData.discount;
        return { subtotal: sub, total: tot };
    }, [formData.items, formData.discount]);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_id) {
            alert("Por favor, selecciona un cliente.");
            return;
        }
        onSave(formData);
    };

    const handleGetItemSuggestions = async () => {
        if (!aiDescription) return;
        setIsAiLoading(true);
        const suggestionsString = await getBudgetItemsSuggestion(aiDescription);
        setAiSuggestions(suggestionsString.split(',').map(s => s.trim()));
        setIsAiLoading(false);
    };

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                 <h2 className="text-2xl font-bold mb-6">{isNew ? 'Crear' : 'Editar'} Presupuesto</h2>
                 <form onSubmit={handleSubmit} className="space-y-4">
                     {/* Form fields */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Título del Presupuesto" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                         <select name="client_id" value={formData.client_id} onChange={handleChange} required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                             <option value="">-- Seleccionar Cliente --</option>
                             {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                         <input type="date" name="valid_until" value={formData.valid_until?.split('T')[0] || ''} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                         <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                             <option>Borrador</option><option>Enviado</option><option>Aceptado</option><option>Rechazado</option>
                         </select>
                     </div>
                     
                     {/* AI Assistant for Items */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <label className="font-semibold flex items-center"><SparklesIcon /> <span className="ml-2">Asistente de Items con IA</span></label>
                        <textarea
                            value={aiDescription}
                            onChange={(e) => setAiDescription(e.target.value)}
                            placeholder="Describe el evento (ej: Boda para 150 personas en una quinta al aire libre)"
                            className="w-full p-2 mt-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            rows={2}
                        />
                        <button type="button" onClick={handleGetItemSuggestions} disabled={isAiLoading || !ai} className="mt-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:bg-blue-300">
                            {isAiLoading ? 'Pensando...' : 'Sugerir Items'}
                        </button>
                        {!ai && <p className="text-xs text-yellow-600 mt-2">La IA no está disponible. Configure la API Key.</p>}
                        {aiSuggestions.length > 0 && (
                            <div className="mt-3">
                                <p className="text-sm font-medium">Sugerencias:</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {aiSuggestions.map((s, i) => (
                                        <button key={i} type="button" onClick={() => addItem(s)} className="text-sm bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded-full hover:bg-blue-200">
                                            + {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                     {/* Items table */}
                     <div className="border-y dark:border-gray-700 py-4">
                        <h3 className="font-semibold mb-2">Items del Presupuesto</h3>
                        {formData.items.map((item, index) => (
                             <div key={item.id} className="grid grid-cols-12 gap-2 mb-2">
                                 <input type="text" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} placeholder="Descripción" className="col-span-6 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                                 <input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} placeholder="Cant." className="col-span-2 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                                 <input type="number" value={item.price} onChange={(e) => handleItemChange(index, 'price', e.target.value)} placeholder="Precio" className="col-span-3 p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                                 <button type="button" onClick={() => removeItem(index)} className="col-span-1 p-2 text-red-500"><TrashIcon /></button>
                             </div>
                        ))}
                         <button type="button" onClick={() => addItem()} className="flex items-center text-primary-600 mt-2"><PlusIcon /> <span className="ml-1">Añadir Item</span></button>
                     </div>
                     
                     {/* Summary */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <textarea name="notes" value={formData.notes || ''} onChange={handleChange} placeholder="Notas adicionales..." rows={4} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"/>
                        <div className="space-y-2 text-right">
                             <p>Subtotal: {formatGuarani(subtotal)}</p>
                             <div className="flex items-center justify-end">
                                <label>Descuento:</label>
                                <input type="number" name="discount" value={formData.discount} onChange={handleChange} className="w-24 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 ml-2 text-right"/>
                             </div>
                             <p className="font-bold text-xl">Total: {formatGuarani(total)}</p>
                        </div>
                     </div>
                     
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white">Guardar Presupuesto</button>
                    </div>
                 </form>
            </div>
        </div>
    )
};

const EmailBudgetModal: React.FC<{
    budget: Budget;
    currentUser: User;
    clients: Client[];
    onClose: () => void;
    showAlert: (message: string, type: 'success' | 'error') => void;
}> = ({ budget, currentUser, clients, onClose, showAlert }) => {
    const [recipientEmail, setRecipientEmail] = useState(budget.client?.email || '');
    const [isSending, setIsSending] = useState(false);

    const handleSend = async () => {
        if (!recipientEmail) {
            showAlert("Por favor, introduce un email.", "error");
            return;
        }
        setIsSending(true);
        const client = clients.find(c => c.id === budget.client_id);
        const doc = await generateBudgetPDF(budget, currentUser, client);
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        const { error } = await supabase.functions.invoke('send-budget-email', {
            body: {
                recipientEmail,
                clientName: client?.name,
                companyName: currentUser.company_name,
                pdfBase64,
                budgetTitle: budget.title,
            }
        });

        if (error) {
            showAlert("Error al enviar el correo: " + error.message, 'error');
        } else {
            showAlert("Presupuesto enviado exitosamente.", 'success');
             await logActivity('budget_sent', { title: budget.title, clientName: client?.name });
            onClose();
        }
        setIsSending(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
                 <h2 className="text-2xl font-bold mb-4">Enviar Presupuesto</h2>
                 <p className="mb-6">Se enviará el PDF del presupuesto a la siguiente dirección de correo:</p>
                 <input 
                    type="email" 
                    value={recipientEmail} 
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="Email del Cliente"
                    className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 mb-6"
                    required
                 />
                 <div className="flex justify-end space-x-4">
                    <button type="button" onClick={onClose} disabled={isSending} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600">Cancelar</button>
                    <button onClick={handleSend} disabled={isSending} className="px-4 py-2 rounded bg-primary-600 text-white disabled:bg-primary-300">
                        {isSending ? 'Enviando...' : 'Confirmar y Enviar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const InquiriesPage: React.FC<{
    inquiries: Inquiry[];
    fetchInquiries: () => Promise<void>;
    convertInquiryToBudget: (inquiry: Inquiry) => Promise<void>;
    currentUser: User;
    onGetSuggestion: (inquiry: Inquiry) => void;
}> = ({ inquiries, fetchInquiries, convertInquiryToBudget, currentUser, onGetSuggestion }) => {
    
    const publicLink = `${window.location.origin}${window.location.pathname}#/inquiry/${currentUser.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicLink)}`;

    const updateInquiryStatus = async (inquiryId: string, status: Inquiry['status']) => {
        const { error } = await supabase.from('inquiries').update({ status }).eq('id', inquiryId);
        if (error) {
            alert("Error al actualizar estado: " + error.message);
        } else {
            await logActivity('inquiry_status_updated', { inquiryId, newStatus: status });
            await fetchInquiries();
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Tu Formulario de Consultas</h3>
                <p className="mb-4 text-gray-600 dark:text-gray-300">Comparte este link o código QR con tus clientes potenciales para que puedan solicitar tus servicios fácilmente.</p>
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Link Público</label>
                        <input type="text" readOnly value={publicLink} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <img src={qrCodeUrl} alt="QR Code" className="rounded-lg" />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Consultas Recibidas</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b dark:border-gray-700">
                                <th className="p-2">Cliente</th>
                                <th className="p-2">Email</th>
                                <th className="p-2">Teléfono</th>
                                <th className="p-2">Fecha Evento</th>
                                <th className="p-2">Estado</th>
                                <th className="p-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inquiries.map(inquiry => (
                                <tr key={inquiry.id} className="border-b dark:border-gray-700">
                                    <td className="p-2">{inquiry.client_name}</td>
                                    <td className="p-2">{inquiry.client_email || 'N/A'}</td>
                                    <td className="p-2">{inquiry.client_phone || 'N/A'}</td>
                                    <td className="p-2">{inquiry.event_date ? new Date(inquiry.event_date).toLocaleDateString() : 'N/A'}</td>
                                    <td className="p-2">
                                        <select value={inquiry.status} onChange={(e) => updateInquiryStatus(inquiry.id, e.target.value as Inquiry['status'])} className="p-1 border rounded dark:bg-gray-700 dark:border-gray-600">
                                            <option>Nueva</option>
                                            <option>Contactado</option>
                                            <option>Presupuesto Enviado</option>
                                        </select>
                                    </td>
                                    <td className="p-2 flex items-center space-x-2">
                                        <button 
                                            onClick={() => convertInquiryToBudget(inquiry)} 
                                            className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 text-sm font-semibold"
                                        >
                                            Convertir a Presupuesto
                                        </button>
                                        <button title="Sugerencia de Respuesta IA" onClick={() => onGetSuggestion(inquiry)} className="p-1.5 rounded text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/50" disabled={!ai}>
                                            <SparklesIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const PublicInquiryPage: React.FC<{ userId: string }> = ({ userId }) => {
    const [djProfile, setDjProfile] = useState<{ company_name: string, companyLogoUrl?: string } | null>(null);
    const [formData, setFormData] = useState({ clientName: '', clientEmail: '', clientPhone: '', eventType: '', eventDate: '', message: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const fetchDjProfile = async () => {
            const { data, error } = await supabase.from('profiles').select('company_name, company_logo_url').eq('id', userId).single();
            if (error || !data) {
                setError("No se pudo encontrar el perfil del proveedor.");
            } else {
                setDjProfile({
                    company_name: data.company_name,
                    companyLogoUrl: data.company_logo_url
                });
            }
            setLoading(false);
        };
        fetchDjProfile();
    }, [userId]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.functions.invoke('submit-inquiry', {
            body: { userId, ...formData }
        });
        if (error) {
            setError("Hubo un error al enviar tu consulta. Por favor, intenta de nuevo.");
        } else {
            setSuccess(true);
        }
        setLoading(false);
    };

    if (loading && !djProfile) return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
    if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-center p-4">
                 <div className="p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-lg">
                    <SuccessIcon />
                    <h1 className="text-2xl font-bold my-4">¡Consulta Enviada!</h1>
                    <p>Gracias por tu interés. {djProfile?.company_name} se pondrá en contacto contigo a la brevedad.</p>
                 </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
            <div className="p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-lg">
                <div className="text-center mb-6">
                    {djProfile?.companyLogoUrl && <img src={djProfile.companyLogoUrl} alt="Logo" className="w-20 h-20 rounded-full mx-auto mb-4 object-cover" />}
                    <h1 className="text-2xl font-bold">Contacta a {djProfile?.company_name}</h1>
                    <p className="text-gray-500">Completa el formulario para solicitar un presupuesto.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="clientName" placeholder="Tu Nombre Completo" onChange={handleChange} required className="w-full p-2 border rounded" />
                    <input type="email" name="clientEmail" placeholder="Tu Email" onChange={handleChange} required className="w-full p-2 border rounded" />
                    <input type="tel" name="clientPhone" placeholder="Tu Teléfono" onChange={handleChange} className="w-full p-2 border rounded" />
                    <input type="text" name="eventType" placeholder="Tipo de Evento (Ej: Boda, Cumpleaños)" onChange={handleChange} className="w-full p-2 border rounded" />
                    <div>
                        <label className="text-sm text-gray-500">Fecha del Evento (Opcional)</label>
                        <input type="date" name="eventDate" onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                    <textarea name="message" placeholder="Cuéntanos más sobre tu evento..." rows={4} onChange={handleChange} className="w-full p-2 border rounded" />
                    <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-300">
                        {loading ? 'Enviando...' : 'Enviar Consulta'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const CoachPage: React.FC = () => {
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
    const [currentInput, setCurrentInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatSession = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ai) return;
        chatSession.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: "Eres 'Coach IA', un experto en negocios y marketing especializado en la industria de eventos, DJs y entretenimiento. Tu objetivo es proporcionar consejos prácticos, estratégicos y accionables a los usuarios para que mejoren sus negocios. Responde de forma clara, concisa y motivadora. Puedes analizar ideas de negocio, sugerir estrategias de precios, dar consejos para captar clientes, y evaluar el impacto potencial de decisiones financieras. Evita dar consejos financieros garantizados y en su lugar, enfócate en los pros y contras y en las estrategias a considerar.",
            },
        });
        setMessages([{ role: 'model', text: "¡Hola! Soy tu Coach de IA. ¿En qué puedo ayudarte hoy para impulsar tu negocio de eventos?" }]);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentInput.trim() || isLoading || !chatSession.current) return;

        const userMessage = { role: 'user' as const, text: currentInput };
        setMessages(prev => [...prev, userMessage, { role: 'model' as const, text: '' }]);
        setCurrentInput('');
        setIsLoading(true);

        try {
            const stream = await chatSession.current.sendMessageStream({ message: currentInput });
            let streamedText = "";
            for await (const chunk of stream) {
                streamedText += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], text: streamedText };
                    return newMessages;
                });
            }
        } catch (error) {
            console.error("Error communicating with AI:", error);
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = { role: 'model', text: "Lo siento, tuve un problema al procesar tu solicitud." };
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!ai) {
        return (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow text-center border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-300">Función de IA No Disponible</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    La funcionalidad del Coach IA no está disponible. Para activarla, el administrador del sistema debe configurar la variable de entorno `API_KEY` de Google Gemini.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-10rem)] bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                        <div className={`max-w-prose p-3 rounded-lg ${msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                           <p className="whitespace-pre-wrap">{msg.text || (isLoading && index === messages.length -1 ? '...' : '')}</p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t dark:border-gray-700 flex items-center">
                <input
                    type="text"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Pregúntale algo a tu coach..."
                    className="flex-1 p-2 border rounded-l-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isLoading}
                    aria-label="Escribe tu mensaje al coach de IA"
                />
                <button type="submit" disabled={isLoading || !currentInput.trim()} className="px-4 py-2 bg-primary-600 text-white rounded-r-lg disabled:bg-primary-400">
                    <SendIcon />
                </button>
            </form>
        </div>
    );
};

const SupportChatPage: React.FC<{
    currentUser: User;
    allMessages: ChatMessage[];
    chatUsers: ChatUser[];
    fetchChatUsers: () => void;
    chatError: string | null;
    setCurrentPage: (page: Page) => void;
}> = ({ currentUser, allMessages, chatUsers, fetchChatUsers, chatError, setCurrentPage }) => {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    const markMessagesAsRead = useCallback(async (userId: string) => {
        if (currentUser.role === 'admin') {
            const { error } = await supabase.from('chat_messages').update({ is_read_by_admin: true }).eq('user_id', userId).eq('is_read_by_admin', false);
            if (error) console.error("Failed to mark messages as read for admin", error);
            else fetchChatUsers(); // Refresh unread counts
        } else {
             const { error } = await supabase.from('chat_messages').update({ is_read_by_user: true }).eq('user_id', currentUser.id).eq('is_read_by_user', false);
             if (error) console.error("Failed to mark messages as read for user", error);
        }
    }, [currentUser.id, currentUser.role, fetchChatUsers]);

    useEffect(() => {
        if (currentUser.role === 'admin' && selectedUserId) {
            markMessagesAsRead(selectedUserId);
        } else if (currentUser.role === 'user') {
            // Mark messages as read whenever the chat is open for the user
            markMessagesAsRead(currentUser.id);
        }
    }, [selectedUserId, allMessages.length, currentUser.id, currentUser.role, markMessagesAsRead]);

    const handleSelectUser = (userId: string) => {
        setSelectedUserId(userId);
    };

    if (chatError && currentUser.role === 'admin') {
        return (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow text-center border-l-4 border-red-500">
                <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">Error de Configuración del Chat</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    {chatError}
                </p>
            </div>
        );
    }
    
    if (chatError && currentUser.role === 'user') {
         return (
             <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow text-center border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-300">Chat No Disponible</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    La función de chat de soporte no está disponible en este momento. Por favor, contacta al administrador.
                </p>
            </div>
        )
    }

    if (currentUser.role === 'admin') {
        return (
            <div className="flex h-[calc(100vh-10rem)] bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="w-1/3 border-r dark:border-gray-700 flex flex-col">
                    <h3 className="p-4 font-semibold border-b dark:border-gray-700">Conversaciones</h3>
                    <ul className="flex-1 overflow-y-auto">
                        {chatUsers
                          .sort((a,b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
                          .map(user => (
                            <li key={user.user_id} onClick={() => handleSelectUser(user.user_id)}
                                className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedUserId === user.user_id ? 'bg-primary-50 dark:bg-primary-900/50' : ''}`}>
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold">{user.company_name}</span>
                                    {user.unread_count > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">{user.unread_count}</span>}
                                </div>
                                <p className="text-sm text-gray-500 truncate">{user.email}</p>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="w-2/3 flex flex-col">
                    {selectedUserId ? (
                        <ChatWindow 
                            currentUser={currentUser}
                            messages={allMessages.filter(m => m.user_id === selectedUserId)}
                            recipientId={selectedUserId}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>Selecciona una conversación para empezar.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // User View
    return <ChatWindow currentUser={currentUser} messages={allMessages} recipientId={currentUser.id} />;
};

const ChatWindow: React.FC<{
    currentUser: User,
    messages: ChatMessage[],
    recipientId: string // For admin, this is the user_id. For user, it's their own id.
}> = ({ currentUser, messages, recipientId }) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const payload = {
            user_id: currentUser.role === 'admin' ? recipientId : currentUser.id,
            sender_is_admin: currentUser.role === 'admin',
            content: JSON.stringify(newMessage), // FIX: Stringify content for jsonb column
            is_read_by_admin: currentUser.role === 'admin',
            is_read_by_user: currentUser.role !== 'admin'
        };

        const { error } = await supabase.from('chat_messages').insert(payload);
        
        if (error) {
            console.error("Error sending message:", error);
        } else {
            setNewMessage('');
        }
    };

    const renderMessageContent = (content: string) => {
        try {
            // This will safely parse content that was saved as a JSON string (e.g., `"hello"`)
            // and return the raw content for older messages that were plain text.
            return JSON.parse(content);
        } catch (e) {
            return content;
        }
    };
    
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-r-lg">
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.map(msg => {
                    const isMyMessage = msg.sender_is_admin === (currentUser.role === 'admin');
                    return (
                        <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} mb-4`}>
                            <div className={`max-w-prose p-3 rounded-lg ${isMyMessage ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                {renderMessageContent(msg.content)}
                                <div className="text-xs opacity-70 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    )
                })}
                 <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t dark:border-gray-700 flex items-center">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 p-2 border rounded-l-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    aria-label="Escribe tu mensaje de soporte"
                />
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-r-lg disabled:bg-primary-300" disabled={!newMessage.trim()}><SendIcon /></button>
            </form>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    // --- STATE ---
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [session, setSession] = useState<AuthSession | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [alertState, setAlertState] = useState<AlertState>({ isOpen: false, message: '', type: 'success' });
    
    // Admin Features
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
    const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
    const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

    // Notifications
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    // User Data
    const [users, setUsers] = useState<User[]>([]); 
    const [events, setEvents] = useState<Event[]>([]); 
    const [clients, setClients] = useState<Client[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);

    // Chat
    const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatError, setChatError] = useState<string | null>(null);


    // State for budget modal to enable cross-component actions
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

    // AI State
    const [aiSuggestion, setAiSuggestion] = useState<{ title: string; suggestion: string; isLoading: boolean } | null>(null);
    
    // --- ROUTING ---
    const getPathFromHash = () => window.location.hash.substring(1); 
    const [path, setPath] = useState(getPathFromHash());

    useEffect(() => {
        const onHashChange = () => setPath(getPathFromHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);
    
    // --- FUNCTIONS ---
    const showAlert = (message: string, type: 'success' | 'error' = 'error') => {
        setAlertState({ isOpen: true, message, type });
    };

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    const fetchUserProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
        if (error) {
            console.error('Error fetching user profile:', error);
            if (error.code !== 'PGRST116') {
                 showAlert(`Error al cargar tu perfil: ${error.message}`, 'error');
                 await supabase.auth.signOut();
            }
            return null;
        }
        
        let profileData = data as any;
        const expiryDate = new Date(profileData.active_until);
        const today = new Date();
        today.setHours(0,0,0,0); // Compare against start of today

        if (expiryDate < today && profileData.status === 'active') {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ status: 'inactive' })
                .eq('id', userId);
            
            if (updateError) {
                console.error("Error auto-updating user status to inactive:", updateError);
            } else {
                console.log(`User ${userId} automatically set to inactive.`);
                profileData.status = 'inactive';
            }
        }
        
        const { data: { user } } = await supabase.auth.getUser();
        
        return { 
            ...profileData, 
            activeUntil: profileData.active_until,
            company_name: profileData.company_name,
            companyLogoUrl: profileData.company_logo_url,
            email: user?.email 
        } as User;
    }, []);
    
    useEffect(() => {
        const processSession = (session: AuthSession | null) => {
            setSession(session);
            if (session?.user) {
                fetchUserProfile(session.user.id).then(profile => {
                    if (profile && profile.status === 'inactive') {
                        showAlert('Tu cuenta está inactiva. Por favor, contacta al administrador.', 'error');
                        supabase.auth.signOut();
                        setCurrentUser(null);
                    } else {
                        setCurrentUser(profile);
                    }
                    setLoading(false);
                });
            } else {
                setCurrentUser(null);
                setLoading(false);
            }
        };

        setLoading(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            processSession(session);
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            processSession(session);
        });

        return () => authListener.subscription.unsubscribe();
    }, [fetchUserProfile]);


    const fetchAdminData = useCallback(async () => {
        const { data: stats, error: statsError } = await supabase.rpc('get_admin_dashboard_stats');
        if (statsError) {
            showAlert(`Error al cargar estadísticas del dashboard: ${statsError.message}`, 'error');
            return;
        }
        setAdminStats(stats as AdminDashboardStats);
       
        const { data: usersData, error: usersError } = await supabase.rpc('get_all_users_with_details');
        if (usersError) {
            showAlert(`Error al cargar la lista de usuarios: ${usersError.message}`, 'error');
            return;
        }
        setUsers(usersData as User[]);

        const { data: announcementsData, error: announcementsError } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if(announcementsError) showAlert('Error al cargar anuncios: ' + announcementsError.message, 'error');
        else setAnnouncements(announcementsData as Announcement[] || []);
        
        const { data: logsData, error: logsError } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
        if(logsError) showAlert('Error al cargar registro de actividad: ' + logsError.message, 'error');
        else setActivityLogs(logsData as ActivityLog[]);
        
    }, []);

    const fetchClients = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('name', { ascending: true });
        if (error) showAlert("Error al cargar los clientes: " + error.message, 'error');
        else setClients(data as Client[] || []);
    }, []);

    const fetchBudgets = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('budgets').select('*, client:clients(*)').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) showAlert("Error al cargar los presupuestos: " + error.message, 'error');
        else setBudgets(data as Budget[] || []);
    }, []);
    
    const fetchInquiries = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('inquiries').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) showAlert("Error al cargar las consultas: " + error.message, 'error');
        else setInquiries(data as Inquiry[] || []);
    }, []);

    const fetchUserData = useCallback(async (userId: string) => {
        const { data: eventsData, error: eventsError } = await supabase.from('events').select('*, client:clients(*)').eq('user_id', userId).order('date', { ascending: false });
        if (eventsError) showAlert("Error al cargar los eventos: " + eventsError.message, 'error');
        else setEvents(eventsData as Event[] || []);
        
        const { data: announcementData, error: announcementError } = await supabase.from('announcements').select('*').eq('is_active', true).limit(1).single();
        if(announcementData && !announcementError) {
             const announcementId = announcementData.id;
             const hasSeen = sessionStorage.getItem(`seen_announcement_${announcementId}`);
             if (!hasSeen) {
                 setActiveAnnouncement(announcementData as Announcement);
                 setIsAnnouncementModalOpen(true);
                 sessionStorage.setItem(`seen_announcement_${announcementId}`, 'true');
             }
        }
        
        const { data: notificationsData, error: notificationsError } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if(notificationsError) showAlert("Error al cargar notificaciones: " + notificationsError.message, 'error');
        else setNotifications(notificationsData as Notification[] || []);

    }, []);

    useEffect(() => {
        if (!currentUser) return;
        const fetchData = async () => {
            setLoading(true);
            if (currentUser.role === 'admin') await fetchAdminData();
            else {
                await fetchUserData(currentUser.id);
                await fetchClients(currentUser.id);
                await fetchBudgets(currentUser.id);
                await fetchInquiries(currentUser.id);
            }
            setLoading(false);
        };
        fetchData();
    }, [currentUser, fetchAdminData, fetchUserData, fetchClients, fetchBudgets, fetchInquiries]);

    const fetchChatUsers = useCallback(async () => {
        setChatError(null);
        try {
            const { data, error } = await supabase.rpc('get_chat_users_with_details');
            if (error) throw error;
            setChatUsers((data as ChatUser[]) || []);
        } catch (error: any) {
            console.error("Error fetching chat users", error);
            if (error.message.includes("404")) { 
                 setChatError("La función de chat no está configurada en la base de datos.");
            } else {
                 setChatError("Error al cargar usuarios del chat.");
            }
        }
    }, []);

    useEffect(() => {
        if (!currentUser) return;

        const fetchInitialMessages = async () => {
             setChatError(null);
             try {
                 if (currentUser.role === 'admin') {
                    await fetchChatUsers();
                    const { data: allMessages, error } = await supabase.from('chat_messages').select('*').order('created_at');
                    if (error) throw error;
                    setChatMessages((allMessages as ChatMessage[]) || []);
                 } else {
                    const { data, error } = await supabase.from('chat_messages').select('*').eq('user_id', currentUser.id).order('created_at');
                    if (error) throw error;
                    setChatMessages((data as ChatMessage[]) || []);
                 }
            } catch (error: any) {
                console.error("Error fetching messages", error);
                if (error.message.includes("does not exist")) { 
                    setChatError("La tabla de chat no está configurada en la base de datos.");
                } else {
                    setChatError("Error al cargar los mensajes.");
                }
            }
        }
        fetchInitialMessages();

        const channel = supabase.channel('chat-messages-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
                async (payload) => {
                    const newMessage = payload.new as ChatMessage;
                    if (currentUser.role === 'admin') {
                        setChatMessages(prev => [...prev, newMessage]);
                        await fetchChatUsers();
                    } else if (newMessage.user_id === currentUser.id) {
                         setChatMessages(prev => [...prev, newMessage]);
                    }
                }
            )
            .subscribe();
        
        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, fetchChatUsers]);

    const handleLogout = async () => {
        sessionStorage.clear();
        await supabase.auth.signOut();
        setCurrentPage('dashboard');
    };
    
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    
    const saveEvent = async (event: Event) => {
        const isNew = !event.id;
        
        const payload: any = {
            user_id: currentUser!.id,
            client_id: event.client_id,
            name: event.name,
            location: event.location,
            date: event.date,
            amount_charged: event.amount_charged,
            expenses: event.expenses.map(({ id: expenseId, ...rest }) => rest),
            observations: event.observations,
        };
        
        if (!isNew) {
            payload.id = event.id;
        }

        const { error } = await supabase.from('events').upsert(payload);

        if (error) {
            showAlert('Error al guardar el evento: ' + error.message, 'error');
        } else {
            showAlert('Evento guardado exitosamente.', 'success');
            await logActivity(isNew ? 'event_created' : 'event_updated', { eventName: event.name });
            if (isNew) {
                const eventClient = clients.find(c => c.id === event.client_id);
                if (eventClient && eventClient.email) {
                    await supabase.functions.invoke('send-event-confirmation', {
                        body: {
                            clientEmail: eventClient.email,
                            clientName: eventClient.name,
                            eventName: event.name,
                            eventDate: event.date,
                            eventLocation: event.location,
                            companyName: currentUser!.company_name,
                        }
                    });
                }
            }
            await fetchUserData(currentUser!.id);
        }
    };

    const deleteEvent = async (eventId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            const eventToDelete = events.find(e => e.id === eventId);
            const { error } = await supabase.from('events').delete().eq('id', eventId);
            if (error) showAlert('Error al eliminar el evento: ' + error.message, 'error');
            else {
                showAlert('Evento eliminado.', 'success');
                await logActivity('event_deleted', { eventName: eventToDelete?.name || 'Desconocido' });
                await fetchUserData(currentUser!.id);
            }
        }
    };

    const saveClient = async (client: Client): Promise<Client | null> => {
        const isNew = !client.id;
        
        const payload: any = {
            user_id: currentUser!.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
        };
        
        if (!isNew) {
            payload.id = client.id;
        }
        
        const { data, error } = await supabase.from('clients').upsert(payload).select().single();

        if (error) {
            showAlert('Error al guardar el cliente: ' + error.message, 'error');
            return null;
        } else {
            showAlert('Cliente guardado exitosamente.', 'success');
            await logActivity(isNew ? 'client_created' : 'client_updated', { clientName: client.name });
            if (isNew && client.email) {
                 await supabase.functions.invoke('send-welcome-email', {
                    body: { email: client.email, name: client.name, djCompanyName: currentUser!.company_name },
                });
            }
            await fetchClients(currentUser!.id);
            return data as Client;
        }
    };
    
    const deleteClient = async (clientId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este cliente? Esto no eliminará sus eventos asociados.')) {
            const clientToDelete = clients.find(c => c.id === clientId);
            const { error } = await supabase.from('clients').delete().eq('id', clientId);
            if (error) showAlert('Error al eliminar el cliente: ' + error.message, 'error');
            else {
                showAlert('Cliente eliminado.', 'success');
                await logActivity('client_deleted', { clientName: clientToDelete?.name || 'Desconocido' });
                await fetchClients(currentUser!.id);
            }
        }
    };

    const saveUser = async (user: User, password?: string) => {
        const isNewUser = !user.id;
        const { id, role, status, activeUntil, company_name, companyLogoUrl, notification_email } = user;

        if (isNewUser) {
             if (!user.email || !password) {
                showAlert("Email y contraseña son requeridos para crear un usuario.", 'error');
                return;
            }
            const { error } = await supabase.functions.invoke('create-user', {
                body: { email: user.email, password, companyName: company_name, activeUntil },
            });
            if (error) showAlert("Error al crear usuario: " + error.message, 'error');
            else {
                showAlert("Usuario creado exitosamente.", 'success');
                await logActivity('admin_user_created', { userEmail: user.email });
                await fetchAdminData();
            }
        } else {
            const updateData: any = { role, status, active_until: activeUntil, company_name, company_logo_url: companyLogoUrl };
            if (currentUser?.role === 'admin') {
                updateData.notification_email = notification_email;
            }
            const { error } = await supabase.from('profiles').update(updateData).eq('id', id);

            if (error) showAlert("Error actualizando perfil: " + error.message, 'error');
            else {
                await fetchAdminData();
                if (currentUser?.id === user.id) setCurrentUser(await fetchUserProfile(user.id));
                showAlert("Perfil actualizado exitosamente.", 'success');
                await logActivity('admin_user_updated', { userEmail: user.email });
            }
        }
    };
    
    const uploadFile = async (bucket: string, path: string, file: File) => {
         const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
        if (error) {
            showAlert(`Error al subir archivo: ${error.message}`, 'error');
            return null;
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return `${data.publicUrl}?t=${new Date().getTime()}`;
    }

    const uploadLogo = (userId: string, file: File) => uploadFile('logos', `${userId}/logo.${file.name.split('.').pop()}`, file);

    const saveAnnouncement = async (announcement: Announcement, imageFile?: File | null) => {
        let imageUrl = announcement.image_url;
        if(imageFile) {
            const newImageUrl = await uploadFile('announcements', `image_${Date.now()}.${imageFile.name.split('.').pop()}`, imageFile);
            if(!newImageUrl) return; // Stop if upload fails
            imageUrl = newImageUrl;
        }
        
        const payload = {
            title: announcement.title,
            content: announcement.content,
            image_url: imageUrl,
            is_active: announcement.is_active,
            created_by: currentUser!.id
        };
        
        const upsertData = announcement.id ? { ...payload, id: announcement.id } : payload;

        const { error } = await supabase.from('announcements').upsert(upsertData);
        if(error) showAlert('Error guardando anuncio: ' + error.message, 'error');
        else {
            showAlert('Anuncio guardado exitosamente.', 'success');
            await logActivity('admin_announcement_saved', { title: announcement.title });
            await fetchAdminData();
        }
    };

    const deleteAnnouncement = async (id: string) => {
        if(window.confirm('¿Estás seguro de que quieres eliminar este anuncio?')) {
            const announcementToDelete = announcements.find(a => a.id === id);
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if(error) showAlert('Error eliminando anuncio: ' + error.message, 'error');
            else {
                showAlert('Anuncio eliminado.', 'success');
                await logActivity('admin_announcement_deleted', { title: announcementToDelete?.title || 'Desconocido' });
                await fetchAdminData();
            }
        }
    };
    
    const toggleAnnouncementActive = async (announcement: Announcement) => {
        const { error: deactivateError } = await supabase.from('announcements').update({ is_active: false }).neq('id', announcement.id);
        if(deactivateError) {
             showAlert('Error al actualizar anuncios: ' + deactivateError.message, 'error');
             return;
        }
        
        const { error: activateError } = await supabase.from('announcements').update({ is_active: !announcement.is_active }).eq('id', announcement.id);
        if(activateError) showAlert('Error al activar anuncio: ' + activateError.message, 'error');
        else await fetchAdminData();
    };
    
    const sendNotificationToAll = async (message: string) => {
        if(!message.trim()) {
            showAlert('El mensaje no puede estar vacío.', 'error');
            return;
        }
        const { error } = await supabase.functions.invoke('send-notification', { body: { message } });
        if(error) showAlert('Error al enviar notificación: ' + error.message, 'error');
        else {
            showAlert('Notificación enviada a todos los usuarios.', 'success');
            await logActivity('admin_mass_notification_sent');
        }
    };

    const markNotificationsAsRead = async () => {
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length === 0) return;
        
        const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
        if(error) console.error("Error marking notifications as read:", error);
        else {
            const updatedNotifications = notifications.map(n => ({...n, is_read: true}));
            setNotifications(updatedNotifications);
        }
    };

    const daysUntilExpiry = useMemo(() => {
        if (!currentUser?.activeUntil) return null;
        const expiryDate = new Date(currentUser.activeUntil);
        const today = new Date();
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }, [currentUser]);
    
    const saveBudget = async (budget: Budget) => {
        const isNew = !budget.id;
        
        const payload: any = {
            user_id: currentUser!.id,
            client_id: budget.client_id,
            title: budget.title,
            status: budget.status,
            items: budget.items.map(({ id: itemId, ...rest }) => rest),
            discount: budget.discount,
            notes: budget.notes,
            valid_until: budget.valid_until,
        };

        if (!isNew) {
            payload.id = budget.id;
        }
        
        const { error } = await supabase.from('budgets').upsert(payload);

        if (error) {
            showAlert('Error al guardar el presupuesto: ' + error.message, 'error');
        } else {
            showAlert('Presupuesto guardado exitosamente.', 'success');
            await logActivity(isNew ? 'budget_created' : 'budget_updated', { title: budget.title });
            await fetchBudgets(currentUser!.id);
        }
    };

    const deleteBudget = async (budgetId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este presupuesto?')) {
            const budgetToDelete = budgets.find(b => b.id === budgetId);
            const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
            if (error) showAlert('Error al eliminar el presupuesto: ' + error.message, 'error');
            else {
                showAlert('Presupuesto eliminado.', 'success');
                await logActivity('budget_deleted', { title: budgetToDelete?.title || 'Desconocido' });
                await fetchBudgets(currentUser!.id);
            }
        }
    };
    
    const convertInquiryToBudget = async (inquiry: Inquiry) => {
        let client = clients.find(c => c.email && c.email === inquiry.client_email && inquiry.client_email !== '');
        
        if (!client) {
            const newClient = await saveClient({
                id: '',
                user_id: currentUser!.id,
                name: inquiry.client_name,
                phone: inquiry.client_phone || '',
                email: inquiry.client_email || ''
            });
            if (!newClient) {
                showAlert("No se pudo crear el cliente desde la consulta.", "error");
                return;
            }
            client = newClient;
        }

        const newBudget: Budget = {
            id: '', 
            user_id: currentUser!.id,
            client_id: client.id,
            title: inquiry.event_type || `Presupuesto para ${client.name}`,
            status: 'Borrador',
            items: [{ id: Math.random().toString(), description: inquiry.event_type || 'Servicio de DJ', quantity: 1, price: 0 }],
            discount: 0,
            notes: inquiry.message || '',
            created_at: new Date().toISOString()
        };
        
        setSelectedBudget(newBudget);
        setIsBudgetModalOpen(true);
        setCurrentPage('budgets');
    };

    const handleGetInquirySuggestion = async (inquiry: Inquiry) => {
        setAiSuggestion({ title: 'Sugerencia de Respuesta', suggestion: '', isLoading: true });
        const suggestion = await getInquiryReplySuggestion(inquiry.message || 'El cliente no dejó un mensaje detallado.');
        setAiSuggestion(prev => ({ ...prev!, suggestion, isLoading: false }));
    };

    const handleGetFollowUpSuggestion = async (budget: Budget) => {
        setAiSuggestion({ title: 'Sugerencia de Seguimiento', suggestion: '', isLoading: true });
        const clientName = clients.find(c => c.id === budget.client_id)?.name || 'Cliente';
        const suggestion = await getFollowUpEmailSuggestion(clientName, budget.title);
        setAiSuggestion(prev => ({ ...prev!, suggestion, isLoading: false }));
    };

    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">Cargando...</div>;
    }

    if (path.startsWith('/inquiry/')) {
        const userId = path.split('/')[2];
        if (userId) {
            return <PublicInquiryPage userId={userId} />;
        }
    }
    
    return (
        <>
            {session && currentUser ? (
                <div className="relative md:flex h-screen bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-gray-100 overflow-hidden">
                    {isSidebarOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}
                    <Sidebar
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        currentUser={currentUser}
                        handleLogout={handleLogout}
                        isOpen={isSidebarOpen}
                        setIsOpen={setIsSidebarOpen}
                    />
                    <main className="flex-1 p-4 md:p-6 overflow-y-auto">
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
                            isBudgetModalOpen={isBudgetModalOpen}
                            setIsBudgetModalOpen={setIsBudgetModalOpen}
                            selectedBudget={selectedBudget}
                            setSelectedBudget={setSelectedBudget}
                            adminStats={adminStats}
                            activityLogs={activityLogs}
                            fetchAdminData={fetchAdminData}
                            handleGetInquirySuggestion={handleGetInquirySuggestion}
                            handleGetFollowUpSuggestion={handleGetFollowUpSuggestion}
                            chatUsers={chatUsers}
                            chatMessages={chatMessages}
                            fetchChatUsers={fetchChatUsers}
                            chatError={chatError}
                        />
                    </main>
                    {isAnnouncementModalOpen && activeAnnouncement && (
                        <AnnouncementModal 
                            announcement={activeAnnouncement} 
                            onClose={() => setIsAnnouncementModalOpen(false)} 
                        />
                    )}
                </div>
            ) : (
                <AuthScreen showAlert={showAlert} />
            )}
            <AlertModal alertState={alertState} onClose={() => setAlertState({ ...alertState, isOpen: false })} />
            {aiSuggestion && <AiSuggestionModal {...aiSuggestion} onClose={() => setAiSuggestion(null)} />}
        </>
    );
};

export default App;
