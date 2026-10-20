import { request, requestBlob } from "./client.js";
import { getAdminToken, setAdminUsername } from "./session.js";

export { ApiError, downloadBlob } from "./client.js";

function buildQuery(params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.append(key, value);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function loginAdmin(data) {
  const res = await request("/api/admin/auth/login", {
    method: "POST",
    body: data,
  });
  setAdminUsername(data?.username);
  return res;
}

export async function logoutAdmin() {
  return request("/api/admin/auth/logout", {
    method: "POST",
    token: getAdminToken(),
  });
}

export async function getEvents(params) {
  return request(`/api/admin/events${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function createEvent(data) {
  return request("/api/admin/events", {
    method: "POST",
    body: data,
    token: getAdminToken(),
  });
}

export async function getEvent(id) {
  return request(`/api/admin/events/${id}`, {
    token: getAdminToken(),
  });
}

export async function updateEvent(id, data) {
  return request(`/api/admin/events/${id}`, {
    method: "PUT",
    body: data,
    token: getAdminToken(),
  });
}

export async function deleteEvent(id) {
  return request(`/api/admin/events/${id}`, {
    method: "DELETE",
    token: getAdminToken(),
  });
}

export async function listColleges() {
  const auth = getAdminToken();
  return request("/api/admin/colleges", { token: auth });
}

export async function createCollege(data) {
  const auth = getAdminToken();
  return request("/api/admin/colleges", { method: "POST", body: data, token: auth });
}

export async function updateCollege(id, data) {
  const auth = getAdminToken();
  return request(`/api/admin/colleges/${id}`, { method: "PUT", body: data, token: auth });
}

export async function deleteCollege(id) {
  const auth = getAdminToken();
  return request(`/api/admin/colleges/${id}`, { method: "DELETE", token: auth });
}

export async function getMajors(collegeId) {
  const auth = getAdminToken();
  return request(`/api/admin/colleges/${collegeId}/majors`, { token: auth });
}

export async function createMajor(collegeId, data) {
  return request(`/api/admin/colleges/${collegeId}/majors`, {
    method: "POST",
    body: data,
    token: getAdminToken(),
  });
}

export async function updateMajor(id, data) {
  return request(`/api/admin/majors/${id}`, {
    method: "PUT",
    body: data,
    token: getAdminToken(),
  });
}

export async function deleteMajor(id) {
  return request(`/api/admin/majors/${id}`, {
    method: "DELETE",
    token: getAdminToken(),
  });
}

export async function uploadUniversityRecords(eventId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/api/admin/events/${eventId}/university-records`, {
    method: "POST",
    body: formData,
    token: getAdminToken(),
  });
}

export async function getUniversityRecords(eventId, params) {
  return request(`/api/admin/events/${eventId}/university-records${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function deleteUniversityRecord(id) {
  return request(`/api/admin/university-records/${id}`, {
    method: "DELETE",
    token: getAdminToken(),
  });
}

export async function diagnoseUniversityRecord(payload) {
  const auth = getAdminToken();
  return request("/api/admin/university-records/diagnose", {
    method: "POST",
    body: payload,
    token: auth
  });
}

export async function listUniversityFiles() {
  const auth = getAdminToken();
  return request("/api/admin/university-files", { token: auth });
}

export async function uploadUniversityFile(file, eventId) {
  const auth = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  if (eventId != null) {
    formData.append("event_id", String(eventId));
  }
  return request("/api/admin/university-files", {
    method: "POST",
    body: formData,
    token: auth
  });
}

export async function linkUniversityFile(fileId, eventId) {
  const auth = getAdminToken();
  return request(`/api/admin/university-files/${fileId}/link`, {
    method: "POST",
    body: { event_id: eventId },
    token: auth
  });
}

export async function deleteUniversityFile(fileId) {
  const auth = getAdminToken();
  return request(`/api/admin/university-files/${fileId}`, {
    method: "DELETE",
    token: auth
  });
}

export async function getPayments(eventId, params) {
  return request(`/api/admin/events/${eventId}/payments${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function getTicket(id) {
  return request(`/api/admin/tickets/${id}`, {
    token: getAdminToken(),
  });
}

export async function confirmTicket(id) {
  return request(`/api/admin/tickets/${id}/confirm`, {
    method: "POST",
    token: getAdminToken(),
  });
}

export async function rejectTicket(id, reason) {
  return request(`/api/admin/tickets/${id}/reject`, {
    method: "POST",
    body: { reason },
    token: getAdminToken(),
  });
}

export async function getGraduates(params) {
  return request(`/api/admin/graduates${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function getGraduate(id) {
  return request(`/api/admin/graduates/${id}`, {
    token: getAdminToken(),
  });
}

export async function updateGraduateEmail(id, newEmail) {
  return request(`/api/admin/graduates/${id}/email`, {
    method: "PUT",
    body: { new_email: newEmail },
    token: getAdminToken(),
  });
}

export async function manualCheckInGraduate(id) {
  return request(`/api/admin/graduates/${id}/manual-check-in`, {
    method: "POST",
    token: getAdminToken(),
  });
}

export async function revertGraduateScan(id) {
  return request(`/api/admin/graduates/${id}/revert-scan`, {
    method: "POST",
    token: getAdminToken(),
  });
}

export async function revertTicketPayment(id) {
  return request(`/api/admin/tickets/${id}/revert-payment`, {
    method: "POST",
    token: getAdminToken(),
  });
}

export async function getScanners(params) {
  return request(`/api/admin/scanners${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function createScanner(data) {
  return request("/api/admin/scanners", {
    method: "POST",
    body: data,
    token: getAdminToken(),
  });
}

export async function deleteScanner(id) {
  return request(`/api/admin/scanners/${id}`, {
    method: "DELETE",
    token: getAdminToken(),
  });
}

export async function getSettings() {
  return request("/api/admin/settings", {
    token: getAdminToken(),
  });
}

export async function updateSettings(data) {
  return request("/api/admin/settings", {
    method: "PUT",
    body: data,
    token: getAdminToken(),
  });
}

export async function uploadShamcashQr(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/api/admin/settings/shamcash-qr", {
    method: "PUT",
    body: formData,
    token: getAdminToken(),
  });
}

export async function deleteShamcashQr() {
  return request("/api/admin/settings/shamcash-qr", {
    method: "DELETE",
    token: getAdminToken(),
  });
}

export async function getStats(params) {
  return request(`/api/admin/stats${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function getVolunteers(params) {
  return request(`/api/admin/volunteers${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function exportVolunteers(params) {
  return requestBlob(`/api/admin/volunteers/export${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function exportData(params) {
  return requestBlob(`/api/admin/export${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}

export async function adminRequest(path, { method = "GET", body = null, query = null } = {}) {
  const auth = getAdminToken();
  return request(`${path}${buildQuery(query)}`, { method, body, token: auth });
}

export async function adminForm(path, formData, method = "POST", query = null) {
  const auth = getAdminToken();
  return request(`${path}${buildQuery(query)}`, { method, body: formData, token: auth });
}

export async function adminBlob(path, query = null) {
  const auth = getAdminToken();
  return requestBlob(`${path}${buildQuery(query)}`, { token: auth });
}

export async function getAuditLogs(params) {
  return request(`/api/admin/audit-logs${buildQuery(params)}`, {
    token: getAdminToken(),
  });
}
