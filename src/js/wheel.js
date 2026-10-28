/**
 * Android Material Design 3 준수 초고속 60~120 FPS 룰렛 엔진
 * - 오프스크린 캔버스 비트맵 프리캐싱(Pre-caching) 적용: 회전 프레임당 단 1회의 blit 연산으로 저사양 PC에서도 절대 끊기지 않는 60fps 보장
 * - 판 사이즈 균등 분할: 모든 경품이 동일한 각도로 표시되어 잔여 수량을 육안으로 유추할 수 없음
 * - 경품 잔여 수량 텍스트 숨김: 경품 명칭만 크고 선명하게 표시
 * - 밝은 파스텔 머티리얼 톤(Bright Pastel Material Palette) 기본 적용
 */
class PrizeWheel {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.options = {
            pointerAngle: 1.5 * Math.PI, // 12시 방향 (상단)
            onSpinStart: () => {},
            onSpinEnd: (prize) => {},
            onTick: () => {},
            ...options
        };

        this.prizes = [];
        this.activePrizes = [];
        this.slices = [];

        this.currentAngle = 0;
        this.isSpinning = false;
        this.animFrameId = null;

        // 스프링-댐퍼 햅틱 포인터 물리
        this.pointerWobble = 0;
        this.pointerVelocity = 0;
        this.lastSliceIndex = -1;
        this.lastTickTimestamp = 0;

        // 오프스크린 프리캐시 캔버스 (60fps 무손실 회전의 핵심)
        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.cacheValid = false;

        // 화사하고 밝은 파스텔 계열 머티리얼 3 컬러 팔레트
        this.brightPastelPalette = [
            '#FDE047', // 밝은 레몬 옐로우 (Sunny Lemon)
            '#7DD3FC', // 화사한 스카이 블루 (Bright Sky)
            '#86EFAC', // 싱그러운 민트 에메랄드 (Fresh Mint)
            '#C4B5FD', // 은은한 라벤더 바이올렛 (Soft Lavender)
            '#FDBA74', // 부드러운 살구 오렌지 (Warm Apricot)
            '#F9A8D4', // 달콤한 벚꽃 로즈 (Sweet Rose)
            '#99F6E4', // 청량한 아쿠아 틸 (Bright Aqua)
            '#FF9E9E', // 산뜻한 코랄 피치 (Coral Peach)
            '#CBD5E1'  // 차분한 라이트 슬레이트 (Light Slate / 꽝 전용)
        ];

        this.initCanvas();
        window.addEventListener('resize', () => {
            this.initCanvas();
            this.draw();
        });
    }

    initCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = this.canvas.getBoundingClientRect();
        const size = Math.min(rect.width || 560, rect.height || 560);

        this.canvas.width = Math.round(size * dpr);
        this.canvas.height = Math.round(size * dpr);

        this.ctx.resetTransform?.();
        this.ctx.scale(dpr, dpr);

        this.center = size / 2;
        this.radius = size / 2 - 20;

        // 오프스크린 캐시 캔버스 규격 동기화
        this.cacheCanvas.width = this.canvas.width;
        this.cacheCanvas.height = this.canvas.height;
        this.cacheCtx.resetTransform?.();
        this.cacheCtx.scale(dpr, dpr);

        this.invalidateCache();
    }

    invalidateCache() {
        this.cacheValid = false;
    }

    /**
     * 경품 목록 및 설정 업데이트
     */
    setPrizes(prizes, settings = {}) {
        this.prizes = prizes;
        this.settings = {
            probabilityMode: 'proportional', // 내부 추첨 확률 방식 (비례 or 균등)
            hideOutOfStock: true,
            maxVisibleSlices: 4,             // 돌림판 동시 노출 경품 수 제한 (0: 제한 없음)
            autoRefillSlots: true,           // 품절 시 대기 경품으로 자동 보충
            ...settings
        };

        const limit = parseInt(this.settings.maxVisibleSlices) || 0;
        const enabledPrizes = this.prizes.filter(p => p.enabled !== false);
        const inStockPrizes = enabledPrizes.filter(p => p.count > 0);

        if (limit > 0 && inStockPrizes.length > limit) {
            // 1. 기존 activePrizeIds 중 아직 유효(enabled && count > 0)한 것 유지
            let currentActive = (this.activePrizeIds || []).filter(id => {
                return inStockPrizes.some(p => p.id === id);
            });

            // 2. 만약 자리가 부족하면 대기 중인 재고 보유 경품으로 빈자리 채우기 (자동 리필)
            if (currentActive.length < limit) {
                for (const p of inStockPrizes) {
                    if (!currentActive.includes(p.id)) {
                        currentActive.push(p.id);
                        if (currentActive.length >= limit) break;
                    }
                }
            }

            // 3. 만약 설정값이 작아져서 초과된 경우
            if (currentActive.length > limit) {
                currentActive = currentActive.slice(0, limit);
            }

            this.activePrizeIds = currentActive;
            this.activePrizes = currentActive.map(id => this.prizes.find(p => p.id === id)).filter(Boolean);
        } else {
            // 제한이 없거나 잔여 종류 수가 제한 이하인 경우
            this.activePrizes = this.settings.hideOutOfStock ? inStockPrizes : enabledPrizes;
            this.activePrizeIds = this.activePrizes.map(p => p.id);
        }

        this.calculateSlices();
        this.draw();
    }

    /**
     * 현재 돌림판에 노출 중인 경품 ID 목록 반환
     */
    getActivePrizeIds() {
        return this.activePrizeIds || [];
    }

    /**
     * 각 경품의 섹터(부채꼴) 각도 계산
     * - "판 사이즈는 동일하게!": 모든 섹터의 각도를 100% 동일(2*PI / N)하게 분할하여 남은 수량을 파악할 수 없도록 보장
     */
    calculateSlices() {
        this.slices = [];
        if (this.activePrizes.length === 0) {
            this.invalidateCache();
            return;
        }

        const totalAngle = Math.PI * 2;
        // 시각적으로 모든 칸의 크기는 균등 분할
        const sweep = totalAngle / this.activePrizes.length;

        let currentStart = 0;
        this.activePrizes.forEach((prize, idx) => {
            const end = currentStart + sweep;
            const sliceColor = prize.color || this.brightPastelPalette[idx % this.brightPastelPalette.length];

            this.slices.push({
                prize,
                startAngle: currentStart,
                endAngle: end,
                sweepAngle: sweep,
                color: sliceColor
            });
            currentStart = end;
        });

        this.invalidateCache();
    }

    /**
     * 12시 포인터가 가리키고 있는 섹터 탐색
     */
    getCurrentSlice() {
        if (this.slices.length === 0) return null;

        const twoPi = Math.PI * 2;
        let localAngle = (this.options.pointerAngle - this.currentAngle) % twoPi;
        if (localAngle < 0) localAngle += twoPi;

        for (let i = 0; i < this.slices.length; i++) {
            const s = this.slices[i];
            if (localAngle >= s.startAngle && localAngle < s.endAngle) {
                return { slice: s, index: i };
            }
        }
        return { slice: this.slices[0], index: 0 };
    }

    /**
     * 당첨 대상 경품 선정
     * - 화면 판 크기는 동일하지만, 실제 추첨 확률은 설정에 따라 수량 비례(Proportional)로 공정하게 작동
     */
    pickWinner() {
        if (this.slices.length === 0) return null;

        if (this.settings.probabilityMode === 'proportional') {
            const totalCount = this.activePrizes.reduce((sum, p) => sum + Math.max(0, p.count), 0);
            if (totalCount <= 0) return this.slices[0];

            let rand = Math.random() * totalCount;
            for (const s of this.slices) {
                if (rand < s.prize.count) {
                    return s;
                }
                rand -= s.prize.count;
            }
            return this.slices[this.slices.length - 1];
        } else {
            // 균등 확률 모드
            const randIdx = Math.floor(Math.random() * this.slices.length);
            return this.slices[randIdx];
        }
    }

    /**
     * Material 3 Emphasized Spin Motion 물리 곡선
     */
    static materialEasing(t, accelRatio = 0.15, power = 2.5) {
        t = Math.max(0, Math.min(1, t));
        const S = (2 * accelRatio / Math.PI) + (1 - accelRatio) / (power + 1);
        if (t <= accelRatio) {
            return ((2 * accelRatio / Math.PI) * (1 - Math.cos(Math.PI * t / (2 * accelRatio)))) / S;
        } else {
            const tau = (t - accelRatio) / (1 - accelRatio);
            return ((2 * accelRatio / Math.PI) + ((1 - accelRatio) / (power + 1)) * (1 - Math.pow(1 - tau, power + 1))) / S;
        }
    }

    /**
     * 회전 시작
     */
    spin(durationSeconds = 0.8) {
        if (this.isSpinning || this.slices.length === 0) return;

        const targetSlice = this.pickWinner();
        if (!targetSlice) return;

        this.isSpinning = true;
        this.options.onSpinStart();

        // 목표 섹터 중앙(안전마진 15%)에 멈추도록 오프셋 계산
        const margin = targetSlice.sweepAngle * 0.15;
        const randomInSlice = margin + Math.random() * (targetSlice.sweepAngle - margin * 2);
        const targetLocalAngle = targetSlice.startAngle + randomInSlice;

        const twoPi = Math.PI * 2;
        const currentMod = this.currentAngle % twoPi;

        // 회전 지속시간에 따른 회전 바퀴 수 적응형 계산 (1초 이내일 때 2~3바퀴 경쾌하고 즉각적인 스핀)
        let baseRounds;
        if (durationSeconds <= 1.2) {
            baseRounds = 2 + Math.floor(Math.random() * 2); // 1초 이내: 2~3바퀴 즉시 결과 도출
        } else {
            baseRounds = Math.min(8, Math.max(3, Math.round(durationSeconds * 1.5))) + Math.floor(Math.random() * 2);
        }

        const targetMod = (this.options.pointerAngle - targetLocalAngle) % twoPi;

        let delta = targetMod - currentMod;
        while (delta < 0) delta += twoPi;
        const totalRotation = delta + (baseRounds * twoPi);

        const startAngle = this.currentAngle;
        const finalAngle = startAngle + totalRotation;
        const startTime = performance.now();
        const duration = Math.max(300, durationSeconds * 1000); // 300ms(0.3초) 이상 자유롭게 지원

        let lastTime = startTime;

        const animate = (now) => {
            const dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;

            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);

            // Material 3 Emphasized Easing 적용
            const ease = PrizeWheel.materialEasing(progress, 0.15, 2.5);
            this.currentAngle = startAngle + totalRotation * ease;

            // 회전 속도에 비례한 포인터 햅틱 피드백
            const curr = this.getCurrentSlice();
            if (curr && curr.index !== this.lastSliceIndex) {
                this.lastSliceIndex = curr.index;
                const kick = progress > 0.7 ? 14 : (progress > 0.4 ? 9 : 5);
                this.pointerVelocity = kick;

                if (now - this.lastTickTimestamp >= 45) {
                    this.lastTickTimestamp = now;
                    this.options.onTick();
                }
            }

            // 스프링-댐퍼 물리 시뮬레이션
            const springK = 80;
            const damping = 12;
            const springForce = -springK * this.pointerWobble;
            const dampingForce = -damping * this.pointerVelocity;
            this.pointerVelocity += (springForce + dampingForce) * dt;
            this.pointerWobble += this.pointerVelocity * dt;

            // 단일 drawImage blit으로 초고속 렌더링
            this.draw();

            if (progress < 1) {
                this.animFrameId = requestAnimationFrame(animate);
            } else {
                this.currentAngle = finalAngle;
                this.isSpinning = false;
                this.pointerWobble = 0;
                this.pointerVelocity = 0;
                this.draw();
                const result = this.getCurrentSlice();
                this.options.onSpinEnd(result ? result.slice.prize : targetSlice.prize);
            }
        };

        this.animFrameId = requestAnimationFrame(animate);
    }

    /**
     * 오프스크린 캔버스에 룰렛 원판(섹터, 텍스트, 디바이더)을 미리 1회만 고화질로 렌더링
     * 회전 중에는 텍스트 렌더링이나 클리핑 연산이 전혀 발생하지 않습니다.
     */
    updateWheelCache() {
        if (this.cacheValid) return;
        const ctx = this.cacheCtx;
        const c = this.center;
        const r = this.radius;

        ctx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);
        ctx.save();
        ctx.translate(c, c);

        // 1. 모든 섹터 그리기 (밝은 파스텔 톤)
        this.slices.forEach((slice, idx) => {
            this.drawCachedSlice(ctx, slice, r - 8, idx);
        });

        // 2. 섹터 외곽 정밀 가이드 라인
        ctx.beginPath();
        ctx.arc(0, 0, r - 8, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();

        ctx.restore();
        this.cacheValid = true;
    }

    /**
     * 개별 섹터 캐시 렌더링
     * - 물품 아이콘을 매우 크게 배치
     * - 물품명을 큼직하게 배치하고 순백색 테두리(Outline Stroke)를 주어 가독성 극대화
     */
    drawCachedSlice(ctx, slice, radius, idx) {
        const { startAngle, endAngle, sweepAngle, prize, color } = slice;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, endAngle);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();

        // 섹터 경계선: 순백색 2.5px 디바이더
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.clip(); // 섹터 외부 클리핑

        // 텍스트/아이콘 회전 축 배치
        const midAngle = startAngle + sweepAngle / 2;
        ctx.rotate(midAngle);

        // 아이콘 분리 (prize.icon 또는 prize.name 앞의 이모지 추출)
        let icon = prize.icon || '';
        let name = prize.name || '';
        if (!icon) {
            const emojiMatch = name.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[^\w\s\uAC00-\uD7A3])+/u);
            if (emojiMatch) {
                icon = emojiMatch[0].trim();
                name = name.slice(emojiMatch[0].length).trim();
            }
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 1. 매우 큰 물품 아이콘 (외곽 여백에 큼직하게 배치)
        const isUsb = (icon === 'USB' || icon === 'usb');
        if (isUsb) {
            icon = 'USB';
            const iconDist = radius * 0.76;
            const iconSize = sweepAngle < 0.35 ? 26 : (sweepAngle < 0.6 ? 32 : 36);
            this.drawUsbIcon(ctx, iconDist, 0, iconSize);
        } else if (icon) {
            const iconDist = radius * 0.76;
            const iconSize = sweepAngle < 0.35 ? 28 : (sweepAngle < 0.6 ? 34 : 40);
            ctx.font = `${iconSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            ctx.fillStyle = '#0F172A';
            ctx.fillText(icon, iconDist, 0);
        }

        // 2. 큼직한 물품명 (중심부 쪽에 배치)
        const nameDist = icon ? (radius * 0.42) : (radius * 0.58);
        let nameSize = 18;
        if (name.length >= 8) nameSize = 15;
        else if (name.length >= 6) nameSize = 16.5;
        else nameSize = 19;
        if (sweepAngle < 0.38) nameSize -= 3;

        ctx.font = `800 ${nameSize}px "Pretendard", "Roboto", -apple-system, sans-serif`;

        // 선명한 글씨 테두리 (Outline Stroke)
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeText(name, nameDist, 0);

        // 짙은 슬레이트 텍스트 본문 (Fill)
        ctx.fillStyle = prize.textColor || '#0F172A';
        ctx.fillText(name, nameDist, 0);

        ctx.restore();
    }

    /**
     * 멀티허브 전용 벡터 USB 아이콘 렌더링
     */
    drawUsbIcon(ctx, x, y, size = 36) {
        ctx.save();
        ctx.translate(x, y);
        const s = size / 36;
        ctx.scale(s, s);

        // 은색 금속 커넥터
        ctx.fillStyle = '#E2E8F0';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.rect(-6, -16, 12, 10);
        ctx.fill();
        ctx.stroke();

        // 금속 단자 내부 구멍 2개
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-4.5, -13, 3, 4);
        ctx.fillRect(1.5, -13, 3, 4);

        // 본체 (진한 네이비/슬레이트)
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-8.5, -6, 17, 22, [2, 2, 5, 5]);
        } else {
            ctx.rect(-8.5, -6, 17, 22);
        }
        ctx.fill();
        ctx.stroke();

        // USB 로고 라인 & 기호 (화사한 스카이 블루)
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.lineTo(0, -1);
        ctx.stroke();

        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(0, 9, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(-2.8, -0.5);
        ctx.lineTo(2.8, -0.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    /**
     * 메인 캔버스 렌더링 (초당 60~120 FPS 유지)
     */
    draw() {
        if (!this.canvas) return;
        if (!this.cacheValid) {
            this.updateWheelCache();
        }

        const ctx = this.ctx;
        const c = this.center;
        const r = this.radius;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.slices.length === 0) {
            this.drawEmptyState();
            return;
        }

        ctx.save();
        ctx.translate(c, c);

        // 1. 머티리얼 3 서피스 베젤 베이스 (정적)
        this.drawOuterFrame(ctx, r);

        // 2. 프리캐시된 룰렛 원판 회전 Blit (0.1ms 미만의 초고속 GPU 전송)
        ctx.save();
        ctx.rotate(this.currentAngle);
        ctx.drawImage(this.cacheCanvas, -c, -c, c * 2, c * 2);
        ctx.restore();

        // 3. 머티리얼 3 둘레 핀 스터드 (정적)
        this.drawMaterialStuds(ctx, r);

        // 4. 중앙 FAB 거치 허브 (정적)
        this.drawCenterHub(ctx);

        // 5. 상단 에어로다이내믹 정밀 포인터 (동적 햅틱)
        this.drawPointer(ctx, r);

        ctx.restore();
    }

    /**
     * 머티리얼 3 서피스 베젤
     */
    drawOuterFrame(ctx, r) {
        ctx.beginPath();
        ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#E2E8F0';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();
    }

    /**
     * 머티리얼 3 둘레 핀 스터드
     */
    drawMaterialStuds(ctx, r) {
        const numPins = 24;
        const pinDist = r + 2;

        for (let i = 0; i < numPins; i++) {
            const angle = (i / numPins) * Math.PI * 2;
            const x = Math.cos(angle) * pinDist;
            const y = Math.sin(angle) * pinDist;

            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#CBD5E1';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = '#64748B';
            ctx.fill();
        }
    }

    /**
     * 중앙 허브 베이스
     */
    drawCenterHub(ctx) {
        ctx.save();
        const hubRadius = 46;

        ctx.beginPath();
        ctx.arc(0, 0, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#E2E8F0';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, hubRadius - 4, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();

        ctx.restore();
    }

    /**
     * 12시 방향 상단 정밀 포인터
     */
    drawPointer(ctx, r) {
        ctx.save();
        ctx.translate(0, -r + 6);
        ctx.rotate((this.pointerWobble * Math.PI) / 180);

        ctx.beginPath();
        ctx.moveTo(0, 24);
        ctx.lineTo(-13, -10);
        ctx.arc(0, -10, 13, Math.PI, 0, false);
        ctx.lineTo(13, -10);
        ctx.closePath();

        ctx.fillStyle = '#DC2626';
        ctx.fill();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -9, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.restore();
    }

    /**
     * 빈 화면 상태
     */
    drawEmptyState() {
        const ctx = this.ctx;
        const c = this.center;
        const r = this.radius;

        ctx.save();
        ctx.translate(c, c);

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = '#F8FAFC';
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#E2E8F0';
        ctx.stroke();

        ctx.fillStyle = '#334155';
        ctx.font = '700 18px "Pretendard", "Roboto", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('등록된 경품이 없거나 모두 소진되었습니다', 0, -10);

        ctx.font = '500 14px "Pretendard", "Roboto", sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.fillText('우측 관리 메뉴에서 경품을 추가해 주세요', 0, 18);

        ctx.restore();
    }
}

window.PrizeWheel = PrizeWheel;
