export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  assigned_to_user_id?: string | null;
  subject: string;
  description: string;
  category: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  messages?: SupportTicketMessage[];
}
export interface SupportTicketMessage {
  id: string;
  author_user_id: string;
  author_email?: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}
export interface AppNotification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  entity_type?: string | null;
  entity_id?: string | null;
  read_at?: string | null;
  created_at: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('abacha_auth_token') || '';
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'Support request failed.');
  return body.data as T;
}

export const supportApi = {
  listTickets: (platform = false) => request<SupportTicket[]>(platform ? '/api/support/platform/tickets' : '/api/support/tickets'),
  getTicket: (id: string, platform = false) => request<SupportTicket>(platform ? `/api/support/platform/tickets/${id}` : `/api/support/tickets/${id}`),
  createTicket: (payload: { subject: string; description: string; category?: string; priority?: SupportTicket['priority'] }) =>
    request<SupportTicket>('/api/support/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  reply: (id: string, body: string, platform = false) =>
    request<SupportTicket>(platform ? `/api/support/platform/tickets/${id}/messages` : `/api/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateTicket: (id: string, patch: Partial<Pick<SupportTicket, 'status' | 'priority' | 'assigned_to_user_id'>>) =>
    request<SupportTicket>(`/api/support/platform/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status: patch.status, priority: patch.priority, assignedToUserId: patch.assigned_to_user_id }) }),
  listNotifications: (unreadOnly = false) => request<AppNotification[]>(`/api/support/notifications?unreadOnly=${unreadOnly ? 'true' : 'false'}`),
  markNotificationRead: (id: string) => request<{ id: string; read_at: string }>(`/api/support/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<{ updated: number }>('/api/support/notifications/read-all', { method: 'POST' }),
};
