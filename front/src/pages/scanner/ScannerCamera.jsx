import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import '../../style/ScannerCamera.css';
import unionLogo from '../../assets/only-logo.png';
import { request } from '../../api/client';
import { getScannerToken, isScannerTokenExpired, clearScannerSession, getScannerEvent } from '../../api/session';

/* ==========================================================================
   شاشة المسح الميدانية (الماسح)
   ========================================================================== */

export default function ScannerCamera({
  onLogout,
}) {
  const navigate = useNavigate();
  const eventInfo = getScannerEvent();
  const eventName = eventInfo?.name || 'ماسح التذاكر';

  const [isTorchActive, setIsTorchActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [scanCount] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const [showHttpsWarning, setShowHttpsWarning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const showToast = false;
  const toastTimer = useRef(null);
  const lastScanTimeRef = useRef(0);
  const isScanningRef = useRef(false);
  const html5QrCodeRef = useRef(null);

  const toggleTorch = () => setIsTorchActive((prev) => !prev);
  const toggleMute = () => setIsMuted((prev) => !prev);

  const closeModal = () => {
    setIsModalOpen(false);
    setManualCode('');
    setManualError('');
  };

  /* التحقق من HTTPS أو localhost */
  useEffect(() => {
    const isSecure =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (!isSecure) {
      setShowHttpsWarning(true);
    }
  }, []);

  /* التحقق من صلاحية جلسة الماسح عند التحميل */
  useEffect(() => {
    if (!getScannerToken() || isScannerTokenExpired()) {
      clearScannerSession();
      navigate('/scanner', { replace: true });
    }
  }, [navigate]);

  /* التهيئة والكاميرا وتنظيفها عند إلغاء التحميل */
  useEffect(() => {
    let isMounted = true;
    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCodeRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        setCameraError('');
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          (decodedText) => {
            if (isMounted) {
              handleScan(decodedText);
            }
          },
          () => {
            // ignore continuous scanning parse errors
          }
        );
      } catch {
        // Fallback for laptops/desktops with only front camera
        try {
          await html5QrCode.start(
            { facingMode: "user" },
            {
              fps: 10,
              qrbox: { width: 220, height: 220 },
            },
            (decodedText) => {
              if (isMounted) {
                handleScan(decodedText);
              }
            },
            () => {
              // ignore continuous scanning parse errors
            }
          );
        } catch (fallbackErr) {
          console.error("Camera fallback failed:", fallbackErr);
          if (isMounted) {
            setCameraError('تعذّر تشغيل الكاميرا. يرجى التحقق من صلاحيات المتصفح والاتصال الآمن (HTTPS).');
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current
            .stop()
            .catch(() => {})
            .finally(() => {
              html5QrCodeRef.current.clear().catch(() => {});
            });
        } else {
          html5QrCodeRef.current.clear().catch(() => {});
        }
      }
    };
  }, []);

  const handleScan = async (code) => {
    const trimmed = code?.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (isScanningRef.current || now - lastScanTimeRef.current < 3000) {
      return;
    }

    isScanningRef.current = true;
    lastScanTimeRef.current = now;

    try {
      const data = await request('/api/scanner/scan', {
        method: 'POST',
        body: { code: trimmed },
        token: getScannerToken(),
      });

      if (data.decision === 'SUCCESS') {
        navigate('/scanner/result', { state: { result: data } });
      } else if (data.decision === 'WRONG_EVENT') {
        navigate('/scanner/wrong-ceremony', { state: { scanResult: data } });
      } else if (data.decision === 'ALREADY_USED') {
        navigate('/scanner/error', { state: { errorType: 'already_used', scanResult: data } });
      } else if (data.decision === 'NOT_ACTIVATED') {
        navigate('/scanner/error', { state: { errorType: 'companion_error', scanResult: data } });
      } else if (data.decision === 'TICKET_NOT_CONFIRMED') {
        navigate('/scanner/error', { state: { errorType: 'not_confirmed', scanResult: data } });
      } else if (data.decision === 'NOT_FOUND') {
        navigate('/scanner/error', { state: { errorType: 'not_found', scanResult: data } });
      } else {
        navigate('/scanner/error', { state: { errorType: 'already_used', scanResult: data } });
      }
    } catch (err) {
      console.error("Scan request error:", err);
    } finally {
      setTimeout(() => {
        isScanningRef.current = false;
      }, 1000);
    }
  };

  const handleLogout = async () => {
    try {
      await request('/api/scanner/auth/logout', {
        method: 'POST',
        token: getScannerToken(),
      });
    } catch {
      // ignore
    } finally {
      clearScannerSession();
      if (onLogout) {
        onLogout();
      } else {
        navigate('/scanner', { replace: true });
      }
    }
  };

  /* تنظيف المؤقت عند إغلاق الشاشة */
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* Escape بيسكّر نافذة الإدخال اليدوي */
  useEffect(() => {
    if (!isModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      setManualError('أدخل رقم التذكرة أو الرقم الجامعي');
      return;
    }

    closeModal();
    handleScan(code);
  };

  return (
    <div className="scan-cam-app-container">
      <style>{`
        #qr-reader {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          z-index: 1 !important;
          overflow: hidden !important;
          border: none !important;
          background: transparent !important;
        }
        #qr-reader video,
        #qr-reader canvas {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          inset: 0 !important;
        }
        #qr-reader__dashboard_section,
        #qr-reader__header_message,
        #qr-reader__status_span {
          display: none !important;
        }
      `}</style>
      <div className="scan-cam-mobile-frame">
        {/* الهيدر العلوي */}
        <header className="scan-cam-header">
          <div className="scan-cam-header-info">
            <img className="scan-cam-header-logo" src={unionLogo} alt="شعار اتحاد الطلبة" />
            <div>
              <h1 className="scan-cam-header-title">ماسح التذاكر — جامعة حمص</h1>
              <p className="scan-cam-header-sub">{eventName}</p>
            </div>
          </div>

          <div className="scan-cam-header-actions">
            <button
              type="button"
              className={`scan-cam-icon-btn ${isTorchActive ? 'active' : ''}`}
              aria-label="تشغيل الفلاش"
              aria-pressed={isTorchActive}
              onClick={toggleTorch}
            >
              <span className="scan-cam-symbol">flash_on</span>
            </button>
            <button
              type="button"
              className="scan-cam-icon-btn"
              aria-label="تسجيل الخروج"
              onClick={handleLogout}
            >
              <span className="scan-cam-symbol">logout</span>
            </button>
          </div>
        </header>

        {/* شريط حالة الاتصال */}
        <div className="scan-cam-status-bar">
          <div className="scan-cam-status-main">
            <span className="scan-cam-pulse-dot">
              <span className="scan-cam-pulse-ring"></span>
              <span className="scan-cam-pulse-core"></span>
            </span>
            <span className="scan-cam-status-text">{eventInfo?.name ? `حفل: ${eventInfo.name}` : 'جاهز للمسح'}</span>
          </div>

          <div className="scan-cam-sync-badge">
            <span className="scan-cam-symbol" style={{ fontSize: '14px' }}>sensors</span>
            <span>تزامن مباشر</span>
          </div>
        </div>

        {/* منطقة الكاميرا */}
        <main className="scan-cam-viewfinder-zone" style={{ position: 'relative' }}>
          <div id="qr-reader" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}></div>
          {cameraError && (
            <div style={{ position: 'absolute', top: 50, left: 16, right: 16, zIndex: 20, background: '#ca4b00', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>
              {cameraError}
            </div>
          )}
          {showHttpsWarning && (
            <div style={{ position: 'absolute', top: 8, left: 16, right: 16, zIndex: 20, background: '#ca4b00', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>
              الكاميرا تتطلب HTTPS على الأجهزة الحقيقية
            </div>
          )}

          <div className="scan-cam-prompt-card" style={{ zIndex: 2, position: 'relative' }}>
            <div className="scan-cam-prompt-pill">
              <span className="scan-cam-symbol scan-cam-accent">center_focus_strong</span>
              <p>وجّه الكاميرا نحو رمز QR على بطاقة الخريج</p>
            </div>
          </div>

          {/* مربع التوجيه (1:1) */}
          <div className="scan-cam-reticle-box" style={{ zIndex: 2, position: 'relative' }}>
            <div className="scan-cam-reticle-glow"></div>
            <div className="scan-cam-reticle-frame">
              <div className="scan-cam-corner scan-cam-corner-tr"></div>
              <div className="scan-cam-corner scan-cam-corner-tl"></div>
              <div className="scan-cam-corner scan-cam-corner-br"></div>
              <div className="scan-cam-corner scan-cam-corner-bl"></div>

              <div className="scan-cam-reticle-watermark">
                <span className="scan-cam-symbol fill">qr_code_2</span>
              </div>

              <div className="scan-cam-laser">
                <span className="scan-cam-laser-dot"></span>
              </div>
            </div>
          </div>

          <div className="scan-cam-distance" style={{ zIndex: 2, position: 'relative' }}>
            <span className="scan-cam-symbol" style={{ fontSize: '16px' }}>straighten</span>
            <span>المسافة المثالية: 15 - 30 سم</span>
          </div>
        </main>

        {/* الشريط السفلي */}
        <footer className="scan-cam-footer">
          <div className="scan-cam-sheet-handle"></div>

          <div className="scan-cam-summary">
            <div className="scan-cam-summary-info">
              <span className="scan-cam-summary-icon">
                <span className="scan-cam-symbol fill" style={{ fontSize: '18px' }}>check_circle</span>
              </span>
              <span className="scan-cam-summary-text">جاهز للمسح</span>
            </div>

            <div className="scan-cam-count">
              <span className="scan-cam-count-num">{scanCount}</span>
              <span className="scan-cam-count-unit">طالب</span>
            </div>
          </div>

          <div className="scan-cam-actions">
            <button type="button" className="scan-cam-manual-btn" onClick={() => setIsModalOpen(true)}>
              <span className="scan-cam-symbol">keyboard</span>
              <span>إدخال يدوي لرقم التذكرة أو الرقم الجامعي</span>
            </button>

            <button
              type="button"
              className={`scan-cam-round-btn ${isTorchActive ? 'on' : 'primary'}`}
              aria-label="تشغيل الإضاءة"
              aria-pressed={isTorchActive}
              title="تشغيل الإضاءة"
              onClick={toggleTorch}
            >
              <span className="scan-cam-symbol">lightbulb</span>
            </button>

            <button
              type="button"
              className="scan-cam-round-btn soft"
              aria-label={isMuted ? 'تشغيل التنبيه الصوتي' : 'كتم التنبيه الصوتي'}
              title="تنبيه صوتي"
              onClick={toggleMute}
            >
              <span className="scan-cam-symbol">{isMuted ? 'volume_off' : 'volume_up'}</span>
            </button>
          </div>

          <p className="scan-cam-supervisor">{eventInfo?.name ? `حفل تخرج جامعة حمص — ${eventInfo.name}` : 'بوابة المسح الميداني'}</p>
        </footer>

        {/* نافذة الإدخال اليدوي */}
        {isModalOpen && (
          <div
            className="scan-cam-modal-backdrop"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div className="scan-cam-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="scan-cam-modal-title">
              <div className="scan-cam-modal-head">
                <div className="scan-cam-modal-title-row">
                  <span className="scan-cam-symbol scan-cam-orange" style={{ fontSize: '24px' }}>dialpad</span>
                  <h3 id="scan-cam-modal-title">إدخال رقم الاعتماد المباشر</h3>
                </div>
                <button type="button" className="scan-cam-modal-close" aria-label="إغلاق" onClick={closeModal}>
                  <span className="scan-cam-symbol" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>

              <p className="scan-cam-modal-desc">
                أدخل الرقم الأكاديمي للخريج المطبوع أسفل الرمز الشريطي للتحقق الفوري.
              </p>

              <form onSubmit={handleManualSubmit} noValidate>
                <input
                  type="text"
                  dir="ltr"
                  autoFocus
                  autoComplete="off"
                  className={`scan-cam-input ${manualError ? 'error' : ''}`}
                  placeholder="مثال: ENG-44-8902"
                  value={manualCode}
                  aria-invalid={!!manualError}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    if (manualError) setManualError('');
                  }}
                />
                {manualError && (
                  <p className="scan-cam-error-text" role="alert">
                    {manualError}
                  </p>
                )}

                <div className="scan-cam-modal-buttons">
                  <button type="submit" className="scan-cam-btn-primary">
                    <span className="scan-cam-symbol" style={{ fontSize: '18px' }}>verified</span>
                    <span>تأكيد الحضور</span>
                  </button>
                  <button type="button" className="scan-cam-btn-soft" onClick={closeModal}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* إشعار قبول التذكرة */}
        <div className={`scan-cam-toast ${showToast ? 'show' : ''}`} role="status" aria-live="polite">
          <div className="scan-cam-toast-icon">
            <span className="scan-cam-symbol" style={{ fontSize: '22px' }}>check</span>
          </div>
          <div>
            <h4>تنبيه النظام</h4>
            <p>تم مسح التذكرة</p>
          </div>
        </div>
      </div>
    </div>
  );
}