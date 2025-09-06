import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Page, Event, Client, Expense, User, Notification, Announcement, Budget, BudgetItem, BudgetStatus, Inquiry } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon, AgendaIcon, CloseIcon, TrashIcon, PlusIcon, MenuIcon, SuccessIcon, ErrorIcon, BellIcon, WarningIcon, AnnouncementIcon, SendIcon, BudgetIcon, PdfIcon, EditIcon, EmailIcon, InquiryIcon } from './components/Icons.tsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, AuthSession } from '@supabase/supabase-js';

// --- SUPABASE CLIENT ---
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be provided in environment variables.");
}
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// --- TYPES ---
type AlertState = {
    isOpen: boolean;
    message: string;
    type: 'success' | 'error';
}

// --- HELPERS ---
const formatGuarani = (amount: number) =>
    new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(amount);

// --- AUTH SCREEN COMPONENT ---
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

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md w-96">
                <h1 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">GestionSystemDj</h1>
                
                <form onSubmit={handleLogin}>
                    <div className="mb-4">
                        <label className="block text-gray-700 dark:text-gray-300 mb-2" htmlFor="login-email">Usuario (Email)</label>
                        <input type="text" id="login-email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 mb-2" htmlFor="login-password">Contraseña</label>
                        <input type="password" id="login-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition duration-300 disabled:bg-primary-300">
                        {loading ? 'Cargando...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- MODAL & UI COMPONENTS ---

const AlertModal: React.FC<{ alertState: AlertState; onClose: () => void; }> = ({ alertState, onClose }) => {
    if (!alertState.isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                <div className="flex justify-center mb-4">
                    {alertState.type === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                </div>
                <p className="text-lg mb-6 text-gray-700 dark:text-gray-300">{alertState.message}</p>
                <button
                    onClick={onClose}
                    className="w-full px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                    Aceptar
                </button>
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
                { page: 'sendNotification', label: 'Enviar Notificación', icon: <SendIcon /> }
            );
        } else {
             items.push(
                { page: 'inquiries', label: 'Consultas', icon: <InquiryIcon /> },
                { page: 'budgets', label: 'Presupuestos', icon: <BudgetIcon /> },
                { page: 'events', label: 'Eventos', icon: <EventsIcon /> },
                { page: 'clients', label: 'Clientes', icon: <ClientsIcon /> },
                { page: 'agenda', label: 'Agenda', icon: <AgendaIcon /> },
                { page: 'reports', label: 'Reportes', icon: <ReportsIcon /> }
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
                    <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">GestionSystem</h1>
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
                <div className="border-t dark:border-gray-700 pt-6">
                    <button type="submit" disabled={isSaving} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition duration-300 disabled:bg-primary-400">
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// --- PDF Generation Helper ---
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
            doc.text(`Generado por GestionSystemDj`, pageMargin, doc.internal.pageSize.height - 10);
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


// Main App Component / Router
const AppContainer: React.FC = () => {
    // Get path from hash, fallback to empty string
    const getPathFromHash = () => window.location.hash.substring(1); 
    const [path, setPath] = useState(getPathFromHash());

    useEffect(() => {
        const onHashChange = () => setPath(getPathFromHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    if (path.startsWith('/inquiry/')) {
        const userId = path.split('/')[2];
        if (userId) {
            return <PublicInquiryPage userId={userId} />;
        }
    }

    return <App />;
}


// Main App Component
const App: React.FC = () => {
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

    // Notifications
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    // User Data
    const [users, setUsers] = useState<User[]>([]); 
    const [events, setEvents] = useState<Event[]>([]); 
    const [clients, setClients] = useState<Client[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);


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
        const { data: { user } } = await supabase.auth.getUser();
        
        const profileData = data as any;
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
        // Users
        const { data: usersData, error: usersError } = await supabase.functions.invoke('get-all-users');
        if (usersError) {
            showAlert(`Error al cargar la lista de usuarios: ${usersError.message}`, 'error');
        } else {
            const mappedUsers = (usersData as any[]).map(user => ({...user, activeUntil: user.active_until }));
            setUsers(mappedUsers as User[]);
        }
        // Announcements
        const { data: announcementsData, error: announcementsError } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if(announcementsError) showAlert('Error al cargar anuncios: ' + announcementsError.message, 'error');
        else setAnnouncements(announcementsData as Announcement[] || []);
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
        // Events
        const { data: eventsData, error: eventsError } = await supabase.from('events').select('*, client:clients(*)').eq('user_id', userId).order('date', { ascending: false });
        if (eventsError) showAlert("Error al cargar los eventos: " + eventsError.message, 'error');
        else setEvents(eventsData as Event[] || []);
        
        // Active Announcement
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
        
        // Notifications
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

    const handleLogout = async () => {
        sessionStorage.clear(); // Clear session storage on logout
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
            const { error } = await supabase.from('events').delete().eq('id', eventId);
            if (error) showAlert('Error al eliminar el evento: ' + error.message, 'error');
            else {
                showAlert('Evento eliminado.', 'success');
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
            const { error } = await supabase.from('clients').delete().eq('id', clientId);
            if (error) showAlert('Error al eliminar el cliente: ' + error.message, 'error');
            else {
                showAlert('Cliente eliminado.', 'success');
                await fetchClients(currentUser!.id);
            }
        }
    };

    const saveUser = async (user: User, password?: string) => {
        const isNewUser = !user.id;
        const { id, role, status, activeUntil, company_name, companyLogoUrl } = user;

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
                await fetchAdminData();
            }
        } else {
            const updateData = { role, status, active_until: activeUntil, company_name, company_logo_url: companyLogoUrl };
            const { error } = await supabase.from('profiles').update(updateData).eq('id', id);
            if (error) showAlert("Error actualizando perfil: " + error.message, 'error');
            else {
                await fetchAdminData();
                if (currentUser?.id === user.id) setCurrentUser(await fetchUserProfile(user.id));
                showAlert("Perfil actualizado exitosamente.", 'success');
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
            await fetchAdminData();
        }
    };

    const deleteAnnouncement = async (id: string) => {
        if(window.confirm('¿Estás seguro de que quieres eliminar este anuncio?')) {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if(error) showAlert('Error eliminando anuncio: ' + error.message, 'error');
            else {
                showAlert('Anuncio eliminado.', 'success');
                await fetchAdminData();
            }
        }
    };
    
    const toggleAnnouncementActive = async (announcement: Announcement) => {
        // Deactivate all other announcements first
        const { error: deactivateError } = await supabase.from('announcements').update({ is_active: false }).neq('id', announcement.id);
        if(deactivateError) {
             showAlert('Error al actualizar anuncios: ' + deactivateError.message, 'error');
             return;
        }
        
        // Activate the selected one
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
        else showAlert('Notificación enviada a todos los usuarios.', 'success');
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
            await fetchBudgets(currentUser!.id);
        }
    };

    const deleteBudget = async (budgetId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este presupuesto?')) {
            const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
            if (error) showAlert('Error al eliminar el presupuesto: ' + error.message, 'error');
            else {
                showAlert('Presupuesto eliminado.', 'success');
                await fetchBudgets(currentUser!.id);
            }
        }
    };
    
    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">Cargando...</div>;
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
        </>
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
}> = (props) => {
    switch (props.currentPage) {
        case 'dashboard':
            return props.currentUser.role === 'admin' 
                ? <DashboardAdmin users={props.users} /> 
                : <DashboardUser events={props.events} />;
        case 'inquiries':
            return <InquiriesPage 
                        inquiries={props.inquiries} 
                        currentUser={props.currentUser} 
                        clients={props.clients}
                        saveClient={props.saveClient}
                        setCurrentPage={props.setCurrentPage}
                        showAlert={props.showAlert}
                        fetchInquiries={props.fetchInquiries}
                    />;
        case 'budgets':
            return <BudgetsPage budgets={props.budgets} clients={props.clients} currentUser={props.currentUser} saveBudget={props.saveBudget} deleteBudget={props.deleteBudget} showAlert={props.showAlert} />;
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
        default:
            return <div>Página no encontrada o en construcción.</div>;
    }
};

const DashboardAdmin: React.FC<{users: User[]}> = ({users}) => {
    const activeUsers = users.filter(u => u.status === 'active').length;
    const inactiveUsers = users.filter(u => u.status === 'inactive').length;
    const data = [
        { name: 'Activos', value: activeUsers, fill: '#3b82f6' },
        { name: 'Inactivos', value: inactiveUsers, fill: '#ef4444' }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Resumen de Usuarios</h3>
                 <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                             {data.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(value) => `${value} usuarios`} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow flex flex-col justify-center items-center">
                <h3 className="text-xl font-semibold mb-4">Total de Usuarios</h3>
                <p className="text-6xl font-bold text-primary-600">{users.length}</p>
            </div>
        </div>
    );
};
const DashboardUser: React.FC<{events: Event[]}> = ({events}) => {
    const { totalIncome, totalExpenses, netProfit, monthlyData, topClients } = useMemo(() => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const currentMonthEvents = events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
        });

        const totalIncome = currentMonthEvents.reduce((acc, e) => acc + e.amount_charged, 0);
        const totalExpenses = currentMonthEvents.reduce((acc, e) => acc + e.expenses.reduce((expAcc, exp) => expAcc + exp.amount, 0), 0);
        const netProfit = totalIncome - totalExpenses;
        
        // Monthly trend data (last 12 months)
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

        // Top clients data
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

        return { totalIncome, totalExpenses, netProfit, monthlyData, topClients };
    }, [events]);
    
    const formatYAxis = (tickItem: number): string => {
        if (tickItem >= 1000000) return `${(tickItem / 1000000).toFixed(1)}M`;
        if (tickItem >= 1000) return `${Math.round(tickItem / 1000)}k`;
        return tickItem.toString();
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Ingresos Totales (Mes)</h4>
                    <p className="text-3xl font-bold text-green-500 mt-2">{formatGuarani(totalIncome)}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Gastos Totales (Mes)</h4>
                    <p className="text-3xl font-bold text-red-500 mt-2">{formatGuarani(totalExpenses)}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow text-center">
                    <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-300">Ganancia Neta (Mes)</h4>
                    <p className="text-3xl font-bold text-blue-500 mt-2">{formatGuarani(netProfit)}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4">Tendencia de Ingresos (Últimos 12 meses)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyData}>
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
                        <BarChart data={topClients} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128, 128, 128, 0.3)" />
                            <XAxis type="number" />
                            <YAxis type="category" dataKey="name" width={100} />
                            <Tooltip formatter={(value) => `${value} eventos`} />
                            <Legend />
                            <Bar dataKey="Eventos" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
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
            // FIX: Explicitly cast to User to satisfy TypeScript
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
                                <td className="p-2">{new Date(user.activeUntil).toLocaleDateString()}</td>
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
                doc.text(`Generado por GestionSystemDj`, data.settings.margin.left, doc.internal.pageSize.height - 10);
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

// --- NEW ADMIN COMPONENTS ---

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


// --- NEW USER COMPONENT ---

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

// --- NEW BUDGET COMPONENTS ---

const BudgetsPage: React.FC<{
    budgets: Budget[];
    clients: Client[];
    currentUser: User;
    saveBudget: (budget: Budget) => Promise<void>;
    deleteBudget: (id: string) => Promise<void>;
    showAlert: (message: string, type: 'success' | 'error') => void;
}> = ({ budgets, clients, currentUser, saveBudget, deleteBudget, showAlert }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
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
        const client = clients.find(c => c.id === budget.client_id);
        const doc = await generateBudgetPDF(budget, currentUser, client);
        window.open(doc.output('bloburl'), '_blank');
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
    const isNew = !budget;
    const initialBudget: Budget = useMemo(() => {
        return budget || {
            id: '', user_id: '', client_id: clients[0]?.id || '', title: '', status: 'Borrador',
            items: [{ id: Math.random().toString(), description: '', quantity: 1, price: 0 }],
            discount: 0, notes: '', created_at: new Date().toISOString()
        }
    }, [budget, clients]);

    const [formData, setFormData] = useState<Budget>(initialBudget);

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

    const addItem = () => {
        setFormData(prev => ({...prev, items: [...prev.items, { id: Math.random().toString(), description: '', quantity: 1, price: 0 }]}));
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
                         <button type="button" onClick={addItem} className="flex items-center text-primary-600 mt-2"><PlusIcon /> <span className="ml-1">Añadir Item</span></button>
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

// ---- NEW INQUIRY COMPONENTS ----

const InquiriesPage: React.FC<{
    inquiries: Inquiry[];
    currentUser: User;
    clients: Client[];
    saveClient: (client: Client) => Promise<Client | null>;
    setCurrentPage: (page: Page) => void;
    showAlert: (message: string, type: 'success' | 'error') => void;
    fetchInquiries: (userId: string) => Promise<void>;
}> = ({ inquiries, currentUser, clients, saveClient, setCurrentPage, showAlert, fetchInquiries }) => {
    
    const publicLink = `${window.location.origin}${window.location.pathname}#/inquiry/${currentUser.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicLink)}`;

    const handleConvertToBudget = async (inquiry: Inquiry) => {
        let client = clients.find(c => c.email && c.email === inquiry.client_email);
        if (!client) {
            const newClient = await saveClient({
                id: '',
                user_id: currentUser.id,
                name: inquiry.client_name,
                phone: inquiry.client_phone || '',
                email: inquiry.client_email || ''
            });
            if (!newClient) {
                showAlert("No se pudo crear un nuevo cliente a partir de la consulta.", "error");
                return;
            }
            client = newClient;
        }
        
        showAlert("Cliente encontrado/creado. Por favor, crea un presupuesto para ellos.", "success");
        setCurrentPage('budgets');
    };

    const updateInquiryStatus = async (inquiryId: string, status: Inquiry['status']) => {
        const { error } = await supabase.from('inquiries').update({ status }).eq('id', inquiryId);
        if (error) {
            showAlert("Error al actualizar estado: " + error.message, 'error');
        } else {
            await fetchInquiries(currentUser.id);
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
                                    <td className="p-2">
                                        <button 
                                            onClick={() => handleConvertToBudget(inquiry)} 
                                            className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 text-sm font-semibold"
                                        >
                                            Convertir a Presupuesto
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


// Router in index.tsx is better, but this works for this environment
export default AppContainer;
