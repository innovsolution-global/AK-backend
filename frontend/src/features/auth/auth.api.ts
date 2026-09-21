import { http } from '@/api/http';
import type { ApiResponse } from '@/api/types';
import type { AuthUser } from '@/types/domain';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResult> {
    const { data } = await http.post<ApiResponse<LoginResult>>(
      '/auth/login',
      payload,
    );
    return data.data;
  },

  async logout(): Promise<void> {
    await http.post('/auth/logout');
  },

  async me(): Promise<AuthUser> {
    const { data } = await http.get<ApiResponse<AuthUser>>('/auth/me');
    return data.data;
  },

  async forgotPassword(email: string): Promise<void> {
    await http.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await http.post('/auth/reset-password', { token, password });
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await http.post('/auth/change-password', { currentPassword, newPassword });
  },
};
