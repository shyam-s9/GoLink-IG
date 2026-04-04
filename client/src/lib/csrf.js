import axios from 'axios';
import { API_URL } from './api';

let csrfTokenCache = null;

export async function getCsrfToken(forceRefresh = false) {
  if (!forceRefresh && csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await axios.get(`${API_URL}/api/csrf-token`, { withCredentials: true });
  csrfTokenCache = response.data.csrfToken;
  return csrfTokenCache;
}

export async function csrfPost(url, body = {}, config = {}) {
  const token = await getCsrfToken();
  return axios.post(url, body, {
    ...config,
    withCredentials: true,
    headers: {
      ...(config.headers || {}),
      'x-csrf-token': token
    }
  });
}

export async function csrfPatch(url, body = {}, config = {}) {
  const token = await getCsrfToken();
  return axios.patch(url, body, {
    ...config,
    withCredentials: true,
    headers: {
      ...(config.headers || {}),
      'x-csrf-token': token
    }
  });
}
