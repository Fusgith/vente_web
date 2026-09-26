import { useEffect, useRef, useState } from 'react';

import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
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
}

/**
 * The camera in a sheet, for burst scanning; each new code goes to `onCode`. The frame's band sits
 * behind the modal scrim, so what the last scan did is repeated here, over the camera.
 */
export function BarcodeScanner({ onCode, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [Detector] = useState(barcodeDetector);
  const [denied, setDenied] = useState(false);
  const said = useStatusLine().message;
  // Only what the scans said, not the sentence already in the band when the sheet opened.
  const [openedAt] = useState(said?.seq ?? 0);
  const status = said && said.seq > openedAt ? said : null;

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
    <Sheet
      title={labels.sales.scanTitle}
      closeLabel={labels.sales.closeScan}
      onClose={onClose}
      width="md"
      bodyClassName="flex flex-col items-center gap-4"
    >
      {Detector && (
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] max-h-[50dvh] w-full rounded-key bg-ink object-cover"
        />
      )}
      <p className="flex items-start gap-2.5 self-stretch text-16">
        <Icon name={message ? 'alert' : 'scan'} className="size-6 text-ink-2" />
        <span>{message ?? labels.sales.scanHint}</span>
      </p>
      {/* Always in the page, even empty: a live region that appears with its text is not heard. */}
      <p role="status" className="self-stretch">
        {status && (
          <span
            className={`flex min-h-12 items-center rounded-control px-4 py-3 text-16 font-semibold ${
              status.tone === 'error' ? 'bg-madder-soft text-madder' : 'bg-indigo-soft text-ink'
            }`}
          >
            {status.text}
          </span>
        )}
      </p>
    </Sheet>
  );
}
