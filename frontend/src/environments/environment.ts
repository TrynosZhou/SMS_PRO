const apiUrl = 'http://localhost:3007/api';

export const environment = {
  production: false,
  apiUrl,
  /** Backend origin for static files (e.g. /uploads/students). Must match API server port. */
  serverBaseUrl: apiUrl.replace(/\/api\/?$/, ''),
  sessionTimeoutMinutes: 30
};

