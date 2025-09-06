import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Page, Event, Client, Expense, User } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon, AgendaIcon, CloseIcon, TrashIcon, PlusIcon, MenuIcon, SuccessIcon, ErrorIcon } from './components/Icons.tsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, AuthSession, User as SupabaseUser } from '@supabase/supabase-js';

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


// Main App Component
const App: React.FC = () => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
    const [session, setSession] = useState<AuthSession | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [alertState, setAlertState] = useState<AlertState>({ isOpen: false, message: '', type: 'success' });

    const [users, setUsers] = useState<User[]>([]); // For admin view
    const [events, setEvents] = useState<Event[]>([]); // For user view
    const [clients, setClients] = useState<Client[]>([]); // For user view

    const showAlert = (message: string, type: 'success' | 'error' = 'error') => {
        setAlertState({ isOpen: true, message, type });
    };

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
        const { data, error } = await supabase.functions.invoke('get-all-users');
        if (error) {
            console.error("Error fetching users via Edge Function:", error);
            showAlert(`Error al cargar la lista de usuarios: ${error.message}`, 'error');
            return;
        }
        const mappedUsers = (data as any[]).map(user => ({
            ...user,
            activeUntil: user.active_until,
            company_name: user.company_name,
            companyLogoUrl: user.company_logo_url
        }));
        setUsers(mappedUsers as User[]);
    }, []);

    const fetchClients = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('name', { ascending: true });
        if (error) {
            console.error("Error fetching clients:", error);
            showAlert("Error al cargar los clientes: " + error.message, 'error');
        } else {
            setClients(data as Client[] || []);
        }
    }, []);

    const fetchUserData = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('events').select('*, client:clients(*)').eq('user_id', userId).order('date', { ascending: false });
        if (error) {
          console.error("Error fetching events:", error);
          showAlert("Error al cargar los eventos: " + error.message, 'error');
        }
        else setEvents(data as Event[] || []);
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        
        const fetchData = async () => {
            setLoading(true);
            if (currentUser.role === 'admin') {
                await fetchAdminData();
            } else {
                await fetchUserData(currentUser.id);
                await fetchClients(currentUser.id);
            }
            setLoading(false);
        };

        fetchData();
    }, [currentUser, fetchAdminData, fetchUserData, fetchClients]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setCurrentPage('dashboard');
    };
    
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    
    const saveEvent = async (event: Event) => {
        const { id, expenses, name, client_id, location, date, amount_charged, observations } = event;
        const payload = { 
            name, 
            client_id, 
            location, 
            date, 
            amount_charged, 
            observations, 
            user_id: currentUser!.id, 
            expenses: (expenses || []).map(({ type, amount }) => ({ type, amount })) 
        };
        const upsertData = id ? { ...payload, id } : payload;
        
        const { data, error } = await supabase.from('events').upsert(upsertData).select().single();
        if (error) {
            showAlert("Error al guardar el evento: " + error.message, 'error');
        } else if (data) {
           showAlert("Evento guardado exitosamente.", 'success');
           await fetchUserData(currentUser!.id);
        }
    };
    
    const deleteEvent = async (eventId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            const { error } = await supabase.from('events').delete().match({ id: eventId });
            if (error) showAlert("Error al eliminar evento: " + error.message, 'error');
            else {
                showAlert("Evento eliminado exitosamente.", 'success');
                await fetchUserData(currentUser!.id);
            }
        }
    };
    
    const saveClient = async (client: Client) => {
        const { id, name, phone, email } = client;
        const payload = { name, phone, email, user_id: currentUser!.id };
        const upsertData = id ? { ...payload, id } : payload;

        const { error } = await supabase.from('clients').upsert(upsertData);
        if (error) {
            showAlert("Error al guardar el cliente: " + error.message, 'error');
        } else {
            showAlert(id ? "Cliente actualizado exitosamente." : "Cliente creado exitosamente.", 'success');
            await fetchClients(currentUser!.id);
        }
    };

    const deleteClient = async (clientId: string) => {
         if (window.confirm('¿Estás seguro de que quieres eliminar este cliente? Esto no eliminará sus eventos asociados.')) {
            const { error } = await supabase.from('clients').delete().match({ id: clientId });
            if (error) {
                showAlert("Error al eliminar el cliente: " + error.message, 'error');
            } else {
                showAlert("Cliente eliminado exitosamente.", 'success');
                await fetchClients(currentUser!.id);
            }
         }
    };

    const saveUser = async (user: User, password?: string) => {
        if (!user.id) { // New user
            if (!user.email || !password || !user.company_name || !user.activeUntil) {
                showAlert("Todos los campos son requeridos para crear un usuario.", 'error');
                return;
            }

            const { error } = await supabase.functions.invoke('create-user', {
                body: { email: user.email, password: password, companyName: user.company_name, activeUntil: user.activeUntil },
            });

            if (error) {
                showAlert("Error al crear usuario: " + error.message, 'error');
            } else {
                showAlert("Usuario creado exitosamente.", 'success');
                await fetchAdminData();
            }

        } else { // Existing user
            const updateData = { role: user.role, status: user.status, active_until: user.activeUntil, company_name: user.company_name, company_logo_url: user.companyLogoUrl };
            const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
            
            if (error) {
                showAlert("Error actualizando perfil: " + error.message, 'error');
            } else {
                await fetchAdminData();
                if (currentUser?.id === user.id) {
                    const updatedProfile = await fetchUserProfile(user.id);
                    setCurrentUser(updatedProfile);
                }
                 showAlert("Perfil actualizado exitosamente.", 'success');
            }
        }
    };

    const uploadLogo = async (userId: string, file: File) => {
        const fileExt = file.name.split('.').pop();
        const filePath = `${userId}/logo.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true });
        
        if (uploadError) {
            showAlert('Error al subir el logo: ' + uploadError.message, 'error');
            return null;
        }
        const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
        return `${data.publicUrl}?t=${new Date().getTime()}`;
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
                            currentPage={currentPage}
                            currentUser={currentUser}
                            toggleTheme={toggleTheme}
                            theme={theme}
                            onMenuClick={() => setIsSidebarOpen(true)}
                        />
                        <PageContent
                            currentPage={currentPage}
                            currentUser={currentUser}
                            events={events}
                            clients={clients}
                            saveEvent={saveEvent}
                            deleteEvent={deleteEvent}
                            saveClient={saveClient}
                            deleteClient={deleteClient}
                            users={users}
                            saveUser={saveUser}
                            uploadLogo={uploadLogo}
                        />
                    </main>
                </div>
            ) : (
                <AuthScreen showAlert={showAlert} />
            )}
            <AlertModal alertState={alertState} onClose={() => setAlertState({ ...alertState, isOpen: false })} />
        </>
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


const PageContent: React.FC<{
    currentPage: Page;
    currentUser: User;
    events: Event[];
    clients: Client[];
    saveEvent: (event: Event) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
    saveClient: (client: Client) => Promise<void>;
    deleteClient: (id: string) => Promise<void>;
    users: User[];
    saveUser: (user: User, password?: string) => Promise<void>;
    uploadLogo: (userId: string, file: File) => Promise<string | null>;
}> = (props) => {
    switch (props.currentPage) {
        case 'dashboard':
            return props.currentUser.role === 'admin' 
                ? <DashboardAdmin users={props.users} /> 
                : <DashboardUser events={props.events} />;
        case 'events':
            return <EventsPage events={props.events} clients={props.clients} saveEvent={props.saveEvent} deleteEvent={props.deleteEvent} />;
        case 'clients':
            return <ClientsPage clients={props.clients} saveClient={props.saveClient} deleteClient={props.deleteClient} />;
        case 'agenda':
            return <AgendaPage events={props.events} />;
        case 'reports':
            return <ReportsPage events={props.events} currentUser={props.currentUser} />;
        case 'settings':
             return <SettingsPage currentUser={props.currentUser} saveUser={props.saveUser} uploadLogo={props.uploadLogo} />;
        case 'userManagement':
            return <UserManagementPage users={props.users} saveUser={props.saveUser} />;
        default:
            return <div>Página no encontrada o en construcción.</div>;
    }
};

const DashboardAdmin: React.FC<{users: User[]}> = ({users}) => {
    const activeUsers = users.filter(u => u.status === 'active').length;
    const inactiveUsers = users.length - activeUsers;
    const data = [{name: 'Activos', value: activeUsers}, {name: 'Inactivos', value: inactiveUsers}];
    const COLORS = ['#3b82f6', '#ef4444'];
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                 <h3 className="text-lg font-semibold mb-4">Resumen de Usuarios</h3>
                 <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                                {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                 </div>
            </div>
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow flex flex-col justify-center items-center">
                 <h3 className="text-lg font-semibold mb-2">Total de Usuarios</h3>
                 <p className="text-5xl font-bold text-primary-600">{users.length}</p>
             </div>
        </div>
    );
};

const DashboardUser: React.FC<{events: Event[]}> = ({events}) => {
     const monthlyIncomeData = useMemo(() => {
        const data: { [key: string]: number } = {};
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);

        events.forEach(event => {
            const eventDate = new Date(event.date);
            if (eventDate >= twelveMonthsAgo) {
                const monthKey = eventDate.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
                if (!data[monthKey]) {
                    data[monthKey] = 0;
                }
                data[monthKey] += event.amount_charged;
            }
        });
        
        const sortedMonths = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthKey = date.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
            sortedMonths.unshift({
                name: monthKey,
                Ingresos: data[monthKey] || 0
            });
        }
        return sortedMonths;
    }, [events]);

    const topClientsData = useMemo(() => {
        const clientCount: { [key: string]: number } = {};
        events.forEach(event => {
            if (event.client) {
                const clientName = event.client.name;
                clientCount[clientName] = (clientCount[clientName] || 0) + 1;
            }
        });

        return Object.entries(clientCount)
            .map(([name, count]) => ({ name, Eventos: count }))
            .sort((a, b) => b.Eventos - a.Eventos)
            .slice(0, 5);
    }, [events]);

    const { totalIncome, totalExpenses, netProfit } = useMemo(() => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const monthEvents = events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
        });

        const income = monthEvents.reduce((acc, event) => acc + event.amount_charged, 0);
        const expenses = monthEvents.reduce((acc, event) => acc + (event.expenses?.reduce((expAcc, exp) => expAcc + exp.amount, 0) || 0), 0);
        return { totalIncome: income, totalExpenses: expenses, netProfit: income - expenses };
    }, [events]);


    return (
        <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Ingresos (Mes Actual)</h3>
                    <p className="text-3xl font-bold text-green-500">{formatGuarani(totalIncome)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Gastos (Mes Actual)</h3>
                    <p className="text-3xl font-bold text-red-500">{formatGuarani(totalExpenses)}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Ganancia Neta (Mes Actual)</h3>
                    <p className="text-3xl font-bold text-blue-500">{formatGuarani(netProfit)}</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4">Tendencia de Ingresos (Últimos 12 Meses)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={monthlyIncomeData}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(value) => `${value/1000}k`} />
                            <Tooltip formatter={(value: number) => formatGuarani(value)} />
                            <Legend />
                            <Line type="monotone" dataKey="Ingresos" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4">Top 5 Clientes</h3>
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topClientsData} layout="vertical">
                           <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                           <XAxis type="number" />
                           <YAxis type="category" dataKey="name" width={80} />
                           <Tooltip formatter={(value: number) => [`${value} eventos`, 'Total']} />
                           <Legend />
                           <Bar dataKey="Eventos" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const UserManagementPage: React.FC<{
    users: User[], 
    saveUser: (user: User, password?: string) => Promise<void>
}> = ({ users, saveUser }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const handleOpenModal = (user: User | null) => {
        const userToEdit: User = user ? { ...user } : { id: '', email: '', role: 'user', status: 'active', activeUntil: '', company_name: '' };
        setSelectedUser(userToEdit);
        setIsModalOpen(true);
    };
    
    const handleSave = async (user: User, password?: string) => {
        await saveUser(user, password);
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold">Lista de Usuarios</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 w-full md:w-auto">Crear Nuevo Usuario</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-2">Email</th>
                            <th className="p-2">Empresa</th>
                            <th className="p-2">Estado</th>
                            <th className="p-2">Activo Hasta</th>
                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b dark:border-gray-700">
                                <td className="p-2 truncate" title={user.email}>{user.email}</td>
                                <td className="p-2">{user.company_name}</td>
                                <td className="p-2">
                                    <span className={`px-2 py-1 rounded-full text-xs ${user.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}`}>
                                        {user.status === 'active' ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="p-2">{user.activeUntil ? new Date(user.activeUntil).toLocaleDateString() : 'N/A'}</td>
                                <td className="p-2">
                                    <button onClick={() => handleOpenModal(user)} className="text-primary-600 hover:underline">Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <UserFormModal user={selectedUser} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const UserFormModal: React.FC<{
    user: User | null, 
    onSave: (user: User, password?: string) => void, 
    onClose: () => void 
}> = ({ user, onSave, onClose }) => {
    const [formData, setFormData] = useState<User>(user || { id: '', email: '', role: 'user', status: 'active', activeUntil: '', company_name: '' });
    const [password, setPassword] = useState('');
    const isNewUser = !user || !user.id;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, password);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6">{isNewUser ? 'Crear Nuevo Usuario' : 'Editar Usuario'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block mb-2">Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!isNewUser} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50" required />
                    </div>
                     <div className="mb-4">
                        <label className="block mb-2">Nombre de Empresa</label>
                        <input type="text" name="company_name" value={formData.company_name} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    {isNewUser && (
                        <div className="mb-4">
                            <label className="block mb-2">Contraseña</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block mb-2">Estado</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                            </select>
                        </div>
                        <div>
                             <label className="block mb-2">Activo Hasta</label>
                             <input type="date" name="activeUntil" value={formData.activeUntil?.split('T')[0] || ''} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4 mt-8">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const EventsPage: React.FC<{
    events: Event[],
    clients: Client[],
    saveEvent: (event: Event) => Promise<void>, 
    deleteEvent: (id: string) => Promise<void>
}> = ({ events, clients, saveEvent, deleteEvent }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    const handleOpenModal = (event: Event | null) => {
        setSelectedEvent(event);
        setIsModalOpen(true);
    };

    const handleSave = async (event: Event) => {
        await saveEvent(event);
        setIsModalOpen(false);
    }
    
    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold">Mis Eventos</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 w-full md:w-auto">Añadir Evento</button>
            </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-2">Fecha</th>
                            <th className="p-2">Evento</th>
                            <th className="p-2 hidden sm:table-cell">Cliente</th>
                            <th className="p-2">Monto</th>
                            <th className="p-2 hidden sm:table-cell">Ganancia</th>
                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.length === 0 && <tr><td colSpan={6} className="text-center p-4 text-gray-500">No has registrado ningún evento.</td></tr>}
                        {events.map(event => {
                            const eventExpenses = event.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
                            const netProfit = event.amount_charged - eventExpenses;
                            return (
                                <tr key={event.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="p-2">{new Date(event.date).toLocaleDateString()}</td>
                                    <td className="p-2 font-medium">{event.name}</td>
                                    <td className="p-2 hidden sm:table-cell">{event.client?.name || 'N/A'}</td>
                                    <td className="p-2 text-green-600 dark:text-green-400">{formatGuarani(event.amount_charged)}</td>
                                    <td className={`p-2 font-semibold hidden sm:table-cell ${netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>{formatGuarani(netProfit)}</td>
                                    <td className="p-2 flex space-x-2">
                                        <button onClick={() => handleOpenModal(event)} className="text-primary-600 hover:underline">Editar</button>
                                        <button onClick={() => deleteEvent(event.id)} className="text-red-500 hover:underline">Eliminar</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <EventFormModal event={selectedEvent} clients={clients} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const EventFormModal: React.FC<{
    event: Event | null,
    clients: Client[],
    onSave: (event: Event) => void,
    onClose: () => void
}> = ({ event, clients, onSave, onClose }) => {
    const isNewEvent = !event;
    const initialEventState: Event = useMemo(() => ({
        id: event?.id || '',
        user_id: event?.user_id || '',
        name: event?.name || '',
        client_id: event?.client_id || (clients.length > 0 ? clients[0].id : null),
        client: event?.client || null,
        location: event?.location || '',
        date: event?.date ? new Date(event.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        amount_charged: event?.amount_charged || 0,
        expenses: (event?.expenses || []).map((exp, index) => ({
            ...exp,
            id: (exp as any).id || `temp-${Date.now()}-${index}`,
        })),
        observations: event?.observations || '',
    }), [event, clients]);

    const [formData, setFormData] = useState<Event>(initialEventState);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleExpenseChange = (index: number, field: 'type' | 'amount', value: string) => {
        const newExpenses = [...formData.expenses];
        const currentExpense = newExpenses[index];
        if (field === 'amount') {
             newExpenses[index] = { ...currentExpense, amount: Number(value) };
        } else {
             newExpenses[index] = { ...currentExpense, type: value };
        }
        setFormData(prev => ({ ...prev, expenses: newExpenses }));
    };

    const addExpense = () => {
        setFormData(prev => ({ ...prev, expenses: [...prev.expenses, { id: `temp-${Date.now()}`, type: '', amount: 0 }] }));
    };

    const removeExpense = (id: string) => {
        setFormData(prev => ({ ...prev, expenses: prev.expenses.filter(exp => exp.id !== id) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };
    
    const totalExpenses = formData.expenses.reduce((sum, exp) => sum + exp.amount, 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start z-50 p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-lg shadow-xl w-full max-w-2xl my-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{isNewEvent ? 'Añadir Nuevo Evento' : 'Editar Evento'}</h2>
                    <button onClick={onClose}><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="name" placeholder="Nombre del Evento" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="text" name="location" placeholder="Lugar" value={formData.location} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="number" name="amount_charged" placeholder="Monto Cobrado" value={formData.amount_charged} onChange={e => setFormData(prev => ({...prev, amount_charged: Number(e.target.value)}))} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                     <div className="border-t pt-4 mt-4 dark:border-gray-700">
                        <label htmlFor="client_id" className="font-semibold mb-2 block">Cliente</label>
                        <select
                            id="client_id"
                            name="client_id"
                            value={formData.client_id || ''}
                            onChange={handleChange}
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            required
                        >
                            <option value="" disabled>Selecciona un cliente</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                        {clients.length === 0 && <p className="text-sm text-yellow-500 mt-2">No hay clientes registrados. Por favor, añade un cliente en la sección 'Clientes' primero.</p>}
                    </div>
                    <div className="border-t pt-4 mt-4 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="font-semibold">Gastos</h3>
                             <button type="button" onClick={addExpense} className="flex items-center space-x-1 text-sm bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700"><PlusIcon /> <span>Añadir Gasto</span></button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                            {formData.expenses.map((expense, index) => (
                                <div key={expense.id} className="flex items-center gap-2">
                                    <input type="text" placeholder="Tipo de Gasto" value={expense.type} onChange={e => handleExpenseChange(index, 'type', e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    <input type="number" placeholder="Monto" value={expense.amount} onChange={e => handleExpenseChange(index, 'amount', e.target.value)} className="w-48 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                    <button type="button" onClick={() => removeExpense(expense.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon /></button>
                                </div>
                            ))}
                        </div>
                         <div className="text-right mt-2 font-semibold">Total Gastos: {formatGuarani(totalExpenses)}</div>
                    </div>
                    <div className="border-t pt-4 mt-4 dark:border-gray-700">
                        <textarea name="observations" placeholder="Observaciones..." value={formData.observations} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" rows={3}></textarea>
                        <div className="text-right mt-2 text-lg font-bold">Ganancia Neta del Evento: {formatGuarani(formData.amount_charged - totalExpenses)}</div>
                    </div>
                    <div className="flex justify-end space-x-4 mt-8">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700">Guardar Evento</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const ClientsPage: React.FC<{ 
    clients: Client[],
    saveClient: (client: Client) => Promise<void>,
    deleteClient: (id: string) => Promise<void>
}> = ({ clients, saveClient, deleteClient }) => {
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
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold">Mis Clientes</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 w-full md:w-auto">Añadir Cliente</button>
            </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-2">Nombre</th>
                            <th className="p-2 hidden sm:table-cell">Teléfono</th>
                            <th className="p-2 hidden md:table-cell">Email</th>
                            <th className="p-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.length === 0 && <tr><td colSpan={4} className="text-center p-4 text-gray-500">No tienes clientes registrados.</td></tr>}
                        {clients.map((client) => (
                            <tr key={client.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-2 font-medium">{client.name}</td>
                                <td className="p-2 hidden sm:table-cell">{client.phone}</td>
                                <td className="p-2 hidden md:table-cell">{client.email || 'N/A'}</td>
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

const ClientFormModal: React.FC<{
    client: Client | null,
    onSave: (client: Client) => void,
    onClose: () => void,
}> = ({ client, onSave, onClose }) => {
    const isNewClient = !client;
    const initialClientState = useMemo(() => ({
        id: client?.id || '',
        user_id: client?.user_id || '',
        name: client?.name || '',
        phone: client?.phone || '',
        email: client?.email || '',
    }), [client]);

    const [formData, setFormData] = useState<Client>(initialClientState);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{isNewClient ? 'Añadir Nuevo Cliente' : 'Editar Cliente'}</h2>
                    <button onClick={onClose}><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="name" placeholder="Nombre Completo" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <input type="tel" name="phone" placeholder="Número de Teléfono" value={formData.phone} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    <input type="email" name="email" placeholder="Email (Opcional)" value={formData.email} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700">Guardar Cliente</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const ReportsPage: React.FC<{ events: Event[], currentUser: User }> = ({ events, currentUser }) => {
    const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const filteredEvents = useMemo(() => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return events.filter(event => {
            const eventDate = new Date(event.date);
            return eventDate >= start && eventDate <= end;
        });
    }, [events, startDate, endDate]);

    const { totalIncome, totalExpenses, netProfit } = useMemo(() => {
        let totalIncome = 0;
        let totalExpenses = 0;
        filteredEvents.forEach(event => {
            totalIncome += event.amount_charged;
            totalExpenses += event.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
        });
        return { totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
    }, [filteredEvents]);
    
    const exportToPDF = () => {
        const doc = new jsPDF();
        const tableColumn = ["Fecha", "Evento", "Cliente", "Cobrado", "Gastos", "Ganancia"];
        const tableRows: any[][] = [];

        filteredEvents.forEach(event => {
            const eventExpenses = event.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
            const eventProfit = event.amount_charged - eventExpenses;
            const eventData = [ new Date(event.date).toLocaleDateString(), event.name, event.client?.name || 'N/A', formatGuarani(event.amount_charged), formatGuarani(eventExpenses), formatGuarani(eventProfit) ];
            tableRows.push(eventData);
        });

        doc.setFontSize(18);
        doc.text(currentUser.company_name, 14, 22);
        doc.setFontSize(12);
        doc.text(`Reporte de Eventos del ${new Date(startDate).toLocaleDateString()} al ${new Date(endDate).toLocaleDateString()}`, 14, 30);

        autoTable(doc, {
            head: [tableColumn], body: tableRows, startY: 40, theme: 'grid',
            foot: [['TOTALES', '', '', formatGuarani(totalIncome), formatGuarani(totalExpenses), formatGuarani(netProfit)]],
            footStyles: { fillColor: [22, 160, 133], textColor: 255, fontStyle: 'bold' }
        });
        doc.save(`Reporte_GestionSystemDj_${startDate}_${endDate}.pdf`);
    };
    
    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Fecha,Evento,Cliente,Telefono Cliente,Email Cliente,Lugar,Monto Cobrado,Gastos,Ganancia,Observaciones\n";

        filteredEvents.forEach(event => {
             const eventExpenses = event.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
             const eventProfit = event.amount_charged - eventExpenses;
             const row = [ new Date(event.date).toLocaleDateString(), `"${event.name.replace(/"/g, '""')}"`, `"${(event.client?.name || '').replace(/"/g, '""')}"`, event.client?.phone || '', event.client?.email || '', `"${event.location.replace(/"/g, '""')}"`, event.amount_charged, eventExpenses, eventProfit, `"${(event.observations || '').replace(/"/g, '""')}"` ].join(',');
            csvContent += row + "\r\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Reporte_GestionSystemDj_${startDate}_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex flex-col md:flex-row items-center gap-4">
                     <h3 className="text-lg font-semibold whitespace-nowrap">Filtrar por Fecha:</h3>
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 w-full md:w-auto" />
                     <span className="hidden md:inline">hasta</span>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 w-full md:w-auto" />
                     <div className="flex-grow"></div>
                     <div className="flex gap-2 w-full md:w-auto">
                        <button onClick={exportToPDF} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">PDF</button>
                        <button onClick={exportToCSV} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">CSV/Excel</button>
                     </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow"> <h3 className="text-lg font-semibold">Ingresos</h3> <p className="text-3xl font-bold text-green-500">{formatGuarani(totalIncome)}</p> </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow"> <h3 className="text-lg font-semibold">Gastos</h3> <p className="text-3xl font-bold text-red-500">{formatGuarani(totalExpenses)}</p> </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow"> <h3 className="text-lg font-semibold">Ganancia Neta</h3> <p className="text-3xl font-bold text-blue-500">{formatGuarani(netProfit)}</p> </div>
            </div>
            
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Eventos del Período</h3>
                <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead className="border-b dark:border-gray-700">
                             <tr>
                                <th className="p-2">Fecha</th>
                                <th className="p-2">Evento</th>
                                <th className="p-2 hidden sm:table-cell">Cliente</th>
                                <th className="p-2">Cobrado</th>
                                <th className="p-2 hidden sm:table-cell">Ganancia</th>
                            </tr>
                        </thead>
                        <tbody>
                             {filteredEvents.length === 0 && <tr><td colSpan={5} className="text-center p-4 text-gray-500">No hay eventos en el rango de fechas seleccionado.</td></tr>}
                            {filteredEvents.map(event => {
                                const eventExpenses = event.expenses?.reduce((sum, exp) => sum + exp.amount, 0) || 0;
                                const netProfit = event.amount_charged - eventExpenses;
                                return (
                                    <tr key={event.id} className="border-b dark:border-gray-700">
                                        <td className="p-2">{new Date(event.date).toLocaleDateString()}</td>
                                        <td className="p-2 font-medium">{event.name}</td>
                                        <td className="p-2 hidden sm:table-cell">{event.client?.name || 'N/A'}</td>
                                        <td className="p-2 text-green-600 dark:text-green-400">{formatGuarani(event.amount_charged)}</td>
                                        <td className={`p-2 font-semibold hidden sm:table-cell ${netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>{formatGuarani(netProfit)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


const AgendaPage: React.FC<{ events: Event[] }> = ({ events }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const eventsByDate = useMemo(() => {
        const map = new Map<string, Event[]>();
        events.forEach(event => {
            const dateStr = new Date(event.date).toISOString().split('T')[0];
            if (!map.has(dateStr)) {
                map.set(dateStr, []);
            }
            map.get(dateStr)!.push(event);
        });
        return map;
    }, [events]);

    const handleDayClick = (dateStr: string) => {
        if (eventsByDate.has(dateStr)) {
            setSelectedDate(dateStr);
        }
    };

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();
    
    const calendarDays = [];
    for (let i = 0; i < startDay; i++) {
        calendarDays.push(<div key={`empty-${i}`} className="border-t border-r dark:border-gray-700 h-16 sm:h-24"></div>);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), day));
        const dateStr = dayDate.toISOString().split('T')[0];
        const isEventDay = eventsByDate.has(dateStr);
        calendarDays.push(
            <div 
                key={day} 
                className={`border-t border-r dark:border-gray-700 p-1 sm:p-2 text-center h-16 sm:h-24 flex flex-col items-center justify-start ${isEventDay ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50' : ''}`}
                onClick={() => handleDayClick(dateStr)}
            >
                <span className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-sm ${isEventDay ? 'bg-primary-500 text-white font-bold' : ''}`}>
                    {day}
                </span>
            </div>
        );
    }

    const changeMonth = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const selectedDateEvents = selectedDate ? eventsByDate.get(selectedDate) : [];

    return (
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => changeMonth(-1)} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">&lt; Ant</button>
                <h3 className="text-lg md:text-xl font-semibold text-center">
                    {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                </h3>
                <button onClick={() => changeMonth(1)} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Sig &gt;</button>
            </div>
             <div className="grid grid-cols-7 border-l border-b dark:border-gray-700">
                 {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(day => (
                    <div key={day} className="text-center font-bold p-2 bg-gray-100 dark:bg-gray-700 border-t border-r dark:border-gray-700 text-xs sm:text-base">{day}</div>
                 ))}
                 {calendarDays}
            </div>

            {selectedDate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Eventos para el {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'long'})}</h3>
                            <button onClick={() => setSelectedDate(null)}><CloseIcon /></button>
                        </div>
                        <ul className="space-y-3 max-h-80 overflow-y-auto">
                            {selectedDateEvents?.map(event => (
                                <li key={event.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                    <p className="font-bold text-primary-600 dark:text-primary-400">{event.name}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Cliente: {event.client?.name || 'N/A'}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Lugar: {event.location}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};


const SettingsPage: React.FC<{
    currentUser: User, 
    saveUser: (user: User) => Promise<void>,
    uploadLogo: (userId: string, file: File) => Promise<string | null>;
}> = ({ currentUser, saveUser, uploadLogo }) => {
    const [user, setUser] = useState(currentUser);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => { setUser(currentUser); }, [currentUser]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) setLogoFile(e.target.files[0]);
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let updatedUser = { ...user };
        if (logoFile) {
            setIsUploading(true);
            const newLogoUrl = await uploadLogo(user.id, logoFile);
            if (newLogoUrl) updatedUser.companyLogoUrl = newLogoUrl;
            setIsUploading(false);
        }
        await saveUser(updatedUser);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-4">Configuración de la Empresa</h3>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block mb-2">Nombre de la Empresa</label>
                    <input type="text" value={user.company_name} onChange={e => setUser({...user, company_name: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                </div>
                 <div className="mb-4">
                    <label className="block mb-2">Logo de la Empresa</label>
                    <div className="flex items-center space-x-4">
                        {user.companyLogoUrl && <img src={user.companyLogoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover" />}
                        <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/50 dark:file:text-primary-300 dark:hover:file:bg-primary-900" />
                    </div>
                </div>
                <button type="submit" disabled={isUploading} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                    {isUploading ? 'Subiendo...' : 'Guardar Cambios'}
                </button>
            </form>
        </div>
    )
}

const Sidebar: React.FC<{ 
    currentPage: Page, 
    setCurrentPage: (page: Page) => void, 
    currentUser: User, 
    handleLogout: () => void,
    isOpen: boolean,
    setIsOpen: (isOpen: boolean) => void
}> = ({ currentPage, setCurrentPage, currentUser, handleLogout, isOpen, setIsOpen }) => {
    const commonItems = [{ page: 'dashboard' as Page, label: 'Dashboard', icon: <DashboardIcon /> }];
    const userItems = [
        { page: 'events' as Page, label: 'Ver Eventos', icon: <EventsIcon /> },
        { page: 'clients' as Page, label: 'Clientes', icon: <ClientsIcon /> },
        { page: 'agenda' as Page, label: 'Agenda', icon: <AgendaIcon /> },
        { page: 'reports' as Page, label: 'Reportes', icon: <ReportsIcon /> },
        { page: 'settings' as Page, label: 'Configuración', icon: <SettingsIcon /> },
    ];
    const adminItems = [{ page: 'userManagement' as Page, label: 'Gestionar Usuarios', icon: <UserManagementIcon /> }];
    const navItems = currentUser.role === 'admin' ? [...commonItems, ...adminItems] : [...commonItems, ...userItems];
    
    return (
        <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-gray-800 shadow-md flex flex-col transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0`}>
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-primary-600">GestionSystemDj</h1>
                 <button onClick={() => setIsOpen(false)} className="md:hidden p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">
                    <CloseIcon />
                </button>
            </div>
            <nav className="flex-1 p-2">
                {navItems.map(item => (
                    <button key={item.page} onClick={() => { setCurrentPage(item.page); setIsOpen(false); }} className={`w-full flex items-center p-3 my-1 rounded-lg transition-colors ${currentPage === item.page ? 'bg-primary-100 dark:bg-slate-700 text-primary-600 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
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

const Header: React.FC<{ 
    currentPage: Page, 
    currentUser: User, 
    toggleTheme: () => void, 
    theme: 'light' | 'dark',
    onMenuClick: () => void
}> = ({ currentPage, currentUser, toggleTheme, theme, onMenuClick }) => {
    const pageTitles: { [key in Page]: string } = {
        dashboard: 'Dashboard', events: 'Eventos', clients: 'Clientes', agenda: 'Agenda',
        reports: 'Reportes', settings: 'Configuración', userManagement: 'Gestión de Usuarios'
    };

    const daysUntilExpiry = useMemo(() => {
        if (!currentUser.activeUntil) return Infinity;
        const expiryDate = new Date(currentUser.activeUntil);
        const now = new Date();
        return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }, [currentUser.activeUntil]);

    return (
        <header className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                <button onClick={onMenuClick} className="md:hidden p-1 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">
                    <MenuIcon />
                </button>
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">{pageTitles[currentPage]}</h2>
                    <p className="text-sm md:text-md text-gray-500 dark:text-gray-400">Bienvenido, {currentUser.company_name}</p>
                </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
                {currentUser.role === 'user' && daysUntilExpiry <= 10 && (
                    <div className="hidden sm:block bg-yellow-100 dark:bg-yellow-900 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-300 p-2 rounded-md text-sm">
                        <p>Tu licencia vence en {daysUntilExpiry} días.</p>
                    </div>
                )}
                <button onClick={toggleTheme} className="p-2 rounded-full bg-gray-200 dark:bg-gray-700">
                    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </button>
            </div>
        </header>
    );
};

export default App;
