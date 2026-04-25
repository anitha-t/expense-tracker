import { ExpenseStatus } from '@/types';

const styles: Record<ExpenseStatus, string> = {
  draft:       'background:#e5e7eb;color:#374151',
  submitted:   'background:#dbeafe;color:#1d4ed8',
  approved:    'background:#dcfce7;color:#15803d',
  rejected:    'background:#fee2e2;color:#b91c1c',
  reimbursed:  'background:#f3e8ff;color:#7e22ce',
};

export function StatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span style={{
      ...Object.fromEntries(styles[status].split(';').map(s => s.split(':'))),
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}
