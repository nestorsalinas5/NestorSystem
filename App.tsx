
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Page, Event, Client, Expense, User } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon } from './components/Icons.tsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient } from '@supabase/supabase-js';
import { AuthSession } from '@supabase/supabase-js';

// --- SUPABASE CLIENT ---
// These are exposed to the client-side and are safe to use here.
// RLS policies on Supabase will protect your data.
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided in environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


// --- HELPERS ---
const formatGuarani = (amount: number) => 
    new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(amount);

// Main App Component
const App: React.FC = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [session, setSession] = useState<AuthSession | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [loading, setLoading] = useState(true);

    const [users, setUsers] = useState<User[]>([]); // For admin view
    const [events, setEvents] = useState<Event[]>([]); // For user view

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', theme);
    }, [theme]);

    const fetchUserProfile = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
        return data as User;
    }, []);
    
    useEffect(() => {
        setLoading(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          if (session?.user) {
            fetchUserProfile(session.user.id).then(profile => {
                setCurrentUser(profile);
                setLoading(false);
            });
          } else {
            setLoading(false);
          }
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user) {
                fetchUserProfile(session.user.id).then(setCurrentUser);
            } else {
                setCurrentUser(null);
            }
        });

        return () => authListener.subscription.unsubscribe();
    }, [fetchUserProfile]);


    // Data fetching based on user role
    useEffect(() => {
        if (!currentUser) return;
        
        const fetchData = async () => {
            setLoading(true);
            if (currentUser.role === 'admin') {
                const { data, error } = await supabase.from('profiles').select('*');
                if (error) console.error("Error fetching users:", error);
                else setUsers(data as User[]);
            } else {
                const { data, error } = await supabase.from('events').select('*').eq('user_id', currentUser.id);
                if (error) console.error("Error fetching events:", error);
                else setEvents(data as Event[]);
            }
            setLoading(false);
        };

        fetchData();
    }, [currentUser]);


    const handleLogout = async () => {
        await supabase.auth.signOut();
        setCurrentPage('dashboard');
    };
    
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    
    const saveEvent = async (event: Event) => {
        const eventToSave = { ...event, user_id: currentUser!.id };
        const { data, error } = await supabase.from('events').upsert(eventToSave).select().single();
        if (error) {
            alert("Error al guardar el evento: " + error.message);
        } else if (data) {
            setEvents(prev => {
                const index = prev.findIndex(e => e.id === data.id);
                if (index > -1) {
                    const updated = [...prev];
                    updated[index] = data as Event;
                    return updated;
                }
                return [...prev, data as Event];
            });
        }
    };
    
    const deleteEvent = async (eventId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            const { error } = await supabase.from('events').delete().match({ id: eventId });
            if (error) alert("Error al eliminar evento: " + error.message);
            else setEvents(events.filter(e => e.id !== eventId));
        }
    };

    const saveUser = async (user: User) => {
        if (!user.id) { 
            const email = prompt("Ingrese el email para el nuevo usuario:");
            const password = prompt("Ingrese una contraseña temporal para el nuevo usuario:");
            if (!email || !password) return;

            alert("La creación de usuarios debe realizarse a través de una función segura del servidor. Esta es una simulación. En producción, use Supabase Functions para manejar el signUp del administrador.");
            // In a real app, you would call a serverless function here to create the user securely.
            // For this project, the admin can ask the user to sign up, then the admin sets their role.
            return;
        } else { // Existing user
            const { id, ...updateData } = user;
            const { error } = await supabase.from('profiles').update(updateData).eq('id', id);
            if (error) {
                alert("Error actualizando perfil: " + error.message);
            } else {
                setUsers(prev => prev.map(u => u.id === id ? user : u));
                if (currentUser?.id === id) {
                    setCurrentUser(user);
                }
            }
        }
    };

    const uploadLogo = async (userId: string, file: File) => {
        const fileExt = file.name.split('.').pop();
        const filePath = `${userId}/logo.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true });
        
        if (uploadError) {
            alert('Error al subir el logo: ' + uploadError.message);
            return null;
        }

        const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
        return `${data.publicUrl}?t=${new Date().getTime()}`;
    };

    // Placeholder components for brevity in this single file structure
    
    // ... LOGIN SCREEN ...
    const LoginScreen = () => {
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [isSigningUp, setIsSigningUp] = useState(false);
        const [companyName, setCompanyName] = useState('');
        const [loading, setLoading] = useState(false);

        const handleLogin = async (e: React.FormEvent) => {
            e.preventDefault();
            setLoading(true);
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) alert(error.message);
            setLoading(false);
        };
        
        const handleSignup = async (e: React.FormEvent) => {
            e.preventDefault();
            setLoading(true);
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) {
                alert(error.message);
            } else if (data.user) {
                // Now, create a profile for the new user
                const { error: profileError } = await supabase.from('profiles').insert({
                    id: data.user.id,
                    role: 'user',
                    status: 'active',
                    activeUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year trial
                    companyName,
                    company_logo_url: null
                });
                if (profileError) {
                    alert("Error creating profile: " + profileError.message);
                } else {
                    alert("¡Registro exitoso! Por favor, revisa tu correo para verificar tu cuenta.");
                }
            }
            setLoading(false);
        };

        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md w-96">
                    <h1 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">GestionSystemDj</h1>
                    <form onSubmit={isSigningUp ? handleSignup : handleLogin}>
                        <div className="mb-4">
                            <label className="block text-gray-700 dark:text-gray-300 mb-2" htmlFor="email">Email</label>
                            <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 dark:text-gray-300 mb-2" htmlFor="password">Contraseña</label>
                            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                        </div>
                        {isSigningUp && (
                            <div className="mb-4">
                                <label className="block text-gray-700 dark:text-gray-300 mb-2" htmlFor="companyName">Nombre de la Empresa</label>
                                <input type="text" id="companyName" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
                            </div>
                        )}
                        <button type="submit" disabled={loading} className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition duration-300 disabled:bg-primary-300">
                            {loading ? 'Cargando...' : (isSigningUp ? 'Registrarse' : 'Iniciar Sesión')}
                        </button>
                    </form>
                    <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                        {isSigningUp ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'}
                        <button onClick={() => setIsSigningUp(!isSigningUp)} className="text-primary-600 hover:underline ml-1">
                            {isSigningUp ? 'Inicia sesión' : 'Regístrate'}
                        </button>
                    </p>
                </div>
            </div>
        );
    };


    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">Cargando...</div>;
    }

    if (!session || !currentUser) {
        return <LoginScreen />;
    }
    
    // ... ACTUAL APP UI ...
    return (
      <div className="flex h-screen bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
        <Sidebar 
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            currentUser={currentUser}
            handleLogout={handleLogout}
        />
        <main className="flex-1 p-6 overflow-y-auto">
            <Header 
                currentPage={currentPage} 
                currentUser={currentUser} 
                toggleTheme={toggleTheme} 
                theme={theme} 
            />
            {/* We will render page content directly here for simplicity */}
            <div>Render Page Content Here...</div>
        </main>
      </div>
    );
};

// ... Sidebar Component ...
const Sidebar: React.FC<{ currentPage: Page, setCurrentPage: (page: Page) => void, currentUser: User, handleLogout: () => void }> = ({ currentPage, setCurrentPage, currentUser, handleLogout }) => {
    const commonItems = [
        { page: 'dashboard' as Page, label: 'Dashboard', icon: <DashboardIcon /> },
    ];
    
    const userItems = [
        { page: 'events' as Page, label: 'Ver Eventos', icon: <EventsIcon /> },
        { page: 'clients' as Page, label: 'Clientes', icon: <ClientsIcon /> },
        { page: 'reports' as Page, label: 'Reportes', icon: <ReportsIcon /> },
        { page: 'settings' as Page, label: 'Configuración', icon: <SettingsIcon /> },
    ];

    const adminItems = [
        { page: 'userManagement' as Page, label: 'Gestionar Usuarios', icon: <UserManagementIcon /> },
    ];

    const navItems = currentUser.role === 'admin' ? [...commonItems, ...adminItems] : [...commonItems, ...userItems];
    
    return (
        <aside className="w-64 bg-white dark:bg-gray-800 shadow-md flex flex-col">
            <div className="p-4 border-b dark:border-gray-700">
                <h1 className="text-2xl font-bold text-primary-600">GestionSystemDj</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{currentUser.companyName}</p>
            </div>
            <nav className="flex-1 p-2">
                {navItems.map(item => (
                    <button key={item.page} onClick={() => setCurrentPage(item.page)} className={`w-full flex items-center p-3 my-1 rounded-lg transition-colors ${currentPage === item.page ? 'bg-primary-100 dark:bg-primary-900 text-primary-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        {item.icon}
                        <span className="ml-4">{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t dark:border-gray-700">
                <button onClick={handleLogout} className="w-full flex items-center p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    <LogoutIcon />
                    <span className="ml-4">Cerrar Sesión</span>
                </button>
            </div>
        </aside>
    );
};

// ... Header Component ...
const Header: React.FC<{ currentPage: Page, currentUser: User, toggleTheme: () => void, theme: 'light' | 'dark' }> = ({ currentPage, currentUser, toggleTheme, theme }) => {
    const pageTitles: { [key in Page]: string } = {
        dashboard: 'Dashboard',
        events: 'Eventos',
        clients: 'Clientes',
        agenda: 'Agenda',
        reports: 'Reportes',
        settings: 'Configuración',
        userManagement: 'Gestión de Usuarios'
    };

    const daysUntilExpiry = useMemo(() => {
        if (!currentUser.activeUntil) return Infinity;
        const expiryDate = new Date(currentUser.activeUntil);
        const now = new Date();
        return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }, [currentUser.activeUntil]);

    return (
        <header className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{pageTitles[currentPage]}</h2>
            <div className="flex items-center space-x-4">
                {currentUser.role === 'user' && daysUntilExpiry <= 10 && (
                    <div className="bg-yellow-100 dark:bg-yellow-900 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-300 p-2 rounded-md text-sm">
                        <p>Tu licencia vence en {daysUntilExpiry} días. Contacta al administrador.</p>
                    </div>
                )}
                <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700">
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>
            </div>
        </header>
    );
};

// All other components like Dashboard, EventList, etc., would follow here.
// Due to complexity, they are omitted but the structure is established.

export default App;
