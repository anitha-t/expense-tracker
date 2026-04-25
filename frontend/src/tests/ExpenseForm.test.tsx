import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseForm } from '@/components/ExpenseForm';

describe('ExpenseForm', () => {
  it('renders all required fields', () => {
    render(<ExpenseForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/currency/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('shows validation error when amount is negative', async () => {
    const user = userEvent.setup();
    render(<ExpenseForm onSubmit={vi.fn()} />);

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '-50');
    await user.type(screen.getByLabelText(/description/i), 'Test expense');
    await user.click(screen.getByRole('button', { name: /create expense/i }));

    await waitFor(() =>
      expect(screen.getByText(/must be greater than 0/i)).toBeInTheDocument()
    );
  });

  it('shows validation error when description is too short', async () => {
    const user = userEvent.setup();
    render(<ExpenseForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Hi');
    await user.click(screen.getByRole('button', { name: /create expense/i }));

    await waitFor(() =>
      expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument()
    );
  });

  it('shows validation error for an invalid receipt URL', async () => {
    const user = userEvent.setup();
    render(<ExpenseForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Valid description');
    await user.type(screen.getByLabelText(/receipt url/i), 'not-a-url');
    await user.click(screen.getByRole('button', { name: /create expense/i }));

    await waitFor(() =>
      expect(screen.getByText(/must be a valid url/i)).toBeInTheDocument()
    );
  });

  it('calls onSubmit with correct data when form is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ExpenseForm onSubmit={onSubmit} />);

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '89.50');
    await user.type(screen.getByLabelText(/description/i), 'Client dinner');
    await user.click(screen.getByRole('button', { name: /create expense/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 89.5,
          currency: 'USD',
          description: 'Client dinner',
        })
      )
    );
  });

  it('does NOT call onSubmit when form has errors', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ExpenseForm onSubmit={onSubmit} />);

    // Submit with empty description
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.click(screen.getByRole('button', { name: /create expense/i }));

    await waitFor(() => expect(screen.getByText(/at least 3 characters/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error banner when error prop is passed', () => {
    render(<ExpenseForm onSubmit={vi.fn()} error="Server rejected the expense" />);
    expect(screen.getByText(/server rejected the expense/i)).toBeInTheDocument();
  });

  it('disables submit button while loading', () => {
    render(<ExpenseForm onSubmit={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
