

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Page, Event, Client, Expense, User } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon, AgendaIcon, CloseIcon, TrashIcon, PlusIcon } from './components/Icons.tsx';
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


// --- HELPERS ---
const formatGuarani = (amount: number) => 
    new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(amount);

// --- AUTH SCREEN COMPONENT ---
const AuthScreen: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
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
        const { data: { user } } = await supabase.auth.getUser();
        
        // Map snake_case from DB to camelCase for the app
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


    const fetchAdminData = useCallback(async () => {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) {
            console.error("Error fetching users:", error);
            return;
        }
        
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) {
            console.error("Error fetching auth users:", authError);
            // FIX: Added return to prevent execution when there is an authError.
            // This prevents a TypeScript error where `authUsers.users` would be `never[]`.
            return;
        }
        
        const profiles = data || [];
        
        // FIX: Map snake_case `active_until` from the database to camelCase `activeUntil` for the app state.
        // This solves the "Invalid Date" and "Cannot read properties of undefined (reading 'split')" errors.
        const mappedUsers = profiles.map((profile: any) => {
            const authUser = authUsers?.users.find(u => u.id === profile.id);
            return {
                ...profile,
                activeUntil: profile.active_until, // MAPPING a camelCase
                email: authUser?.email || profile.email,
            };
        });
        
        setUsers(mappedUsers as User[]);

    }, []);

    const fetchUserData = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('events').select('*').eq('user_id', userId).order('date', { ascending: false });
        if (error) console.error("Error fetching events:", error);
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
            }
            setLoading(false);
        };

        fetchData();
    }, [currentUser, fetchAdminData, fetchUserData]);


    const handleLogout = async () => {
        await supabase.auth.signOut();
        setCurrentPage('dashboard');
    };
    
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    
    const saveEvent = async (event: Event) => {
        const { id, expenses, ...rest } = event;

        const payload = {
            ...rest,
            user_id: currentUser!.id,
            expenses: (expenses || []).map(({ type, amount }) => ({ type, amount })),
        };
        
        const upsertData = id ? { ...payload, id } : payload;
        
        const { data, error } = await supabase.from('events').upsert(upsertData).select().single();
        if (error) {
            alert("Error al guardar el evento: " + error.message);
        } else if (data) {
           await fetchUserData(currentUser!.id);
        }
    };
    
    const deleteEvent = async (eventId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este evento?')) {
            const { error } = await supabase.from('events').delete().match({ id: eventId });
            if (error) alert("Error al eliminar evento: " + error.message);
            else await fetchUserData(currentUser!.id);
        }
    };

    const saveUser = async (user: User, password?: string) => {
        if (!user.id) { // New user
            if (!user.email || !password || !user.company_name || !user.activeUntil) {
                alert("Todos los campos son requeridos para crear un usuario.");
                return;
            }

            const { error } = await supabase.functions.invoke('create-user', {
                // The edge function expects camelCase
                body: { 
                    email: user.email, 
                    password: password,
                    companyName: user.company_name,
                    activeUntil: user.activeUntil
                },
            });

            if (error) {
                alert("Error al crear usuario: " + error.message);
            } else {
                alert("Usuario creado exitosamente.");
                await fetchAdminData();
            }

        } else { // Existing user
            // Prepare data for DB (snake_case)
            const updateData = {
                role: user.role,
                status: user.status,
                active_until: user.activeUntil,
                company_name: user.company_name,
                company_logo_url: user.companyLogoUrl,
            };

            const { error } = await supabase.from('profiles').update(updateData).eq('id', user.id);
            
            if (error) {
                alert("Error actualizando perfil: " + error.message);
            } else {
                await fetchAdminData();
                if (currentUser?.id === user.id) {
                    const updatedProfile = await fetchUserProfile(user.id);
                    setCurrentUser(updatedProfile);
                }
                 alert("Perfil actualizado exitosamente.");
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
    
    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">Cargando...</div>;
    }

    if (!session || !currentUser) {
        return <AuthScreen />;
    }
    
    return (
      <div className="flex h-screen bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-gray-100">
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
             <PageContent
                currentPage={currentPage}
                currentUser={currentUser}
                events={events}
                saveEvent={saveEvent}
                deleteEvent={deleteEvent}
                users={users}
                saveUser={saveUser}
                uploadLogo={uploadLogo}
            />
        </main>
      </div>
    );
};

const PageContent: React.FC<{
    currentPage: Page;
    currentUser: User;
    events: Event[];
    saveEvent: (event: Event) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
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
            return <EventsPage events={props.events} saveEvent={props.saveEvent} deleteEvent={props.deleteEvent} />;
        case 'clients':
            return <ClientsPage events={props.events} />;
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
            const clientName = event.client.name;
            clientCount[clientName] = (clientCount[clientName] || 0) + 1;
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Lista de Usuarios</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Crear Nuevo Usuario</button>
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
                                <td className="p-2">{user.email}</td>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
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
    saveEvent: (event: Event) => Promise<void>, 
    deleteEvent: (id: string) => Promise<void>
}> = ({ events, saveEvent, deleteEvent }) => {
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Mis Eventos</h3>
                <button onClick={() => handleOpenModal(null)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700">Añadir Evento</button>
            </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-2">Fecha</th>
                            <th className="p-2">Evento</th>
                            <th className="p-2">Cliente</th>
                            <th className="p-2">Monto</th>
                            <th className="p-2">Ganancia</th>
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
                                    <td className="p-2">{event.client.name}</td>
                                    <td className="p-2 text-green-600 dark:text-green-400">{formatGuarani(event.amount_charged)}</td>
                                    <td className={`p-2 font-semibold ${netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>{formatGuarani(netProfit)}</td>
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
            {isModalOpen && <EventFormModal event={selectedEvent} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const EventFormModal: React.FC<{
    event: Event | null,
    onSave: (event: Event) => void,
    onClose: () => void
}> = ({ event, onSave, onClose }) => {
    const isNewEvent = !event;
    const initialEventState: Event = useMemo(() => ({
        id: event?.id || '',
        user_id: event?.user_id || '',
        name: event?.name || '',
        client: event?.client || { name: '', phone: '', email: '' },
        location: event?.location || '',
        date: event?.date ? new Date(event.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        amount_charged: event?.amount_charged || 0,
        expenses: (event?.expenses || []).map((exp, index) => ({
            ...exp,
            id: (exp as any).id || `temp-${Date.now()}-${index}`,
        })),
        observations: event?.observations || '',
    }), [event]);

    const [formData, setFormData] = useState<Event>(initialEventState);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleClientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, client: { ...prev.client, [name]: value } }));
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
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-2xl my-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{isNewEvent ? 'Añadir Nuevo Evento' : 'Editar Evento'}</h2>
                    <button onClick={onClose}><CloseIcon /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Event Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="name" placeholder="Nombre del Evento" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="text" name="location" placeholder="Lugar" value={formData.location} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                        <input type="number" name="amount_charged" placeholder="Monto Cobrado" value={formData.amount_charged} onChange={e => setFormData(prev => ({...prev, amount_charged: Number(e.target.value)}))} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    {/* Client Details */}
                    <div className="border-t pt-4 mt-4 dark:border-gray-700">
                        <h3 className="font-semibold mb-2">Datos del Cliente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="text" name="name" placeholder="Nombre del Cliente" value={formData.client.name} onChange={handleClientChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                            <input type="tel" name="phone" placeholder="Teléfono" value={formData.client.phone} onChange={handleClientChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
                            <input type="email" name="email" placeholder="Email (Opcional)" value={formData.client.email} onChange={handleClientChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                    </div>
                    {/* Expenses */}
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
                     {/* Observations & Summary */}
                    <div className="border-t pt-4 mt-4 dark:border-gray-700">
                        <textarea name="observations" placeholder="Observaciones..." value={formData.observations} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" rows={3}></textarea>
                        <div className="text-right mt-2 text-lg font-bold">Ganancia Neta del Evento: {formatGuarani(formData.amount_charged - totalExpenses)}</div>
                    </div>
                    {/* Actions */}
                    <div className="flex justify-end space-x-4 mt-8">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
                        <button type="submit" className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700">Guardar Evento</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const ClientsPage: React.FC<{ events: Event[] }> = ({ events }) => {
    const clients = useMemo(() => {
        const clientMap = new Map<string, { client: Client; eventCount: number }>();
        events.forEach(event => {
            const key = `${event.client.name}-${event.client.phone}`;
            if (clientMap.has(key)) {
                clientMap.get(key)!.eventCount++;
            } else {
                clientMap.set(key, { client: event.client, eventCount: 1 });
            }
        });
        return Array.from(clientMap.values()).sort((a,b) => b.eventCount - a.eventCount);
    }, [events]);

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold mb-4">Mis Clientes</h3>
            <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="border-b dark:border-gray-700">
                        <tr>
                            <th className="p-2">Nombre</th>
                            <th className="p-2">Teléfono</th>
                            <th className="p-2">Email</th>
                            <th className="p-2 text-center">N° de Eventos</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.length === 0 && <tr><td colSpan={4} className="text-center p-4 text-gray-500">No tienes clientes registrados en tus eventos.</td></tr>}
                        {clients.map(({ client, eventCount }) => (
                            <tr key={`${client.name}-${client.phone}`} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-2 font-medium">{client.name}</td>
                                <td className="p-2">{client.phone}</td>
                                <td className="p-2">{client.email || 'N/A'}</td>
                                <td className="p-2 text-center font-bold text-primary-600">{eventCount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
        end.setHours(23, 59, 59, 999); // Include whole end day
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
            const eventData = [
                new Date(event.date).toLocaleDateString(),
                event.name,
                event.client.name,
                formatGuarani(event.amount_charged),
                formatGuarani(eventExpenses),
                formatGuarani(eventProfit)
            ];
            tableRows.push(eventData);
        });

        const logoUrl = currentUser.companyLogoUrl;
        if (logoUrl) {
           // This requires CORS configuration on storage, might not work out of the box
           // doc.addImage(logoUrl, 'PNG', 14, 10, 30, 30);
        }
        doc.setFontSize(18);
        doc.text(currentUser.company_name, logoUrl ? 50 : 14, 22);
        doc.setFontSize(12);
        doc.text(`Reporte de Eventos del ${new Date(startDate).toLocaleDateString()} al ${new Date(endDate).toLocaleDateString()}`, 14, 30);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            foot: [[
                'TOTALES', '', '', 
                formatGuarani(totalIncome), 
                formatGuarani(totalExpenses), 
                formatGuarani(netProfit)
            ]],
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
             const row = [
                 new Date(event.date).toLocaleDateString(),
                 `"${event.name.replace(/"/g, '""')}"`,
                 `"${event.client.name.replace(/"/g, '""')}"`,
                 event.client.phone,
                 event.client.email || '',
                 `"${event.location.replace(/"/g, '""')}"`,
                 event.amount_charged,
                 eventExpenses,
                 eventProfit,
                 `"${(event.observations || '').replace(/"/g, '""')}"`
             ].join(',');
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
                <div className="flex flex-wrap items-center gap-4">
                     <h3 className="text-lg font-semibold">Filtrar por Fecha:</h3>
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <span>hasta</span>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                     <div className="flex-grow"></div>
                     <div className="flex gap-2">
                        <button onClick={exportToPDF} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">Exportar PDF</button>
                        <button onClick={exportToCSV} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">Exportar CSV/Excel</button>
                     </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Ingresos</h3>
                    <p className="text-3xl font-bold text-green-500">{formatGuarani(totalIncome)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Gastos</h3>
                    <p className="text-3xl font-bold text-red-500">{formatGuarani(totalExpenses)}</p>
                </div>
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">Ganancia Neta</h3>
                    <p className="text-3xl font-bold text-blue-500">{formatGuarani(netProfit)}</p>
                </div>
            </div>
            
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4">Eventos del Período</h3>
                <div className="overflow-x-auto">
                     {/* Re-using the same table structure from EventsPage */}
                     <table className="w-full text-left">
                        <thead className="border-b dark:border-gray-700">
                             <tr>
                                <th className="p-2">Fecha</th>
                                <th className="p-2">Evento</th>
                                <th className="p-2">Cliente</th>
                                <th className="p-2">Cobrado</th>
                                <th className="p-2">Ganancia</th>
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
                                        <td className="p-2">{event.client.name}</td>
                                        <td className="p-2 text-green-600 dark:text-green-400">{formatGuarani(event.amount_charged)}</td>
                                        <td className={`p-2 font-semibold ${netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>{formatGuarani(netProfit)}</td>
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
        calendarDays.push(<div key={`empty-${i}`} className="border-t border-r dark:border-gray-700"></div>);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), day));
        const dateStr = dayDate.toISOString().split('T')[0];
        const isEventDay = eventsByDate.has(dateStr);
        calendarDays.push(
            <div 
                key={day} 
                className={`border-t border-r dark:border-gray-700 p-2 text-center h-24 flex flex-col items-center ${isEventDay ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50' : ''}`}
                onClick={() => handleDayClick(dateStr)}
            >
                <span className={`w-8 h-8 flex items-center justify-center rounded-full ${isEventDay ? 'bg-primary-500 text-white font-bold' : ''}`}>
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => changeMonth(-1)} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">&lt; Anterior</button>
                <h3 className="text-xl font-semibold">
                    {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                </h3>
                <button onClick={() => changeMonth(1)} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Siguiente &gt;</button>
            </div>
             <div className="grid grid-cols-7 border-l border-b dark:border-gray-700">
                 {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(day => (
                    <div key={day} className="text-center font-bold p-2 bg-gray-100 dark:bg-gray-700 border-t border-r dark:border-gray-700">{day}</div>
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
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Cliente: {event.client.name}</p>
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

    useEffect(() => {
        setUser(currentUser);
    }, [currentUser]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setLogoFile(e.target.files[0]);
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let updatedUser = { ...user };

        if (logoFile) {
            setIsUploading(true);
            const newLogoUrl = await uploadLogo(user.id, logoFile);
            if (newLogoUrl) {
                updatedUser.companyLogoUrl = newLogoUrl;
            }
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

const Sidebar: React.FC<{ currentPage: Page, setCurrentPage: (page: Page) => void, currentUser: User, handleLogout: () => void }> = ({ currentPage, setCurrentPage, currentUser, handleLogout }) => {
    const commonItems = [
        { page: 'dashboard' as Page, label: 'Dashboard', icon: <DashboardIcon /> },
    ];
    
    const userItems = [
        { page: 'events' as Page, label: 'Ver Eventos', icon: <EventsIcon /> },
        { page: 'clients' as Page, label: 'Clientes', icon: <ClientsIcon /> },
        { page: 'agenda' as Page, label: 'Agenda', icon: <AgendaIcon /> },
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
            </div>
            <nav className="flex-1 p-2">
                {navItems.map(item => (
                    <button key={item.page} onClick={() => setCurrentPage(item.page)} className={`w-full flex items-center p-3 my-1 rounded-lg transition-colors ${currentPage === item.page ? 'bg-primary-100 dark:bg-slate-700 text-primary-600 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
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
            <div>
                <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">{pageTitles[currentPage]}</h2>
                <p className="text-md text-gray-500 dark:text-gray-400">Bienvenido, {currentUser.company_name}</p>
            </div>
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

export default App;
