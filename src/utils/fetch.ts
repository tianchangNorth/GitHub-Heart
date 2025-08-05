// src/utils/http.ts
import { invoke } from '@tauri-apps/api/core';
import { getToken } from './token';
import { useToast } from '@/components/ui/toast';

import router from '@/router';

export interface ApiResponse {
  success: boolean;
  code: number;
  message?: string;
  data?: any;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface HttpOptions {
  method?: HttpMethod;
  data?: Record<string, any>;
  headers?: Record<string, string>;
}
const baseUrl = import.meta.env.VITE_APP_BASE_API;
const { warning } = useToast();
/**
 * 统一的请求方法，支持 GET / POST，并自动附带本地 token
 */
export async function $fetch(url: string, options: HttpOptions): Promise<ApiResponse> {
  const { method = 'get', data, headers = {} } = options;
  // 如果 url 已经是完整的 URL（包含协议），则直接使用，否则拼接 baseUrl
  const fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `${baseUrl}${url}`;

  // 自动添加 token
  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 自动添加 Content-Type
  if (!headers['Content-Type']) {
    headers['User-Agent'] = 'GitHeart';
  }

  // 根据 HTTP 方法选择对应的 Tauri 命令
  let invokeName: string;
  const methodLower = method.toLowerCase();
  switch (methodLower) {
    case 'post':
      invokeName = 'http_post';
      break;
    case 'put':
      invokeName = 'http_put';
      break;
    case 'patch':
      invokeName = 'http_patch';
      break;
    case 'delete':
      invokeName = 'http_delete';
      break;
    default:
      invokeName = 'http_get';
      break;
  }

  const response = await invoke<ApiResponse>(invokeName, {
    url: fullUrl,
    data,
    headers,
  });
  if (response.success) {
    return response;
  } else {
    if (response.code === 401) {
      warning('登录过期，请重新登录');
      router.push('/login');
    }
    throw new Error(response.message);
  }
}
