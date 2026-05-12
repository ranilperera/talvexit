import axios from 'axios';
import { toast } from 'sonner';
import { getToken, clearToken } from './customer-auth';

const customerApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  timeout: 15000,
});

customerApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

customerApi.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    const e = err as {
      response?: {
        status?: number;
        data?: {
          error?: {
            code?: string;
            message?: string;
            fields?: { field: string; message: string }[];
            limit_type?: string;
            current?: number;
            limit?: number | null;
            current_plan?: string | null;
          };
        };
      };
    };
    const status = e.response?.status;
    const error = e.response?.data?.error;

    if (status === 401 && typeof window !== 'undefined') {
      clearToken();
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // 429 SUBSCRIPTION_LIMIT_REACHED — dispatch event for UpgradePromptModal,
    // skip the generic toast.
    if (
      status === 429 &&
      error?.code === 'SUBSCRIPTION_LIMIT_REACHED' &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(
        new CustomEvent('onys:subscription-limit-reached', {
          detail: {
            limit_type: error.limit_type,
            current: error.current,
            limit: error.limit,
            current_plan: error.current_plan,
            message: error.message,
          },
        }),
      );
      return Promise.reject(err);
    }

    // Show toast for 4xx/5xx (excluding 401 handled above, and 422 handled by form)
    if (status && status >= 400 && status !== 401 && status !== 422) {
      const fields = error?.fields;
      if (fields && fields.length > 0) {
        // Show each field error as a separate toast
        fields.forEach(({ field, message }) => toast.error(`${field}: ${message}`));
      } else {
        const message = error?.message ?? 'Something went wrong';
        toast.error(message);
      }
    }

    return Promise.reject(err);
  },
);

export default customerApi;
