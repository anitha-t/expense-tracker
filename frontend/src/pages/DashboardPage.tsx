import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/services/api';
import { ExpenseForm } from '@/components/ExpenseForm';
import { ExpenseList } from '@/components/ExpenseList';
import {
  useExpenses, useCreateExpense, useSubmitExpense,
  useApproveExpense, useDeleteExpense,
} from '@/hooks/useExpenses';
import { CreateExpenseInput } from '@/types';

export function DashboardPage() {
  const { user, logout } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [actioning, setActioning] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useExpenses({ page, limit: 10 });
  const createMutation = useCreateExpense();
  const submitMutation = useSubmitExpense();
  const approveMutation = useApproveExpense();
  const deleteMutation = useDeleteExpense();

  const handleCreate = async (input: CreateExpenseInput) => {
    try {
      await createMutation.mutateAsync(input);
      setShowForm(false);
    } catch {
      // Error is captured in createMutation.error and displayed via the form's error prop
    }
  };

  const handleSubmit = async (id: string) => {
    setActioning(id);
    await submitMutation.mutateAsync(id).finally(() => setActioning(undefined));
  };

  const handleApprove = async (id: string) => {
    setActioning(id);
    await approveMutation.mutateAsync({ id, data: { action: 'approve' } }).finally(() => setActioning(undefined));
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) return;
    setActioning(id);
    await approveMutation.mutateAsync({ id, data: { action: 'reject', rejectionReason: reason } })
      .finally(() => setActioning(undefined));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this expense?')) return;
    setActioning(id);
    await deleteMutation.mutateAsync(id).finally(() => setActioning(undefined));
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken') ?? '';
    await authApi.logout(refreshToken).catch(() => null);
    logout();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Expense Tracker</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {user?.role} · {user?.userId.slice(0, 8)}
            </span>
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Create expense */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Expenses</h2>
            {user?.role === 'employee' && (
              <button
                onClick={() => setShowForm((v) => !v)}
                style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                {showForm ? 'Cancel' : '+ New Expense'}
              </button>
            )}
          </div>

          {showForm && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>New Expense</h3>
              <ExpenseForm
                onSubmit={handleCreate}
                isLoading={createMutation.isPending}
                error={createMutation.error
                  ? ((createMutation.error as { response?: { data?: { error?: { message?: string } } } })
                    ?.response?.data?.error?.message ?? 'Failed to create expense')
                  : undefined}
              />
            </div>
          )}
        </div>

        {/* Expense list */}
        {isLoading && <p style={{ color: '#6b7280', textAlign: 'center' }}>Loading...</p>}
        {error && <p style={{ color: '#dc2626', textAlign: 'center' }}>Failed to load expenses.</p>}

        {data && (
          <>
            <ExpenseList
              expenses={data.items}
              userRole={user?.role ?? 'employee'}
              onSubmit={handleSubmit}
              onApprove={handleApprove}
              onReject={handleReject}
              onDelete={handleDelete}
              isActioning={actioning}
            />

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                  style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: page === 1 ? 'not-allowed' : 'pointer', background: '#fff' }}>
                  ← Prev
                </button>
                <span style={{ padding: '6px 14px', fontSize: 14, color: '#6b7280' }}>
                  {page} / {data.totalPages}
                </span>
                <button disabled={page === data.totalPages} onClick={() => setPage((p) => p + 1)}
                  style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, cursor: page === data.totalPages ? 'not-allowed' : 'pointer', background: '#fff' }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
