
export interface Client {
  id: string; // From Supabase
  user_id: string;
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
  id:string; // Will be a UUID from Supabase
  user_id: string; // Associate event with a user
  client_id: string | null; // Foreign key to the clients table
  client: Client | null; // To hold the joined client data
  // FIX: Add missing 'name' property to the Event interface.
  name: string;
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
  company_name: string;
  companyLogoUrl?: string; // URL from Supabase Storage
}

export type NotificationType = 'event' | 'license';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  date: string; // ISO string when the notification was generated
}

export type Page = 'dashboard' | 'events' | 'clients' | 'agenda' | 'reports' | 'settings' | 'userManagement';
