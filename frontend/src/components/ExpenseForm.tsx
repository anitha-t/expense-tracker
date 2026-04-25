import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EXPENSE_CATEGORIES, CreateExpenseInput } from '@/types';

const schema = z.object({
  amount: z.coerce.number().positive('Must be greater than 0').max(1_000_000),
  currency: z.string().length(3).toUpperCase(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(3, 'At least 3 characters').max(500),
  // preprocess: HTML inputs always return a string, even when empty.
  // Convert '' → undefined so .optional() allows it; non-empty values must be a valid URL.
  receiptUrl: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url('Must be a valid URL').optional()
  ),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: CreateExpenseInput) => void;
  isLoading?: boolean;
  error?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 };
const errorStyle: React.CSSProperties = { color: '#dc2626', fontSize: 12, marginTop: 4 };

export function ExpenseForm({ onSubmit, isLoading, error }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USD' },
  });

  const submit = (values: FormValues) => {
    onSubmit({
      ...values,
      receiptUrl: values.receiptUrl || undefined,
    } as CreateExpenseInput);
  };

  return (
    <form onSubmit={handleSubmit(submit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor="amount" style={labelStyle}>Amount</label>
          <input id="amount" type="number" step="0.01" style={inputStyle} {...register('amount')} />
          {errors.amount && <p style={errorStyle}>{errors.amount.message}</p>}
        </div>
        <div>
          <label htmlFor="currency" style={labelStyle}>Currency</label>
          <input id="currency" style={inputStyle} maxLength={3} {...register('currency')} />
          {errors.currency && <p style={errorStyle}>{errors.currency.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="category" style={labelStyle}>Category</label>
        <select id="category" style={inputStyle} {...register('category')}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace('_', ' ')}</option>
          ))}
        </select>
        {errors.category && <p style={errorStyle}>{errors.category.message}</p>}
      </div>

      <div>
        <label htmlFor="description" style={labelStyle}>Description</label>
        <textarea id="description" rows={3} style={{ ...inputStyle, resize: 'vertical' }} {...register('description')} />
        {errors.description && <p style={errorStyle}>{errors.description.message}</p>}
      </div>

      <div>
        <label htmlFor="receiptUrl" style={labelStyle}>
          Receipt URL <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
        </label>
        <input id="receiptUrl" type="text" style={inputStyle} placeholder="https://..." {...register('receiptUrl')} />
        {errors.receiptUrl && <p style={errorStyle}>{errors.receiptUrl.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        style={{
          background: isLoading ? '#93c5fd' : '#2563eb', color: '#fff',
          padding: '10px 20px', border: 'none', borderRadius: 6,
          fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 14,
        }}
      >
        {isLoading ? 'Saving...' : 'Create Expense'}
      </button>
    </form>
  );
}
