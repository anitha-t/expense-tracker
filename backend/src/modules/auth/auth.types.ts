import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  name: z.string().min(2).max(100),
  role: z.enum(['employee', 'manager']).default('employee'),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'employee' | 'manager' | 'admin';
  is_active: boolean;
  created_at: Date;
}
