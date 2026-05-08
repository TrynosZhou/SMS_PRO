// This file can be replaced during build by using the `fileReplacements` array.
// For production, use the actual backend API URL
const apiUrl = 'https://sms-pro-sec.onrender.com/api';
//const apiUrl='https://sms-pro-sec.onrender.com';

export const environment = {
  production: true,
  apiUrl,
  serverBaseUrl: apiUrl.replace(/\/api\/?$/, ''),
  sessionTimeoutMinutes: 30
};

