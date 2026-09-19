const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('runway_token');
}
export function setToken(token) {
  if (token) localStorage.setItem('runway_token', token);
  else localStorage.removeItem('runway_token');
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Separate from request() because file uploads are multipart/form-data,
// not JSON — the browser sets the correct Content-Type boundary itself,
// so we must NOT set it manually here.
async function uploadRequest(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
  return data;
}

// Downloads are auth-protected (Bearer token), so a plain <a href> can't
// be used — fetch with the header, then hand the browser a blob to save.
async function downloadRequest(path, suggestedName) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'document';
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/me'),
  updateMe: (payload) => request('/me', { method: 'PUT', body: payload }),

  listEvents: () => request('/events'),
  createEvent: (payload) => request('/events', { method: 'POST', body: payload }),

  listMembers: (eventId) => request(`/events/${eventId}/members`),
  addMember: (eventId, payload) => request(`/events/${eventId}/members`, { method: 'POST', body: payload }),
  updateMember: (eventId, memberId, payload) => request(`/events/${eventId}/members/${memberId}`, { method: 'PATCH', body: payload }),
  removeMember: (eventId, memberId) => request(`/events/${eventId}/members/${memberId}`, { method: 'DELETE' }),

  listTasks: (eventId) => request(`/events/${eventId}/tasks`),
  createTask: (eventId, payload) => request(`/events/${eventId}/tasks`, { method: 'POST', body: payload }),
  updateTask: (eventId, id, payload) => request(`/events/${eventId}/tasks/${id}`, { method: 'PUT', body: payload }),
  deleteTask: (eventId, id) => request(`/events/${eventId}/tasks/${id}`, { method: 'DELETE' }),

  listSponsors: (eventId) => request(`/events/${eventId}/sponsors`),
  createSponsor: (eventId, payload) => request(`/events/${eventId}/sponsors`, { method: 'POST', body: payload }),
  updateSponsor: (eventId, id, payload) => request(`/events/${eventId}/sponsors/${id}`, { method: 'PUT', body: payload }),
  deleteSponsor: (eventId, id) => request(`/events/${eventId}/sponsors/${id}`, { method: 'DELETE' }),
  toggleDeliverable: (eventId, sponsorId, deliverableId) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/deliverables/${deliverableId}`, { method: 'PATCH' }),

  listArtists: (eventId) => request(`/events/${eventId}/artists`),
  createArtist: (eventId, payload) => request(`/events/${eventId}/artists`, { method: 'POST', body: payload }),
  updateArtist: (eventId, id, payload) => request(`/events/${eventId}/artists/${id}`, { method: 'PUT', body: payload }),
  deleteArtist: (eventId, id) => request(`/events/${eventId}/artists/${id}`, { method: 'DELETE' }),

  listStalls: (eventId) => request(`/events/${eventId}/stalls`),
  createStall: (eventId, payload) => request(`/events/${eventId}/stalls`, { method: 'POST', body: payload }),
  updateStall: (eventId, id, payload) => request(`/events/${eventId}/stalls/${id}`, { method: 'PUT', body: payload }),
  deleteStall: (eventId, id) => request(`/events/${eventId}/stalls/${id}`, { method: 'DELETE' }),

  listBudgetLines: (eventId) => request(`/events/${eventId}/budget-lines`),
  createBudgetLine: (eventId, payload) => request(`/events/${eventId}/budget-lines`, { method: 'POST', body: payload }),
  updateBudgetLine: (eventId, id, payload) => request(`/events/${eventId}/budget-lines/${id}`, { method: 'PUT', body: payload }),
  deleteBudgetLine: (eventId, id) => request(`/events/${eventId}/budget-lines/${id}`, { method: 'DELETE' }),

  listExpenses: (eventId) => request(`/events/${eventId}/expenses`),
  createExpense: (eventId, payload) => request(`/events/${eventId}/expenses`, { method: 'POST', body: payload }),
  approveHead: (eventId, id) => request(`/events/${eventId}/expenses/${id}/approve-head`, { method: 'POST' }),
  approveFinance: (eventId, id) => request(`/events/${eventId}/expenses/${id}/approve-finance`, { method: 'POST' }),
  rejectExpense: (eventId, id, reason) => request(`/events/${eventId}/expenses/${id}/reject`, { method: 'POST', body: { reason } }),
  exportExpensesCsv: (eventId, status) =>
    downloadRequest(`/events/${eventId}/expenses/export${status ? `?status=${status}` : ''}`, `expenses-${eventId}.csv`),

  listExpensePolicies: (eventId) => request(`/events/${eventId}/expense-policies`),
  createExpensePolicy: (eventId, payload) => request(`/events/${eventId}/expense-policies`, { method: 'POST', body: payload }),
  deleteExpensePolicy: (eventId, id) => request(`/events/${eventId}/expense-policies/${id}`, { method: 'DELETE' }),

  getReportsSummary: (eventId) => request(`/events/${eventId}/reports/summary`),

  listDocuments: (eventId, entityType, entityId) =>
    request(`/events/${eventId}/documents?entityType=${entityType}&entityId=${entityId}`),
  uploadDocument: (eventId, { entityType, entityId, label, file }) => {
    const fd = new FormData();
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    if (label) fd.append('label', label);
    fd.append('file', file);
    return uploadRequest(`/events/${eventId}/documents`, fd);
  },
  downloadDocument: (eventId, documentId, fileName) =>
    downloadRequest(`/events/${eventId}/documents/${documentId}/download`, fileName),
  deleteDocument: (eventId, documentId) => request(`/events/${eventId}/documents/${documentId}`, { method: 'DELETE' }),

  listSponsorContracts: (eventId, sponsorId) => request(`/events/${eventId}/sponsors/${sponsorId}/contracts`),
  createSponsorContract: (eventId, sponsorId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/contracts`, { method: 'POST', body: payload }),
  updateSponsorContract: (eventId, sponsorId, contractId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/contracts/${contractId}`, { method: 'PUT', body: payload }),
  signSponsorContract: (eventId, sponsorId, contractId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/contracts/${contractId}/sign`, { method: 'POST', body: payload }),
  renewSponsorContract: (eventId, sponsorId, contractId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/contracts/${contractId}/renew`, { method: 'POST', body: payload }),
  deleteSponsorContract: (eventId, sponsorId, contractId) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/contracts/${contractId}`, { method: 'DELETE' }),

  listSponsorPayments: (eventId, sponsorId) => request(`/events/${eventId}/sponsors/${sponsorId}/payments`),
  createSponsorPayment: (eventId, sponsorId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/payments`, { method: 'POST', body: payload }),
  markSponsorPaymentPaid: (eventId, sponsorId, paymentId, payload) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/payments/${paymentId}/mark-paid`, { method: 'PATCH', body: payload }),
  deleteSponsorPayment: (eventId, sponsorId, paymentId) =>
    request(`/events/${eventId}/sponsors/${sponsorId}/payments/${paymentId}`, { method: 'DELETE' }),

  listArtistTravelLegs: (eventId, artistId) => request(`/events/${eventId}/artists/${artistId}/travel-legs`),
  createArtistTravelLeg: (eventId, artistId, payload) =>
    request(`/events/${eventId}/artists/${artistId}/travel-legs`, { method: 'POST', body: payload }),
  updateArtistTravelLeg: (eventId, artistId, legId, payload) =>
    request(`/events/${eventId}/artists/${artistId}/travel-legs/${legId}`, { method: 'PUT', body: payload }),
  deleteArtistTravelLeg: (eventId, artistId, legId) =>
    request(`/events/${eventId}/artists/${artistId}/travel-legs/${legId}`, { method: 'DELETE' }),

  listArtistPayments: (eventId, artistId) => request(`/events/${eventId}/artists/${artistId}/payments`),
  createArtistPayment: (eventId, artistId, payload) =>
    request(`/events/${eventId}/artists/${artistId}/payments`, { method: 'POST', body: payload }),
  markArtistPaymentPaid: (eventId, artistId, paymentId, payload) =>
    request(`/events/${eventId}/artists/${artistId}/payments/${paymentId}/mark-paid`, { method: 'PATCH', body: payload }),
  deleteArtistPayment: (eventId, artistId, paymentId) =>
    request(`/events/${eventId}/artists/${artistId}/payments/${paymentId}`, { method: 'DELETE' }),
};
