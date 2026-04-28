import axios from 'axios';
import { AuthTokens, CreateExpenseInput, ApproveExpenseInput, PaginatedExpenses, Expense } from '@/types';

const http = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Inject Bearer token on every request — callers never handle tokens directly
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handler — redirect to login when the token expires
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// --- Auth ---
export const authApi = {
  register: (data: { email: string; password: string; name: string; role: 'employee' | 'manager' }) =>
    http.post<AuthTokens>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    http.post<AuthTokens>('/auth/login', data).then((r) => r.data),

  logout: (refreshToken: string) =>
    http.post('/auth/logout', { refreshToken }),
};

// --- Receipt upload ---
export const receiptsApi = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('receipt', file);
    return http
      .post<{ url: string }>('/expenses/receipts', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) =>
          onProgress?.(Math.round((e.loaded / (e.total ?? e.loaded)) * 100)),
      })
      .then((r) => r.data);
  },
};

// --- Expenses ---
export const expensesApi = {
  list: (params: { page?: number; limit?: number; status?: string; category?: string }) =>
    http.get<PaginatedExpenses>('/expenses', { params }).then((r) => r.data),

  getById: (id: string) =>
    http.get<Expense>(`/expenses/${id}`).then((r) => r.data),

  create: (data: CreateExpenseInput) =>
    http.post<Expense>('/expenses', data).then((r) => r.data),

  update: (id: string, data: Partial<CreateExpenseInput>) =>
    http.patch<Expense>(`/expenses/${id}`, data).then((r) => r.data),

  submit: (id: string) =>
    http.post<Expense>(`/expenses/${id}/submit`).then((r) => r.data),

  approve: (id: string, data: ApproveExpenseInput) =>
    http.post<Expense>(`/expenses/${id}/approve`, data).then((r) => r.data),

  delete: (id: string) =>
    http.delete(`/expenses/${id}`),
};
