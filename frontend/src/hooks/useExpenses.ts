import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '@/services/api';
import { CreateExpenseInput, ApproveExpenseInput } from '@/types';

const EXPENSES_KEY = 'expenses';

export function useExpenses(params: { page?: number; limit?: number; status?: string } = {}) {
  return useQuery({
    queryKey: [EXPENSES_KEY, params],
    queryFn: () => expensesApi.list(params),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: [EXPENSES_KEY, id],
    queryFn: () => expensesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExpenseInput) => expensesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateExpenseInput>) => expensesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  });
}

export function useSubmitExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.submit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  });
}

export function useApproveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApproveExpenseInput }) =>
      expensesApi.approve(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [EXPENSES_KEY] }),
  });
}
