import { request, requestBlob } from "./client.js";

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

export async function getShamcashQr() {
  try {
    const { blob } = await requestBlob("/api/settings/shamcash-qr");
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}
