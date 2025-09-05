
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Page, Event, Client, Expense, User } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon } from './components/Icons.tsx';
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
                
                {/* Login Form */}
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
        // Also fetch email from auth user to display in admin panel
        const { data: { user } } = await supabase.auth.getUser();
        return { ...data, email: user?.email } as User;
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
        // This is a simplified fetch. A real-world app would need to join with auth.users to get emails.
        // For now, we assume the edge function or triggers keep email in sync if needed, or we fetch it separately.
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) {
            console.error("Error fetching users:", error);
        } else {
            // This is inefficient, but will work for a small number of users.
            // A better solution is a database function (RPC).
            const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
            if (authError) {
                console.error("Error fetching auth users:", authError);
                // FIX: Added null check for data to prevent errors.
                setUsers((data as User[]) || []);
            } else {
                // FIX: Added checks for data and authUsers being non-null to prevent runtime errors.
                if (data && authUsers) {
                    // FIX: The type of `profile` was being inferred as `never`. Casting `data` to `User[]` provides the correct type context.
                    const usersWithEmails = (data as User[]).map((profile) => {
                        const authUser = authUsers.users.find(u => u.id === profile.id);
                        return { ...profile, email: authUser?.email };
                    });
                    setUsers(usersWithEmails);
                } else {
                    setUsers((data as User[]) || []);
                }
            }
        }
    }, []);

    const fetchUserData = useCallback(async (userId: string) => {
        const { data, error } = await supabase.from('events').select('*').eq('user_id', userId);
        if (error) console.error("Error fetching events:", error);
        else setEvents(data as Event[]);
    }, []);


    // Data fetching based on user role
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
        const eventToSave = { ...event, user_id: currentUser!.id };
        const { data, error } = await supabase.from('events').upsert(eventToSave).select().single();
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
            else setEvents(events.filter(e => e.id !== eventId));
        }
    };

    const saveUser = async (user: User, password?: string) => {
        // The user object received here might have an empty string for id if new
        if (!user.id) { // Creating new user
            if (!user.email || !password || !user.companyName || !user.activeUntil) {
                alert("Todos los campos son requeridos para crear un usuario.");
                return;
            }

            const { error } = await supabase.functions.invoke('create-user', {
                body: { 
                    email: user.email, 
                    password: password,
                    companyName: user.companyName,
                    activeUntil: user.activeUntil
                },
            });

            if (error) {
                alert("Error al crear usuario: " + error.message);
            } else {
                alert("Usuario creado exitosamente.");
                await fetchAdminData(); // Refresh user list
            }

        } else { // Existing user
            const { id, email, ...updateData } = user; // email should not be updated from here
            const { error } = await supabase.from('profiles').update(updateData).eq('id', id);
            if (error) {
                alert("Error actualizando perfil: " + error.message);
            } else {
                await fetchAdminData(); // Refetch all users to get updated info
                if (currentUser?.id === id) {
                    // Refetch current user profile as well
                    const updatedProfile = await fetchUserProfile(id);
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
    
    // --- MAIN APP UI ---
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
                setCurrentPage={setCurrentPage}
            />
        </main>
      </div>
    );
};

// --- PAGE ROUTER ---
const PageContent: React.FC<{
    currentPage: Page;
    currentUser: User;
    events: Event[];
    saveEvent: (event: Event) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
    users: User[];
    saveUser: (user: User, password?: string) => Promise<void>;
    uploadLogo: (userId: string, file: File) => Promise<string | null>;
    setCurrentPage: (page: Page) => void;
}> = (props) => {
    switch (props.currentPage) {
        case 'dashboard':
            return props.currentUser.role === 'admin' 
                ? <DashboardAdmin users={props.users} /> 
                : <DashboardUser events={props.events} />;
        case 'events':
            return <EventsPage events={props.events} saveEvent={props.saveEvent} deleteEvent={props.deleteEvent} />;
        case 'userManagement':
            return <UserManagementPage users={props.users} saveUser={props.saveUser} />;
        case 'clients':
             return <div>Página de Clientes en construcción.</div>;
        case 'reports':
             return <div>Página de Reportes en construcción.</div>;
        case 'settings':
             return <SettingsPage currentUser={props.currentUser} saveUser={props.saveUser} uploadLogo={props.uploadLogo} />;
        default:
            return <div>Página no encontrada o en construcción.</div>;
    }
};


// --- PAGE COMPONENTS ---

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
    // Basic dashboard logic, should be expanded
    const totalIncome = events.reduce((acc, event) => acc + event.amountCharged, 0);
    const totalExpenses = events.reduce((acc, event) => acc + (event.expenses?.reduce((expAcc, exp) => expAcc + exp.amount, 0) || 0), 0);
    return (
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold">Ingresos Totales</h3>
                <p className="text-3xl font-bold text-green-500">{formatGuarani(totalIncome)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold">Gastos Totales</h3>
                <p className="text-3xl font-bold text-red-500">{formatGuarani(totalExpenses)}</p>
            </div>
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold">Ganancia Neta</h3>
                <p className="text-3xl font-bold text-blue-500">{formatGuarani(totalIncome - totalExpenses)}</p>
            </div>
        </div>
    )
};

const UserManagementPage: React.FC<{
    users: User[], 
    saveUser: (user: User, password?: string) => Promise<void>
}> = ({ users, saveUser }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const handleOpenModal = (user: User | null) => {
        // For new user, create a blank slate object
        const userToEdit: User = user ? { ...user } : { id: '', email: '', role: 'user', status: 'active', activeUntil: '', companyName: '' };
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
                                <td className="p-2">{user.companyName}</td>
                                <td className="p-2">
                                    <span className={`px-2 py-1 rounded-full text-xs ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {user.status === 'active' ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="p-2">{new Date(user.activeUntil).toLocaleDateString()}</td>
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
    const [formData, setFormData] = useState<User>(user || { id: '', email: '', role: 'user', status: 'active', activeUntil: '', companyName: '' });
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
                        <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
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
                             <input type="date" name="activeUntil" value={formData.activeUntil.split('T')[0]} onChange={handleChange} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" required />
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
             {/* Event list would go here */}
             <p>Lista de eventos en construcción.</p>
            {isModalOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40"></div> /* Backdrop */}
            {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center"><p className='bg-white p-4 rounded-lg'>Formulario de Eventos en construcción.</p> <button onClick={() => setIsModalOpen(false)}>Cerrar</button></div>}
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
                    <input type="text" value={user.companyName} onChange={e => setUser({...user, companyName: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                </div>
                 <div className="mb-4">
                    <label className="block mb-2">Logo de la Empresa</label>
                    <div className="flex items-center space-x-4">
                        {user.companyLogoUrl && <img src={user.companyLogoUrl} alt="Logo" className="w-16 h-16 rounded-full object-cover" />}
                        <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
                    </div>
                </div>
                <button type="submit" disabled={isUploading} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                    {isUploading ? 'Subiendo...' : 'Guardar Cambios'}
                </button>
            </form>
        </div>
    )
}

// --- SHARED COMPONENTS ---

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
                <p className="text-md text-gray-500 dark:text-gray-400">Bienvenido, {currentUser.companyName}</p>
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
