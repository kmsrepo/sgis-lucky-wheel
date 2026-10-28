/**
 * 오프라인 Canvas 2D 컨페티(축하 꽃가루 폭죽) 엔진
 * 외부 라이브러리 없이 독립적으로 작동합니다.
 */
class ConfettiEngine {
    constructor(canvasId = 'confetti-canvas') {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = canvasId;
            this.canvas.style.position = 'fixed';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100vw';
            this.canvas.style.height = '100vh';
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.zIndex = '9999';
            document.body.appendChild(this.canvas);
        }
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.animId = null;
        this.isRunning = false;

        this.colors = [
            '#f43f5e', '#ec4899', '#d946ef', '#a855f7',
            '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9',
            '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
            '#84cc16', '#eab308', '#f97316', '#ef4444'
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }

    createParticle(x, y, isBurst = false) {
        const angle = isBurst ? Math.random() * Math.PI * 2 : (Math.PI / 2) + (Math.random() - 0.5);
        const speed = isBurst ? (Math.random() * 12 + 6) : (Math.random() * 4 + 2);
        const size = Math.random() * 10 + 6;

        return {
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (isBurst ? Math.random() * 6 : 0),
            size: size,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 15,
            wobble: Math.random() * 10,
            wobbleSpeed: Math.random() * 0.1 + 0.05,
            gravity: 0.25,
            drag: 0.98,
            alpha: 1,
            decay: Math.random() * 0.005 + 0.003,
            shape: Math.random() > 0.4 ? 'rect' : (Math.random() > 0.5 ? 'circle' : 'ribbon')
        };
    }

    /**
     * 화면 중앙 및 사방에서 펑 터지는 버스트 효과
     */
    fireBurst(x = window.innerWidth / 2, y = window.innerHeight / 2, count = 120) {
        this.resize();
        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle(x, y, true));
        }
        if (!this.isRunning) {
            this.startLoop();
        }
    }

    /**
     * 좌우 양쪽에서 폭죽처럼 쏘아 올리기
     */
    fireCannons() {
        this.resize();
        const leftX = this.width * 0.15;
        const rightX = this.width * 0.85;
        const bottomY = this.height * 0.75;

        // 왼쪽 대포
        for (let i = 0; i < 70; i++) {
            const p = this.createParticle(leftX, bottomY, true);
            p.vx = Math.random() * 12 + 3;
            p.vy = -(Math.random() * 14 + 8);
            this.particles.push(p);
        }
        // 오른쪽 대포
        for (let i = 0; i < 70; i++) {
            const p = this.createParticle(rightX, bottomY, true);
            p.vx = -(Math.random() * 12 + 3);
            p.vy = -(Math.random() * 14 + 8);
            this.particles.push(p);
        }

        if (!this.isRunning) {
            this.startLoop();
        }
    }

    startLoop() {
        this.isRunning = true;
        const loop = () => {
            this.update();
            this.render();
            if (this.particles.length > 0) {
                this.animId = requestAnimationFrame(loop);
            } else {
                this.isRunning = false;
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
        };
        this.animId = requestAnimationFrame(loop);
    }

    stop() {
        this.particles = [];
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
        this.isRunning = false;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.wobble += p.wobbleSpeed;
            p.alpha -= p.decay;

            if (p.alpha <= 0 || p.y > this.height + 50) {
                this.particles.splice(i, 1);
            }
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        for (const p of this.particles) {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.globalAlpha = Math.max(0, p.alpha);
            this.ctx.fillStyle = p.color;

            const scaleX = Math.cos(p.wobble);

            if (p.shape === 'rect') {
                this.ctx.fillRect(-p.size / 2 * scaleX, -p.size / 2, p.size * scaleX, p.size);
            } else if (p.shape === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(0, 0, (p.size / 2) * Math.abs(scaleX), 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // 리본형
                this.ctx.fillRect(-p.size * scaleX, -p.size * 0.25, p.size * 2 * scaleX, p.size * 0.5);
            }

            this.ctx.restore();
        }
    }
}

window.confettiEngine = new ConfettiEngine();
