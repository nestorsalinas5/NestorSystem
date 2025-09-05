
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Page, Event, Client, Expense, User } from './types';
import { getDashboardInsights } from './services/geminiService';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardIcon, EventsIcon, ClientsIcon, ReportsIcon, SettingsIcon, SunIcon, MoonIcon, LogoutIcon, UserManagementIcon } from './components/Icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './services/supabaseClient';
import { AuthSession } from '@supabase/supabase-js';

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
            if (currentUser.role === 'admin') {
                const { data, error } = await supabase.from('profiles').select('*');
                if (error) console.error("Error fetching users:", error);
                else setUsers(data as User[]);
            } else {
                const { data, error } = await supabase.from('events').select('*').eq('user_id', currentUser.id);
                if (error) console.error("Error fetching events:", error);
                else setEvents(data as Event[]);
            }
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

    const saveUser = async (user: User, newPassword?: string) => {
        // NOTE: In a real-world scenario, creating a user should be done in a serverless function for security.
        // This client-side implementation is a simplification for this environment.
        if (!user.id) { // New user
            const email = prompt("Ingrese el email para el nuevo usuario:");
            const password = prompt("Ingrese una contraseña temporal para el nuevo usuario:");
            if (!email || !password) return;

            const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
            if (authError) {
                alert("Error creando usuario: " + authError.message);
                return;
            }
            if (authData.user) {
                const profileData = { ...user, id: authData.user.id };
                const { error: profileError } = await supabase.from('profiles').insert(profileData);
                if (profileError) alert("Error guardando perfil: " + profileError.message);
                else setUsers(prev => [...prev, profileData]);
            }
        } else { // Existing user
            const { error } = await supabase.from('profiles').update(user).eq('id', user.id);
            if (error) alert("Error actual