/**
 * 웹캠 기반 오프라인 QR 코드 스캐너 모듈
 * - 브라우저 내장 BarcodeDetector API (고속 하드웨어 가속) 우선 사용
 * - 오프라인 jsQR 라이브러리 fallback 지원으로 모든 브라우저에서 100% 작동
 * - 지정된 키워드(기본: "행사참여완료") 인식 시 콜백 실행
 */
class QRScannerEngine {
    constructor(options = {}) {
        this.options = {
            targetKeyword: '행사참여완료',
            cooldownSeconds: 6,
            onRecognized: (text) => {},
            onError: (err) => {},
            onStatusChange: (status) => {},
            ...options
        };

        this.video = null;
        this.stream = null;
        this.isScanning = false;
        this.animId = null;
        this.lastScanTime = 0;
        this.barcodeDetector = null;

        // Fallback용 오프스크린 캔버스
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.initDetector();
    }

    async initDetector() {
        if ('BarcodeDetector' in window) {
            try {
                const formats = await BarcodeDetector.getSupportedFormats();
                if (formats.includes('qr_code')) {
                    this.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
                    console.log('✅ Native BarcodeDetector (QR) 활성화');
                }
            } catch (e) {
                console.warn('Native BarcodeDetector 초기화 실패, jsQR 모드로 전환:', e);
            }
        }
    }

    /**
     * 카메라 시작
     */
    async start(videoElement) {
        if (this.isScanning) return;
        this.video = videoElement;

        try {
            this.options.onStatusChange('카메라 연결 중...');
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            await this.video.play();

            this.isScanning = true;
            this.options.onStatusChange('QR 코드를 카메라에 비춰주세요');
            this.scanLoop();
        } catch (err) {
            console.error('카메라 시작 실패:', err);
            this.options.onError(err);
            this.options.onStatusChange('카메라 연결 실패 (권한을 확인해주세요)');
            this.stop();
        }
    }

    /**
     * 실시간 감지 루프
     */
    async scanLoop() {
        if (!this.isScanning || !this.video) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            try {
                let detectedText = null;

                // 1. 브라우저 내장 BarcodeDetector 우선 시도
                if (this.barcodeDetector) {
                    const barcodes = await this.barcodeDetector.detect(this.video);
                    if (barcodes.length > 0) {
                        detectedText = barcodes[0].rawValue;
                    }
                }

                // 2. jsQR Fallback 시도 (내장 API 미지원 또는 인식 실패 시)
                if (!detectedText && window.jsQR) {
                    const w = 320;
                    const h = Math.round((this.video.videoHeight / this.video.videoWidth) * w) || 240;
                    if (this.canvas.width !== w || this.canvas.height !== h) {
                        this.canvas.width = w;
                        this.canvas.height = h;
                    }
                    this.ctx.drawImage(this.video, 0, 0, w, h);
                    const imgData = this.ctx.getImageData(0, 0, w, h);
                    const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
                        inversionAttempts: 'dontInvert'
                    });
                    if (code && code.data) {
                        detectedText = code.data;
                    }
                }

                // 3. 텍스트 검증 및 처리
                if (detectedText) {
                    this.handleDetection(detectedText);
                }
            } catch (e) {
                // 프레임 감지 일시적 오류 무시
            }
        }

        // 초당 약 20회 스캔 (성능 최적화)
        setTimeout(() => {
            if (this.isScanning) {
                this.animId = requestAnimationFrame(() => this.scanLoop());
            }
        }, 50);
    }

    /**
     * QR 코드 내용 분석 및 키워드 검증
     */
    handleDetection(text) {
        const now = Date.now();
        // 쿨다운 검사
        if (now - this.lastScanTime < this.options.cooldownSeconds * 1000) {
            return;
        }

        console.log('📷 QR 코드 감지됨:', text);
        const target = this.options.targetKeyword.trim();

        // 키워드 일치 확인 ("행사참여완료" 포함 여부)
        if (text.includes(target)) {
            this.lastScanTime = now;
            this.options.onStatusChange(`🎉 인식 성공: "${target}" 확인!`);
            this.options.onRecognized(text);
        } else {
            this.options.onStatusChange(`⚠️ 유효하지 않은 QR 코드입니다: "${text.slice(0, 20)}..."`);
        }
    }

    /**
     * 카메라 중지
     */
    stop() {
        this.isScanning = false;
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.options.onStatusChange('카메라 종료됨');
    }

    /**
     * 수동/가상 시뮬레이션 트리거 (카메라 없이 테스트용)
     */
    simulateScan(text = '행사참여완료') {
        this.handleDetection(text);
    }
}

window.QRScannerEngine = QRScannerEngine;
