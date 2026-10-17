import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import '../../style/ScannerCamera.css';
import unionLogo from '../../assets/only-logo.png';
import { request } from '../../api/client';
import { getScannerToken, isScannerTokenExpired, clearScannerSession, getScannerEvent } from '../../api/session';
import ScanSuccessResult from './ScanSuccessResult';
import ScanErrorResult from './ScanErrorResult';
import WrongCeremoniesWarning from './WrongCeremoniesWarning';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ScannerCamera({ onLogout }) {
  const navigate = useNavigate();
  const eventInfo = getScannerEvent();
  const eventName = eventInfo?.name || 'ماسح التذاكر';

  const [isTorchActive, setIsTorchActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return sessionStorage.getItem('grad.scanner.muted') === 'true';
    } catch {
      return false;
    }
  });
  const [scanCount, setScanCount] = useState(() => {
    try {
      const raw = sessionStorage.getItem('grad.scanner.count');
      return raw ? Number(raw) : 0;
    } catch {
      return 0;
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');

  const [cameraError, setCameraError] = useState('');
  const [activeResult, setActiveResult] = useState(null);

  const lastCodeRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const isScanningRef = useRef(false);
  const html5QrCodeRef = useRef(null);
  const startPromiseRef = useRef(null);
  const isStartingRef = useRef(false);
  const handleScanRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('grad.scanner.muted', String(isMuted));
    } catch {}
  }, [isMuted]);

  useEffect(() => {
    try {
      sessionStorage.setItem('grad.scanner.count', String(scanCount));
    } catch {}
  }, [scanCount]);

  const toggleMute = () => setIsMuted((prev) => !prev);

  const playBeep = useCallback((success = true) => {
    if (isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = success ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(success ? 880 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }, [isMuted]);

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const next = !isTorchActive;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: next }],
      });
      setIsTorchActive(next);
    } catch (err) {
      console.error("Torch error:", err);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setManualCode('');
    setManualError('');
  };

  const showHttpsWarning = useMemo(() => {
    return !(
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }, []);

  /* Token guard */
  useEffect(() => {
    if (!getScannerToken() || isScannerTokenExpired()) {
      clearScannerSession();
      navigate('/scanner', { replace: true });
    }
  }, [navigate]);

  const handleScan = useCallback(async (code) => {
    const trimmed = code?.trim();
    if (!trimmed) return;

    const now = Date.now();
    // 3-second throttle for the same code only
    if (isScanningRef.current || (trimmed === lastCodeRef.current && now - lastScanTimeRef.current < 3000)) {
      return;
    }

    isScanningRef.current = true;
    lastCodeRef.current = trimmed;
    lastScanTimeRef.current = now;

    try {
      const data = await request('/api/scanner/scan', {
        method: 'POST',
        body: { code: trimmed },
        token: getScannerToken(),
      });

      if (data.decision === 'SUCCESS') {
        playBeep(true);
        setScanCount((prev) => prev + 1);
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          try { html5QrCodeRef.current.pause(true); } catch {}
        }
        setActiveResult({ result: data, type: 'success' });
      } else if (data.decision === 'WRONG_EVENT') {
        playBeep(false);
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          try { html5QrCodeRef.current.pause(true); } catch {}
        }
        setActiveResult({ result: data, type: 'wrong_ceremony' });
      } else {
        playBeep(false);
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          try { html5QrCodeRef.current.pause(true); } catch {}
        }
        let errorType = 'generic_error';
        if (data.decision === 'ALREADY_USED') errorType = 'already_used';
        else if (data.decision === 'NOT_ACTIVATED') errorType = 'companion_error';
        else if (data.decision === 'NOT_FOUND') errorType = 'not_found';
        else if (data.decision === 'TICKET_NOT_CONFIRMED') errorType = 'ticket_not_confirmed';
        setActiveResult({ result: data, type: 'error', errorType });
      }
    } catch (err) {
      playBeep(false);
      setCameraError(err.message || 'حدث خطأ في الاتصال بالخادم.');
    } finally {
      isScanningRef.current = false;
    }
  }, [playBeep]);

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  /* Camera initialization with safe start/stop */
  useEffect(() => {
    let isMounted = true;
    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCodeRef.current = html5QrCode;

    const startScanner = async () => {
      if (isStartingRef.current) return;
      isStartingRef.current = true;

      const runStart = async (constraints) => {
        return html5QrCode.start(
          constraints,
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            if (isMounted && handleScanRef.current) {
              handleScanRef.current(decodedText);
            }
          },
          () => {}
        );
      };

      try {
        setCameraError('');
        startPromiseRef.current = runStart({ facingMode: "environment" });
        await startPromiseRef.current;
        
        try {
          const track = html5QrCode.getRunningTrackCapabilities?.();
          if (track && track.torch) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err) {
        const errName = err?.name || err?.message || '';
        if (errName.includes('OverconstrainedError') || errName.includes('NotFoundError')) {
          try {
            startPromiseRef.current = runStart({ facingMode: "user" });
            await startPromiseRef.current;
          } catch (fallbackErr) {
            console.error("Camera fallback failed:", fallbackErr);
            if (isMounted) {
              setCameraError('تعذّر تشغيل الكاميرا: ' + (fallbackErr.message || err.message));
            }
          }
        } else if (errName.includes('NotAllowedError')) {
          if (isMounted) {
            setCameraError('تم رفض إذن الوصول للكاميرا. يرجى السماح بصلاحيات الكاميرا من إعدادات المتصفح.');
          }
        } else if (errName.includes('NotReadableError')) {
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              startPromiseRef.current = runStart({ facingMode: "environment" });
              await startPromiseRef.current;
            } catch {
              if (isMounted) {
                setCameraError('الكاميرا قيد الاستخدام من قبل تطبيق آخر.');
              }
            }
          }, 500);
        } else {
          if (isMounted) {
            setCameraError('تعذّر تشغيل الكاميرا: ' + (err.message || 'خطأ غير معروف'));
          }
        }
      } finally {
        isStartingRef.current = false;
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      const cleanup = async () => {
        if (startPromiseRef.current) {
          try {
            await startPromiseRef.current;
          } catch {}
        }
        if (html5QrCodeRef.current) {
          try {
            if (html5QrCodeRef.current.isScanning) {
              await html5QrCodeRef.current.stop();
            }
            await html5QrCodeRef.current.clear();
          } catch {}
        }
      };
      cleanup();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await request('/api/scanner/auth/logout', {
        method: 'POST',
        token: getScannerToken(),
      });
    } catch {}
    clearScannerSession();
    if (onLogout) {
      onLogout();
    } else {
      navigate('/scanner', { replace: true });
    }
  };

  /* Escape closes manual modal */
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
      setManualError('أدخل رمز التذكرة (UUID)');
      return;
    }
    if (!UUID_REGEX.test(code)) {
      setManualError('صيغة الرمز غير صحيحة (يجب أن يكون UUID صالحاً)');
      return;
    }

    closeModal();
    if (handleScanRef.current) {
      handleScanRef.current(code);
    }
  };

  const handleNextScan = () => {
    setActiveResult(null);
    lastCodeRef.current = '';
    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.resume();
      } catch {}
    }
  };

  return (
    <div className="scan-cam-app-container">
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
            {hasTorch && (
              <button
                type="button"
                className={`scan-cam-icon-btn ${isTorchActive ? 'active' : ''}`}
                aria-label="تشغيل الفلاش"
                aria-pressed={isTorchActive}
                onClick={toggleTorch}
              >
                <span className="scan-cam-symbol">flash_on</span>
              </button>
            )}
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
        <main className="scan-cam-viewfinder-zone">
          <div id="qr-reader"></div>
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

          <div className="scan-cam-prompt-card">
            <div className="scan-cam-prompt-pill">
              <span className="scan-cam-symbol scan-cam-accent">center_focus_strong</span>
              <p>وجّه الكاميرا نحو رمز QR على بطاقة الخريج</p>
            </div>
          </div>

          {/* مربع التوجيه (1:1) */}
          <div className="scan-cam-reticle-box">
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

          <div className="scan-cam-distance">
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
              <span className="scan-cam-summary-text">جاهز لقراءة التذكرة</span>
            </div>

            <div className="scan-cam-count">
              <span className="scan-cam-count-num">{scanCount}</span>
              <span className="scan-cam-count-unit">ممسوح</span>
            </div>
          </div>

          <div className="scan-cam-actions">
            <button type="button" className="scan-cam-manual-btn" onClick={() => setIsModalOpen(true)}>
              <span className="scan-cam-symbol">keyboard</span>
              <span>إدخال يدوي لرمز التذكرة (UUID)</span>
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

        {/* Result Overlay Sheet */}
        {activeResult && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'var(--sc-cream)' }}>
            {activeResult.type === 'success' && (
              <ScanSuccessResult
                result={activeResult.result}
                onNextScan={handleNextScan}
              />
            )}
            {activeResult.type === 'wrong_ceremony' && (
              <WrongCeremoniesWarning
                result={activeResult.result}
                onNextScan={handleNextScan}
              />
            )}
            {activeResult.type === 'error' && (
              <ScanErrorResult
                result={activeResult.result}
                errorType={activeResult.errorType}
                onNextScan={handleNextScan}
              />
            )}
          </div>
        )}

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
                  <h3 id="scan-cam-modal-title">إدخال رمز التذكرة المباشر</h3>
                </div>
                <button type="button" className="scan-cam-modal-close" aria-label="إغلاق" onClick={closeModal}>
                  <span className="scan-cam-symbol" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>

              <p className="scan-cam-modal-desc">
                أدخل رمز التذكرة الفريد (UUID) المطبوع أسفل الرمز الشريطي للتحقق الفوري.
              </p>

              <form onSubmit={handleManualSubmit} noValidate>
                <input
                  type="text"
                  dir="ltr"
                  autoFocus
                  autoComplete="off"
                  className={`scan-cam-input ${manualError ? 'error' : ''}`}
                  placeholder="مثال: c0293b1d-8a4e-4f2b-9e11-123456789abc"
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
      </div>
    </div>
  );
}
