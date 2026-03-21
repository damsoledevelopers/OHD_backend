import api from './api';

// Auth APIs
export const authAPI = {
  signup: (data: { email: string; password: string }) =>
    api.post('/auth/signup', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
};

// Company APIs
export const companyAPI = {
  getAll: () => api.get('/companies'),
  getById: (id: string) => api.get(`/companies/${id}`),
  create: (data: FormData | any) =>
    api.post('/companies', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    }),
  update: (id: string, data: FormData | any) =>
    api.put(`/companies/${id}`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
    }),
  delete: (id: string) => api.delete(`/companies/${id}`),
  submitFromCompany: (data: FormData) =>
    api.post('/companies/public', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getEmails: (id: string) => api.get(`/companies/${id}/emails`),
};

// Section APIs
export const sectionAPI = {
  getAll: () => api.get('/sections'),
  create: (data: any) => api.post('/sections', data),
  update: (id: string, data: any) => api.put(`/sections/${id}`, data),
  delete: (id: string) => api.delete(`/sections/${id}`),
};

// Question APIs
export const questionAPI = {
  getAll: (sectionId?: string) => {
    const params = sectionId ? { sectionId } : {};
    return api.get('/questions', { params });
  },
  create: (data: any) => api.post('/questions', data),
  update: (id: string, data: any) => api.put(`/questions/${id}`, data),
  delete: (id: string) => api.delete(`/questions/${id}`),
};

// Response APIs
export const responseAPI = {
  getByCompany: (companyId: string) => api.get(`/responses/company/${companyId}`),
  submit: (data: any) => api.post('/responses', data),
};

// Report APIs
export const reportAPI = {
  getCompanyReport: (companyId: string) => api.get(`/reports/company/${companyId}`),
  getSectionReport: (sectionId: string, companyId?: string) => {
    const params = companyId ? { companyId } : {};
    return api.get(`/reports/section/${sectionId}`, { params });
  },
  getOverallReport: (companyId?: string) => {
    const params = companyId ? { companyId } : {};
    return api.get('/reports/overall', { params });
  },
};

// Export APIs
export const exportAPI = {
  exportPDF: (companyId: string) => api.get(`/export/pdf/${companyId}`, { responseType: 'blob' }),
  exportExcel: (companyId: string) => api.get(`/export/excel/${companyId}`, { responseType: 'blob' }),
};

// Mail APIs
export const mailAPI = {
  sendBulk: (formData: FormData) =>
    api.post('/mail/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getLogs: (params?: any) => api.get('/mail/logs', { params }),
};

