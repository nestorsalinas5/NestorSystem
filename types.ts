
export interface Client {
  name: string;
  phone: string;
  email?: string;
}

export interface Expense {
  id: string;
  type: string;
  amount: number;
}

export interface Event {
  id: string; // Will be a UUID from Supabase
  user_id: string; // Associate event with a user
  name: string;
  client: Client;
  location: string;
  date: string; // ISO string format
  amount_charged: number;
  expenses: Expense[];
  observations?: string;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string; // This will be the Supabase auth user ID (UUID)
  email?: string; // from Supabase auth
  role: UserRole;
  status: UserStatus;
  activeUntil: string; // ISO string
  companyName: string;
  companyLogoUrl?: string; // URL from Supabase Storage
}

export type Page = 'dashboard' | 'events' | 'clients' | 'agenda' | 'reports' | 'settings' | 'userManagement';
