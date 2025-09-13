
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
  notification_email?: string; // Email for admin chat notifications
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: string; // 'announcement', 'license', 'event', etc.
  is_read: boolean;
  created_at: string;
}

// FIX: Added missing Inquiry type definition.
export interface Inquiry {
  id: string;
  user_id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  event_type?: string;
  event_date?: string;
  message?: string;
  status: 'Nueva' | 'Contactado' | 'Presupuesto Enviado';
  created_at: string;
}

// FIX: Added missing ActivityLog type definition.
export interface ActivityLog {
    id: string;
    created_at: string;
    user_id: string;
    user_email: string | null;
    action: string;
    details: object | null;
}

// FIX: Added missing AdminDashboardStats type definition.
export interface AdminDashboardStats {
    newUsersLast30Days: number;
    licensesExpiringSoon: number;
    totalEvents: number;
    growthChartData: { name: string; Usuarios: number }[];
}

export interface BudgetItem {
  id: string; // temp client-side id
  description: string;
  quantity: number;
  price: number;
}

export type BudgetStatus = 'Borrador' | 'Enviado' | 'Aceptado' | 'Rechazado';

export interface Budget {
  id: string;
  user_id: string;
  client_id: string;
  client?: Client; // for joined data
  title: string;
  status: BudgetStatus;
  items: BudgetItem[];
  discount: number;
  notes?: string;
  valid_until?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string; // The user this message thread belongs to
  sender_is_admin: boolean;
  content: string;
  created_at: string;
  is_read_by_user: boolean;
  is_read_by_admin: boolean;
}

// FIX: Added 'inquiries' and 'activityLog' to the Page type to resolve assignment errors.
export type Page = 'dashboard' | 'events' | 'clients' | 'agenda' | 'reports' | 'settings' | 'userManagement' | 'announcements' | 'sendNotification' | 'budgets' | 'inquiries' | 'activityLog' | 'coach' | 'supportChat';
