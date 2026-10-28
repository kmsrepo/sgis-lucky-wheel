/**
 * 로컬 스토리지 및 데이터 영속화 모듈
 * 인터넷 없이 브라우저 로컬 저장소에 경품 목록, 수량, 당첨 히스토리 및 설정을 안전하게 보관합니다.
 */
class StorageManager {
    static STORAGE_KEYS = {
        PRIZES: 'roulette_prizes_v5',
        SETTINGS: 'roulette_settings_v6',
        HISTORY: 'roulette_history_v2'
    };

    // 실물 홍보 물품 12종 2:3 황금비율(대용량:소용량) 프리셋 정렬 기본값
    static DEFAULT_PRIZES = [
        { id: '1', name: '🪥 치약세트', count: 700, initialCount: 700, color: '#fef08a', textColor: '#0f172a', enabled: true },
        { id: '2', name: '🔊 블루투스스피커', count: 16, initialCount: 16, color: '#bae6fd', textColor: '#0f172a', enabled: true },
        { id: '3', name: '🔋 보조배터리', count: 214, initialCount: 214, color: '#86efac', textColor: '#0f172a', enabled: true },
        { id: '4', name: '⏰ 탁상전자시계', count: 16, initialCount: 16, color: '#f9a8d4', textColor: '#0f172a', enabled: true },
        { id: '5', name: '👜 손가방', count: 18, initialCount: 18, color: '#fed7aa', textColor: '#0f172a', enabled: true },
        { id: '6', name: '📝 리갈패드', count: 152, initialCount: 152, color: '#fde047', textColor: '#0f172a', enabled: true },
        { id: '7', name: '💻 멀티허브', count: 22, initialCount: 22, color: '#a7f3d0', textColor: '#0f172a', enabled: true },
        { id: '8', name: '🛍️ 타포린가방', count: 80, initialCount: 80, color: '#7dd3fc', textColor: '#0f172a', enabled: true },
        { id: '9', name: '🪒 보풀제거기', count: 22, initialCount: 22, color: '#fdba74', textColor: '#0f172a', enabled: true },
        { id: '10', name: '📱 핸드폰삼각대', count: 38, initialCount: 38, color: '#e9d5ff', textColor: '#0f172a', enabled: true },
        { id: '11', name: '🧺 수건세트', count: 44, initialCount: 44, color: '#99f6e4', textColor: '#0f172a', enabled: true },
        { id: '12', name: '🌂 양우산', count: 38, initialCount: 38, color: '#c4b5fd', textColor: '#0f172a', enabled: true }
    ];

    static DEFAULT_SETTINGS = {
        spinDuration: 0.8,        // 회전 시간(초, 1초 이내 빠른 즉시 결과 도출)
        spinSpeedMultiplier: 1.0, // 회전 바퀴 수 가중치
        probabilityMode: 'proportional', // 'proportional'(남은 수량 비례 추첨) | 'equal'(동일 확률 추첨)
        soundEnabled: true,       // 효과음 켜기/끄기
        confettiEnabled: true,    // 축하 폭죽 켜기/끄기
        autoDeduct: true,         // 당첨 시 수량 자동 1개 차감
        hideOutOfStock: true,     // 품절(수량 0) 항목 돌림판에서 자동 제외
        showHistory: true,        // 당첨 기록 표시 여부
        qrKeyword: '행사참여완료', // QR 카메라 인식 대상 키워드
        maxVisibleSlices: 5,      // 돌림판 동시 노출 경품 수 (2:3 비율에 맞춘 5개 동시 노출)
        autoRefillSlots: true     // 품절 시 대기 경품으로 자동 보충
    };

    /**
     * 양 많은 경품(치약, 보조배터리 등)과 양 적은 경품을 2:3 비율로 자동 배치하는 프리셋 정렬
     */
    static sortPresetRatio2to3(prizesList) {
        // 기준: 수량 80개 이상은 '양 많은 경품(High)', 80개 미만은 '양 적은 경품(Low)'
        const high = prizesList.filter(p => p.count >= 80);
        const low = prizesList.filter(p => p.count < 80);

        high.sort((a, b) => b.count - a.count); // 700, 214, 152, 80
        low.sort((a, b) => a.count - b.count);  // 16, 16, 18, 22, 22, 38, 38, 44

        const result = [];
        let hIdx = 0;
        let lIdx = 0;

        // 2:3 비율 패턴으로 순차 교차 배치 (매 5개 슬롯당 High 2개, Low 3개)
        while (hIdx < high.length || lIdx < low.length) {
            if (hIdx < high.length) result.push(high[hIdx++]);
            if (lIdx < low.length) result.push(low[lIdx++]);
            if (hIdx < high.length) result.push(high[hIdx++]);
            if (lIdx < low.length) result.push(low[lIdx++]);
            if (lIdx < low.length) result.push(low[lIdx++]);
        }

        return result;
    }

    /**
     * 경품 목록 불러오기
     */
    static loadPrizes() {
        try {
            let data = localStorage.getItem(this.STORAGE_KEYS.PRIZES);
            if (!data || !data.includes('💻 멀티허브')) {
                // 신규 12종 데이터(💻 멀티허브 포함)가 아니면 신규 목록으로 즉시 자동 마이그레이션
                this.savePrizes(this.DEFAULT_PRIZES);
                return JSON.parse(JSON.stringify(this.DEFAULT_PRIZES));
            }
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map(p => ({
                    enabled: p.enabled !== false,
                    ...p
                }));
            }
            return JSON.parse(JSON.stringify(this.DEFAULT_PRIZES));
        } catch (e) {
            console.error('Failed to load prizes from localStorage:', e);
            return JSON.parse(JSON.stringify(this.DEFAULT_PRIZES));
        }
    }

    /**
     * 경품 목록 저장
     */
    static savePrizes(prizes) {
        try {
            localStorage.setItem(this.STORAGE_KEYS.PRIZES, JSON.stringify(prizes));
        } catch (e) {
            console.error('Failed to save prizes to localStorage:', e);
        }
    }

    /**
     * 환경설정 불러오기
     */
    static loadSettings() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.SETTINGS);
            if (!data) return { ...this.DEFAULT_SETTINGS };
            const parsed = JSON.parse(data);
            // 기존 캐시에 저장된 1초 초과 값이 있다면 0.8초(1초 이내 빠른 즉시 결과)로 자동 최적화
            if (typeof parsed.spinDuration === 'number' && parsed.spinDuration > 1.0) {
                parsed.spinDuration = 0.8;
                this.saveSettings({ ...this.DEFAULT_SETTINGS, ...parsed });
            }
            return { ...this.DEFAULT_SETTINGS, ...parsed };
        } catch (e) {
            console.error('Failed to load settings:', e);
            return { ...this.DEFAULT_SETTINGS };
        }
    }

    /**
     * 환경설정 저장
     */
    static saveSettings(settings) {
        try {
            localStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }

    /**
     * 당첨 히스토리 불러오기
     */
    static loadHistory() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEYS.HISTORY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to load history:', e);
            return [];
        }
    }

    /**
     * 당첨 기록 추가
     */
    static addHistoryRecord(record) {
        const history = this.loadHistory();
        history.unshift(record); // 최신순 앞에 추가
        // 최대 500개 보관
        if (history.length > 500) history.pop();
        try {
            localStorage.setItem(this.STORAGE_KEYS.HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save history:', e);
        }
        return history;
    }

    /**
     * 당첨 기록 전체 삭제
     */
    static clearHistory() {
        try {
            localStorage.removeItem(this.STORAGE_KEYS.HISTORY);
        } catch (e) {}
    }

    /**
     * 모든 경품 수량을 초기값으로 리셋
     */
    static resetPrizeCounts(prizes) {
        return prizes.map(p => ({
            ...p,
            count: p.initialCount !== undefined ? p.initialCount : p.count
        }));
    }

    /**
     * 전체 데이터(경품/설정) 공장초기화
     */
    static resetToDefaults() {
        try {
            localStorage.removeItem(this.STORAGE_KEYS.PRIZES);
            localStorage.removeItem(this.STORAGE_KEYS.SETTINGS);
            localStorage.removeItem(this.STORAGE_KEYS.HISTORY);
        } catch (e) {}
        this.savePrizes(this.DEFAULT_PRIZES);
        this.saveSettings(this.DEFAULT_SETTINGS);
        return {
            prizes: JSON.parse(JSON.stringify(this.DEFAULT_PRIZES)),
            settings: { ...this.DEFAULT_SETTINGS }
        };
    }

    /**
     * 당첨 기록 CSV 파일 다운로드 내보내기 (오프라인 지원)
     */
    static exportHistoryCSV() {
        const history = this.loadHistory();
        if (history.length === 0) {
            alert('내보낼 당첨 기록이 없습니다.');
            return;
        }

        let csvContent = '\uFEFF'; // Excel 한글 깨짐 방지 BOM
        csvContent += '순번,당첨일시,당첨물품,당첨후잔여수량\n';

        history.forEach((h, idx) => {
            const no = history.length - idx;
            const time = `"${h.displayTime || h.timestamp}"`;
            const name = `"${(h.name || '').replace(/"/g, '""')}"`;
            const rem = h.remainingCount !== undefined ? h.remainingCount : '';
            csvContent += `${no},${time},${name},${rem}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        a.href = url;
        a.download = `경품추첨기록_${dateStr}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 전체 데이터 JSON 백업 파일 다운로드
     */
    static exportBackupData() {
        const backup = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            prizes: this.loadPrizes(),
            settings: this.loadSettings(),
            history: this.loadHistory()
        };

        const jsonStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        a.href = url;
        a.download = `경품추첨설정백업_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * JSON 백업 파일에서 복원
     */
    static importBackupData(file, onSuccess, onError) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || !Array.isArray(data.prizes)) {
                    throw new Error('올바르지 않은 백업 파일 형식입니다.');
                }
                this.savePrizes(data.prizes);
                if (data.settings) this.saveSettings(data.settings);
                if (data.history) {
                    localStorage.setItem(this.STORAGE_KEYS.HISTORY, JSON.stringify(data.history));
                }
                onSuccess(data);
            } catch (err) {
                onError(err);
            }
        };
        reader.onerror = () => onError(new Error('파일 읽기 오류'));
        reader.readAsText(file, 'utf-8');
    }
}

window.StorageManager = StorageManager;
