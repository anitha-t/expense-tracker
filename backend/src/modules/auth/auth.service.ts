import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../../config/database';
import { cacheGet, cacheSet, cacheDelete } from '../../config/redis';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { RegisterInput, LoginInput, AuthTokens, UserRow } from './auth.types';

// See expense.repository.ts for rationale — mysql2 types don't model named placeholders.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exec<T extends RowDataPacket[]>(pool: Pool, sql: string, params: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pool.execute<T>(sql, params as any);
}

export class AuthService {
  async register(input: RegisterInput): Promise<AuthTokens> {
    const pool = getPool();
    const [existing] = await exec<(UserRow & RowDataPacket)[]>(
      pool, 'SELECT id FROM users WHERE email = :email LIMIT 1',
      { email: input.email }
    );
    if (existing.length > 0) throw new AppError(409, 'Email already registered');

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const userId = uuidv4();

    await exec(pool, 'INSERT INTO users (id, email, password_hash, name, role) VALUES (:id, :email, :hash, :name, :role)',
      { id: userId, email: input.email, hash: passwordHash, name: input.name, role: input.role }
    );

    logger.info({ msg: 'User registered', userId });
    return this.generateTokens(userId, input.role);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const pool = getPool();
    const [rows] = await exec<(UserRow & RowDataPacket)[]>(
      pool, 'SELECT id, password_hash, role, is_active FROM users WHERE email = :email LIMIT 1',
      { email: input.email }
    );

    const user = rows[0];

    // Constant-time comparison: always call bcrypt.compare even when no user found
    // to prevent timing attacks that reveal whether an email is registered (OWASP A07)
    const dummyHash = '$2b$12$invalidhashpaddingtomatchlengthXXXXXXXXXXXX';
    const valid = user
      ? await bcrypt.compare(input.password, user.password_hash)
      : await bcrypt.compare(input.password, dummyHash).then(() => false);

    if (!valid || !user || !user.is_active) {
      throw new AppError(401, 'Invalid email or password');
    }

    logger.info({ msg: 'User logged in', userId: user.id });
    return this.generateTokens(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await cacheGet<{ userId: string; role: string }>(`refresh:${refreshToken}`);
    if (!stored) throw new AppError(401, 'Invalid or expired refresh token');

    await cacheDelete(`refresh:${refreshToken}`);
    return this.generateTokens(stored.userId, stored.role as 'employee' | 'manager' | 'admin');
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await cacheDelete(`refresh:${refreshToken}`);
    logger.info({ msg: 'User logged out', userId });
  }

  private generateTokens(userId: string, role: string): AuthTokens {
    const jti = uuidv4();
    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    const accessToken = jwt.sign({ sub: userId, role, jti }, env.JWT_SECRET, signOptions);

    const refreshToken = uuidv4();
    const refreshTtl = 7 * 24 * 60 * 60;
    cacheSet(`refresh:${refreshToken}`, { userId, role }, refreshTtl);

    return { accessToken, refreshToken, expiresIn: 3600 };
  }
}
