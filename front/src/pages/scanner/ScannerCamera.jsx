import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import '../../style/ScannerCamera.css';
import unionLogo from '../../assets/only-logo.png';
import { request } from '../../api/client';
import { getScannerToken, hasScannerSession, clearScannerSession, getScannerEvent } from '../../api/session';
import ScanSuccessResult from './ScanSuccessResult';
import ScanErrorResult from './ScanErrorResult';
import WrongCeremoniesWarning from './WrongCeremoniesWarning';
import { eventTitle, formatEventDate } from '../../utils/eventLabel';
import { CEREMONY_TITLE } from '../../config/brand';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ScannerCamera({ onLogout }) {
  const navigate = useNavigate();
  const eventInfo = getScannerEvent();
  const eventName = eventTitle(eventInfo) || 'بوابة المسح الميداني';
  const eventDate = formatEventDate(eventInfo?.event_date);

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
  const handleScanRef = useRef(null);
  const audioCtxRef = useRef(null);
  // يضمن أن أي تشغيل جديد ينتظر انتهاء إيقاف الكاميرا السابقة (مهم مع StrictMode)
  const cleanupPromiseRef = useRef(Promise.resolve());
  const errorTimerRef = useRef(null);

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

  /* AudioContext واحد مشترك بدل إنشاء واحد جديد مع كل مسحة */
  useEffect(() => {
    return () => {
      try {
        audioCtxRef.current?.close?.();
      } catch {}
      audioCtxRef.current = null;
    };
  }, []);

  const playBeep = useCallback((success = true) => {
    if (isMuted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

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
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
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
      console.error('Torch error:', err);
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
    if (!hasScannerSession()) {
      clearScannerSession();
      navigate('/scanner', { replace: true });
    }
  }, [navigate]);

  const pauseCamera = () => {
    const qr = html5QrCodeRef.current;
    if (qr && qr.isScanning) {
      try { qr.pause(true); } catch {}
    }
  };

  const resumeCamera = () => {
    const qr = html5QrCodeRef.current;
    if (qr) {
      try { qr.resume(); } catch {}
    }
  };

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

    // نوقف الكاميرا فوراً عند اكتشاف الرمز بدل انتظار رد السيرفر
    pauseCamera();

    try {
      const data = await request('/api/scanner/scan', {
        method: 'POST',
        body: { code: trimmed },
        token: getScannerToken(),
      });

      if (data.decision === 'SUCCESS') {
        playBeep(true);
        setScanCount((prev) => prev + 1);
        setActiveResult({ result: data, type: 'success' });
      } else if (data.decision === 'WRONG_EVENT') {
        playBeep(false);
        setActiveResult({ result: data, type: 'wrong_ceremony' });
      } else {
        playBeep(false);
        let errorType = 'generic_error';
        if (data.decision === 'ALREADY_USED') errorType = 'already_used';
        else if (data.decision === 'NOT_ACTIVATED') errorType = 'companion_error';
        else if (data.decision === 'NOT_FOUND') errorType = 'not_found';
        else if (data.decision === 'TICKET_NOT_CONFIRMED') errorType = 'ticket_not_confirmed';
        setActiveResult({ result: data, type: 'error', errorType });
      }
    } catch (err) {
      playBeep(false);
      // خطأ اتصال: نعيد تشغيل الكاميرا ليتمكن المستخدم من إعادة المحاولة
      resumeCamera();
      setCameraError(err.message || 'حدث خطأ في الاتصال بالخادم.');
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setCameraError(''), 4000);
    } finally {
      isScanningRef.current = false;
    }
  }, [playBeep]);

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  useEffect(() => () => clearTimeout(errorTimerRef.current), []);

  /* Camera initialization with safe start/stop */
  useEffect(() => {
    let isMounted = true;
    let html5QrCode = null;
    let startPromise = null;

    const buildConfig = (facingMode) => ({
      fps: 10,
      // يطابق حجم المربع المرسوم (min(240px, 64vw))
      qrbox: (w, h) => {
        const size = Math.min(240, Math.floor(Math.min(w, h) * 0.64));
        return { width: size, height: size };
      },
      disableFlip: true,
      videoConstraints: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    const runStart = (facingMode) => {
      startPromise = html5QrCode.start(
        { facingMode },
        buildConfig(facingMode),
        (decodedText) => {
          if (isMounted && handleScanRef.current) {
            handleScanRef.current(decodedText);
          }
        },
        () => {}
      );
      return startPromise;
    };

    const startScanner = async () => {
      // ننتظر انتهاء إيقاف الكاميرا السابقة (إن وجدت) قبل إنشاء instance جديد
      await cleanupPromiseRef.current;
      if (!isMounted) return;

      html5QrCode = new Html5Qrcode('qr-reader', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      html5QrCodeRef.current = html5QrCode;

      try {
        setCameraError('');
        await runStart('environment');
        if (!isMounted) return;

        try {
          const caps = html5QrCode.getRunningTrackCapabilities?.();
          if (caps && caps.torch) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err) {
        if (!isMounted) return;
        const errName = err?.name || err?.message || '';
        if (errName.includes('OverconstrainedError') || errName.includes('NotFoundError')) {
          try {
            await runStart('user');
          } catch (fallbackErr) {
            console.error('Camera fallback failed:', fallbackErr);
            if (isMounted) {
              setCameraError('تعذّر تشغيل الكاميرا: ' + (fallbackErr.message || err.message));
            }
          }
        } else if (errName.includes('NotAllowedError')) {
          setCameraError('تم رفض إذن الوصول للكاميرا. يرجى السماح بصلاحيات الكاميرا من إعدادات المتصفح.');
        } else if (errName.includes('NotReadableError')) {
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              await runStart('environment');
            } catch {
              if (isMounted) {
                setCameraError('الكاميرا قيد الاستخدام من قبل تطبيق آخر.');
              }
            }
          }, 500);
        } else {
          setCameraError('تعذّر تشغيل الكاميرا: ' + (err.message || 'خطأ غير معروف'));
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      const instance = html5QrCode;
      const pending = startPromise;

      cleanupPromiseRef.current = (async () => {
        if (pending) {
          try { await pending; } catch {}
        }
        if (instance) {
          try {
            if (instance.isScanning) {
              await instance.stop();
            }
            await instance.clear();
          } catch {}
        }
        if (html5QrCodeRef.current === instance) {
          html5QrCodeRef.current = null;
        }
      })();
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
    resumeCamera();
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
              {eventDate && <p className="scan-cam-header-sub scan-cam-header-date" dir="ltr">{eventDate}</p>}
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
            <span className="scan-cam-status-text">{eventInfo?.name ? eventName : 'جاهز للمسح'}</span>
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

          <p className="scan-cam-supervisor">{eventInfo?.name ? `${CEREMONY_TITLE} — ${eventName}` : 'بوابة المسح الميداني'}</p>
        </footer>

        {/* Result Overlay Sheet */}
        {activeResult && (
          <div className={`scan-cam-result-overlay scan-cam-result-overlay--${activeResult.type}`}>
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