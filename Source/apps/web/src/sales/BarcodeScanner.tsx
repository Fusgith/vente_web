import { useEffect, useRef, useState } from 'react';

import { labels } from '../labels.js';
import { createScanFilter } from './scan-filter.js';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorClass = new () => BarcodeDetectorInstance;

/** Frames read per second: enough for a burst, light on the tablet's battery. */
const SCAN_INTERVAL_MS = 200;
/** Out of view this long, the same barcode counts again (RG-DEV-06 §3). */
const SAME_CODE_GAP_MS = 1200;

/**
 * Chrome for Android ships the Shape Detection API: barcodes are read natively, with no library
 * to download (T-021). Elsewhere, the field still takes a Bluetooth/USB scanner or typed codes.
 */
function barcodeDetector(): BarcodeDetectorClass | null {
  const { BarcodeDetector } = globalThis as { BarcodeDetector?: BarcodeDetectorClass };
  return BarcodeDetector && 'mediaDevices' in navigator ? BarcodeDetector : null;
}

interface BarcodeScannerProps {
  onCode: (code: string) => void;
  onClose: () => void;
  /** What the last scan did, shown over the camera. */
  notice: { ok: boolean; text: string } | null;
}

/** Full-screen camera for burst scanning; each new code goes to `onCode`. */
export function BarcodeScanner({ onCode, onClose, notice }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [Detector] = useState(barcodeDetector);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!Detector || !video) return;
    const detector = new Detector();
    const accept = createScanFilter(SAME_CODE_GAP_MS);
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    let reading = false;

    const readFrame = () => {
      if (reading || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      reading = true;
      detector
        .detect(video)
        .then((codes) => {
          const now = performance.now();
          for (const { rawValue } of codes) {
            if (!stopped && rawValue && accept(rawValue, now)) onCodeRef.current(rawValue);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          reading = false;
        });
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        // Closed before the camera answered: release it at once.
        if (stopped) return media.getTracks().forEach((track) => track.stop());
        stream = media;
        video.srcObject = media;
        await video.play();
        timer = window.setInterval(readFrame, SCAN_INTERVAL_MS);
      })
      .catch(() => {
        if (!stopped) setDenied(true);
      });

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [Detector]);

  const message = !Detector
    ? labels.sales.scanUnsupported
    : denied
      ? labels.sales.cameraDenied
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.sales.scanTitle}
      className="fixed inset-0 z-30 flex flex-col items-center gap-4 bg-slate-950/95 p-4 text-white"
    >
      {Detector && (
        <video
          ref={videoRef}
          muted
          playsInline
          className="max-h-[60dvh] w-full max-w-xl rounded-xl bg-black object-cover"
        />
      )}
      <p className="max-w-xl text-center text-lg">{message ?? labels.sales.scanHint}</p>
      {notice && (
        <p
          role="status"
          className={`max-w-xl rounded-lg px-4 py-2 text-center text-lg font-semibold ${
            notice.ok ? 'bg-teal-600' : 'bg-red-700'
          }`}
        >
          {notice.text}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-auto min-h-14 w-full max-w-xl rounded-xl bg-white text-lg font-bold text-slate-900"
      >
        {labels.sales.closeScan}
      </button>
    </div>
  );
}
