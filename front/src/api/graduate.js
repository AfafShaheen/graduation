import { request } from "./client.js";

export async function getColleges() {
  return request("/api/colleges");
}

export async function getPublicSettings() {
  return request("/api/settings/public");
}

export async function verifyStep1(data) {
  return request("/api/graduates/verify-step1", {
    method: "POST",
    body: data,
  });
}

export async function registerStep2(data) {
  return request("/api/graduates/register", {
    method: "POST",
    body: data,
  });
}

export async function verifyOtp(code, token) {
  return request("/api/auth/verify-otp", {
    method: "POST",
    body: { code },
    token,
  });
}

export async function resendOtp(token) {
  return request("/api/auth/resend-otp", {
    method: "POST",
    token,
  });
}

export async function loginGraduate(data) {
  return request("/api/auth/graduate/login", {
    method: "POST",
    body: data,
  });
}

export async function logoutGraduate(token) {
  return request("/api/auth/graduate/logout", {
    method: "POST",
    token,
  });
}

export async function forgotPassword(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export async function resetPassword(data) {
  return request("/api/auth/reset-password", {
    method: "POST",
    body: data,
  });
}

export async function getTicketOptions(token) {
  return request("/api/graduates/me/ticket-options", {
    token,
  });
}

export async function selectTicket(data, token) {
  return request("/api/graduates/me/ticket", {
    method: "POST",
    body: data,
    token,
  });
}

export async function getPaymentInfo(token) {
  return request("/api/graduates/me/payment-info", {
    token,
  });
}

export async function submitPayment(data, token) {
  return request("/api/graduates/me/payment", {
    method: "POST",
    body: data,
    token,
  });
}

export async function getMyTicket(token) {
  return request("/api/graduates/me/ticket", {
    token,
  });
}

export async function getMyProfile(token) {
  return request("/api/graduates/me", {
    token,
  });
}

export async function getRegistrationColleges() {
  return request("/api/registration/colleges");
}

export async function changeEmail(newEmail, verificationToken) {
  return request("/api/auth/change-email", {
    method: "POST",
    body: { new_email: newEmail },
    token: verificationToken,
  });
}

export async function getVolunteerAnswers(token) {
  return request("/api/graduates/me/volunteer-answers", {
    token,
  });
}

export async function saveVolunteerAnswers(data, token) {
  return request("/api/graduates/me/volunteer-answers", {
    method: "PUT",
    body: {
      wants_responsibility: data.wants_responsibility,
      has_experience: data.has_experience,
    },
    token,
  });
}

/* GET /api/settings/shamcash-qr returns JSON (not an image):
   { shamcash_qr_image: "data:image/...;base64,...", shamcash_receiver_name, shamcash_account_number }.
   Return the data URI to use directly as <img src>, or null when there is no valid image. */
export async function getShamcashQr() {
  const data = await request("/api/settings/shamcash-qr");
  const src = data?.shamcash_qr_image;
  return typeof src === "string" && src.startsWith("data:image/") ? src : null;
}
