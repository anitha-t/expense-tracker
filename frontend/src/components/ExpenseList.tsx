import { format } from 'date-fns';
import { Expense, UserRole } from '@/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  expenses: Expense[];
  userRole: UserRole;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  isActioning?: string; // ID currently being actioned
}

const btnStyle = (color: string): React.CSSProperties => ({
  padding: '4px 12px', border: 'none', borderRadius: 4,
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  background: color, color: '#fff',
});

export function ExpenseList({ expenses, userRole, onSubmit, onApprove, onReject, onDelete, isActioning }: Props) {
  if (expenses.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
        No expenses yet. Create one above.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {expenses.map((exp) => (
        <div key={exp.id} style={{
          border: '1px solid #e5e7eb', borderRadius: 8, padding: 16,
          background: '#fff', opacity: isActioning === exp.id ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>
                {exp.currency} {Number(exp.amount).toFixed(2)}
              </div>
              <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
                {exp.category.replace('_', ' ')} · {exp.description}
              </div>
              <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
                {format(new Date(exp.createdAt), 'dd MMM yyyy, HH:mm')}
              </div>
              {exp.rejectionReason && (
                <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>
                  Rejected: {exp.rejectionReason}
                </div>
              )}
            </div>
            <StatusBadge status={exp.status} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {/* Employee actions */}
            {exp.status === 'draft' && userRole === 'employee' && (
              <>
                <button
                  style={{ ...btnStyle('#2563eb'), opacity: isActioning === exp.id ? 0.5 : 1, cursor: isActioning === exp.id ? 'not-allowed' : 'pointer' }}
                  disabled={isActioning === exp.id}
                  onClick={() => onSubmit(exp.id)}
                >
                  {isActioning === exp.id ? 'Submitting…' : 'Submit'}
                </button>
                <button
                  style={{ ...btnStyle('#dc2626'), opacity: isActioning === exp.id ? 0.5 : 1, cursor: isActioning === exp.id ? 'not-allowed' : 'pointer' }}
                  disabled={isActioning === exp.id}
                  onClick={() => onDelete(exp.id)}
                >
                  Delete
                </button>
              </>
            )}

            {/* Manager/admin actions */}
            {exp.status === 'submitted' && (userRole === 'manager' || userRole === 'admin') && (
              <>
                <button
                  style={{ ...btnStyle('#16a34a'), opacity: isActioning === exp.id ? 0.5 : 1, cursor: isActioning === exp.id ? 'not-allowed' : 'pointer' }}
                  disabled={isActioning === exp.id}
                  onClick={() => onApprove(exp.id)}
                >
                  {isActioning === exp.id ? 'Approving…' : 'Approve'}
                </button>
                <button
                  style={{ ...btnStyle('#dc2626'), opacity: isActioning === exp.id ? 0.5 : 1, cursor: isActioning === exp.id ? 'not-allowed' : 'pointer' }}
                  disabled={isActioning === exp.id}
                  onClick={() => onReject(exp.id)}
                >
                  {isActioning === exp.id ? 'Rejecting…' : 'Reject'}
                </button>
              </>
            )}

            {exp.receiptUrl && (
              <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...btnStyle('#6b7280'), textDecoration: 'none', display: 'inline-block' }}>
                Receipt
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
