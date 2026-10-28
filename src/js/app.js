/**
 * 경품 추첨 돌림판 메인 애플리케이션 컨트롤러
 * - Android Material Design 3 테마 및 인터랙션
 * - 관리창 기본 숨김 (부스 모드 기본 활성화)
 * - QR 코드 카메라 인식 시 자동 스핀 기능
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. 상태 변수
    let prizes = StorageManager.loadPrizes();
    let settings = StorageManager.loadSettings();
    let history = StorageManager.loadHistory();
    let pendingWinner = null;

    // 2. DOM 요소 참조
    const wheelCanvas = document.getElementById('wheel-canvas');
    const spinBtn = document.getElementById('spin-btn');
    const prizeListEl = document.getElementById('prize-list');
    const addPrizeBtn = document.getElementById('add-prize-btn');
    const newPrizeNameInput = document.getElementById('new-prize-name');
    const newPrizeCountInput = document.getElementById('new-prize-count');
    const newPrizeColorInput = document.getElementById('new-prize-color');

    // 통계 표시
    const totalPrizesCountEl = document.getElementById('stat-total-prizes');
    const totalItemsCountEl = document.getElementById('stat-total-items');
    const historyListEl = document.getElementById('history-list');

    // 당첨 모달 요소
    const winModal = document.getElementById('win-modal');
    const winPrizeNameEl = document.getElementById('win-prize-name');
    const winRemainingTextEl = document.getElementById('win-remaining-text');
    const winConfirmBtn = document.getElementById('win-confirm-btn');
    const winCancelDeductBtn = document.getElementById('win-cancel-deduct-btn');

    // QR 스캐너 모달 및 버튼
    const qrToggleBtn = document.getElementById('qr-toggle-btn');
    const qrScannerModal = document.getElementById('qr-scanner-modal');
    const qrCloseBtn = document.getElementById('qr-close-btn');
    const qrTestBtn = document.getElementById('qr-test-btn');
    const qrVideo = document.getElementById('qr-video');
    const qrStatusTextEl = document.getElementById('qr-status-text');

    // 설정 모달 및 토글 버튼들
    const soundToggleBtn = document.getElementById('sound-toggle-btn');
    const fullscreenToggleBtn = document.getElementById('fullscreen-toggle-btn');
    const presentationToggleBtn = document.getElementById('presentation-toggle-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const resetCountsBtn = document.getElementById('reset-counts-btn');
    const resetDefaultsBtn = document.getElementById('reset-defaults-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importJsonInput = document.getElementById('import-json-input');

    // 설정 인풋
    const settingDurationInput = document.getElementById('setting-duration');
    const settingDurationVal = document.getElementById('setting-duration-val');
    const settingProbModeSelect = document.getElementById('setting-prob-mode');
    const settingHideOutOfStock = document.getElementById('setting-hide-out-of-stock');
    const settingAutoDeduct = document.getElementById('setting-auto-deduct');
    const settingQrKeywordInput = document.getElementById('setting-qr-keyword');

    // 3. 사운드 및 룰렛 초기화
    soundEngine.setMuted(!settings.soundEnabled);
    updateSoundBtnState();

    const wheel = new PrizeWheel('wheel-canvas', {
        onSpinStart: () => {
            spinBtn.disabled = true;
            spinBtn.classList.add('spinning');
            soundEngine.playSpinStart();
        },
        onSpinEnd: (winner) => {
            spinBtn.disabled = false;
            spinBtn.classList.remove('spinning');
            handleSpinWinner(winner);
        },
        onTick: () => {
            soundEngine.playTick();
        }
    });

    wheel.setPrizes(prizes, settings);

    // 4. QR 코드 카메라 스캐너 초기화
    const qrScanner = new QRScannerEngine({
        targetKeyword: settings.qrKeyword || '행사참여완료',
        cooldownSeconds: 6,
        onRecognized: (text) => {
            soundEngine.playSuccessBeep();
            showToast(`🎉 QR 인식 성공 ("${settings.qrKeyword || '행사참여완료'}")! 룰렛을 자동 회전합니다.`);
            // 카메라 종료 후 자동 스핀 실행
            setTimeout(() => {
                qrScanner.stop();
                qrScannerModal.classList.add('hidden');
                triggerSpin();
            }, 600);
        },
        onStatusChange: (status) => {
            if (qrStatusTextEl) qrStatusTextEl.textContent = status;
        },
        onError: (err) => {
            showToast(`카메라 오류: ${err.message || '카메라를 열 수 없습니다.'}`);
        }
    });

    // 5. 부스 모드 전용 경품 현황판 렌더링 (돌림판에 있는 경품만 노출 & 수량 비표시)
    const boothPrizeListEl = document.getElementById('booth-prize-list');

    function renderBoothShowcase() {
        if (!boothPrizeListEl) return;
        boothPrizeListEl.innerHTML = '';

        const activeWheelIds = wheel.getActivePrizeIds();
        // 돌림판에 실제로 올라와 있는 경품만 필터링!
        const onWheelPrizes = activeWheelIds.map(id => prizes.find(p => p.id === id)).filter(Boolean);

        if (onWheelPrizes.length === 0) {
            boothPrizeListEl.innerHTML = '<div style="text-align:center; padding: 40px 10px; color: #94a3b8; font-size: 13.5px;">현재 돌림판에 진행 중인 경품이 없습니다.</div>';
            return;
        }

        onWheelPrizes.forEach(prize => {
            // 아이콘 및 이름 분리
            let icon = prize.icon || '';
            let name = prize.name || '';
            if (!icon) {
                const emojiMatch = name.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[^\w\s\uAC00-\uD7A3])+/u);
                if (emojiMatch) {
                    icon = emojiMatch[0].trim();
                    name = name.slice(emojiMatch[0].length).trim();
                }
            }
            if (!icon) icon = '🎁';

            const isUsb = (icon === 'USB' || prize.icon === 'USB');
            let iconHtml = `<span class="booth-prize-icon">${icon}</span>`;
            if (isUsb) {
                iconHtml = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;"><rect x="8" y="2" width="8" height="6" rx="1" fill="#cbd5e1" stroke="#334155" stroke-width="1.6"></rect><rect x="10" y="4" width="1.5" height="2.5" fill="#0f172a"></rect><rect x="12.5" y="4" width="1.5" height="2.5" fill="#0f172a"></rect><rect x="6" y="8" width="12" height="14" rx="3" fill="#1e293b" stroke="#0f172a" stroke-width="1.6"></rect><line x1="12" y1="12" x2="12" y2="18" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"></line><circle cx="12" cy="18" r="1.5" fill="#38bdf8"></circle></svg>`;
            }

            const card = document.createElement('div');
            card.className = 'booth-prize-card is-active-wheel';
            // 수량 정보(count)는 일체 표시하지 않음!
            card.innerHTML = `
                <div class="booth-prize-color-strip" style="background-color: ${prize.color || '#3b82f6'};"></div>
                <div class="booth-prize-icon-wrap">
                    ${iconHtml}
                </div>
                <div class="booth-prize-content">
                    <div class="booth-prize-name">${escapeHtml(name)}</div>
                    <div class="booth-prize-status">
                        <span class="booth-badge live">🎡 진행중</span>
                    </div>
                </div>
            `;
            boothPrizeListEl.appendChild(card);
        });
    }

    // 6. 경품 목록 UI 렌더링 (관리자 패널)
    function renderPrizeList() {
        // 룰렛 엔진 데이터 동기화 (최대 노출 개수 및 자동 리필 계산 포함)
        wheel.setPrizes(prizes, settings);
        const activeWheelIds = wheel.getActivePrizeIds();

        prizeListEl.innerHTML = '';
        let totalItems = 0;

        prizes.forEach((prize, index) => {
            const isEnabled = prize.enabled !== false;
            const isOutOfStock = prize.count <= 0;
            const isOnWheel = activeWheelIds.includes(prize.id);

            if (isEnabled) {
                totalItems += Math.max(0, prize.count);
            }

            let badgeHtml = '';
            if (!isEnabled) {
                badgeHtml = '<span class="prize-status-badge badge-disabled">돌림판 제외</span>';
            } else if (isOutOfStock) {
                badgeHtml = '<span class="prize-status-badge badge-soldout">품절</span>';
            } else if (isOnWheel) {
                badgeHtml = '<span class="prize-status-badge badge-active">🎡 판 노출중</span>';
            } else {
                badgeHtml = '<span class="prize-status-badge badge-queue">대기중</span>';
            }

            const row = document.createElement('div');
            row.className = `prize-item-row ${!isEnabled ? 'item-disabled' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`;
            row.innerHTML = `
                <div class="prize-order-col">
                    <button class="btn-order-move btn-move-up" data-id="${prize.id}" title="순서 위로 이동 (우선 노출)">▲</button>
                    <span class="prize-rank-num">#${index + 1}</span>
                    <button class="btn-order-move btn-move-down" data-id="${prize.id}" title="순서 아래로 이동">▼</button>
                </div>
                <div class="prize-select-col">
                    <input type="checkbox" class="prize-enable-checkbox" data-id="${prize.id}" ${isEnabled ? 'checked' : ''} title="돌림판 노출 여부 선택">
                </div>
                <div class="prize-color-badge" style="background-color: ${prize.color || '#3b82f6'};"></div>
                <div class="prize-name-col">
                    <input type="text" class="input-prize-name-edit" data-id="${prize.id}" value="${escapeHtml(prize.name)}" title="클릭하여 경품명 및 아이콘 바로 수정 (단축키: Win + .)">
                    <div class="prize-meta-row">
                        ${badgeHtml}
                        <span class="prize-initial-text">초기: ${prize.initialCount || prize.count}개</span>
                    </div>
                </div>
                <div class="prize-count-control">
                    <button class="btn-count-adjust btn-minus" data-id="${prize.id}" title="1개 감소">-</button>
                    <input type="number" class="input-count-direct" data-id="${prize.id}" value="${prize.count}" min="0">
                    <button class="btn-count-adjust btn-plus" data-id="${prize.id}" title="1개 증가">+</button>
                </div>
                <button class="btn-delete-prize" data-id="${prize.id}" title="경품 삭제">✕</button>
            `;
            prizeListEl.appendChild(row);
        });

        // 통계 업데이트
        const inStockCount = prizes.filter(p => p.enabled !== false && p.count > 0).length;
        const totalSelected = prizes.filter(p => p.enabled !== false).length;
        const queuedCount = Math.max(0, totalSelected - activeWheelIds.length);
        totalPrizesCountEl.textContent = `${inStockCount} / ${prizes.length}종 (판 노출: ${activeWheelIds.length}칸 / 대기: ${queuedCount}종)`;
        totalItemsCountEl.textContent = `${totalItems}개`;

        // 부스 전용 우측 쇼케이스 동시 동기화
        renderBoothShowcase();
    }

    // 6. 당첨 히스토리 목록 UI 렌더링
    function renderHistoryList() {
        historyListEl.innerHTML = '';
        if (history.length === 0) {
            historyListEl.innerHTML = '<div class="empty-history">아직 당첨 기록이 없습니다.</div>';
            return;
        }

        history.forEach((h, idx) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-item-left">
                    <span class="history-badge">#${history.length - idx}</span>
                    <span class="history-name">${escapeHtml(h.name)}</span>
                </div>
                <div class="history-item-right">
                    <span class="history-time">${h.displayTime || ''}</span>
                </div>
            `;
            historyListEl.appendChild(item);
        });
    }

    // 7. 당첨 결과 처리
    function handleSpinWinner(winner) {
        pendingWinner = winner;

        // 효과음 및 컨페티
        if (settings.soundEnabled) {
            soundEngine.playWinFanfare();
        }
        if (settings.confettiEnabled) {
            confettiEngine.fireCannons();
            setTimeout(() => {
                confettiEngine.fireBurst(window.innerWidth / 2, window.innerHeight * 0.4, 150);
            }, 300);
        }

        // 결과 모달 세팅
        winPrizeNameEl.textContent = winner.name;

        let remaining = winner.count;
        const isBooth = document.body.classList.contains('presentation-mode');
        winConfirmBtn.textContent = isBooth ? '수령완료' : '계속하기 (확인 [Space / Enter])';
        if (settings.autoDeduct) {
            deductPrizeCount(winner.id, 1);
            remaining = Math.max(0, winner.count);
            if (isBooth) {
                winRemainingTextEl.textContent = '🎉 부스 운영자에게 당첨된 선물을 수령하세요!';
            } else {
                winRemainingTextEl.textContent = `1개가 차감되었습니다. (현재 잔여: ${remaining}개)`;
            }
            winCancelDeductBtn.classList.remove('hidden-by-deduct-setting');
            winCancelDeductBtn.style.display = isBooth ? 'none' : 'inline-flex';
        } else {
            winRemainingTextEl.textContent = isBooth ? '🎉 부스 운영자에게 당첨된 선물을 수령하세요!' : `(자동 차감 설정 해제됨 - 잔여: ${remaining}개)`;
            winCancelDeductBtn.classList.add('hidden-by-deduct-setting');
            winCancelDeductBtn.style.display = 'none';
        }

        // 당첨 히스토리 기록
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        history = StorageManager.addHistoryRecord({
            id: winner.id,
            name: winner.name,
            timestamp: now.toISOString(),
            displayTime: timeStr,
            remainingCount: remaining
        });
        renderHistoryList();

        // 모달 표시
        winModal.classList.remove('hidden');
    }

    // 8. 수량 차감 및 변경 (소진 시 자동 보충 리필 감지)
    function deductPrizeCount(prizeId, amount = 1) {
        const prevActiveIds = [...wheel.getActivePrizeIds()];
        const targetPrizeBefore = prizes.find(p => p.id === prizeId);
        const wasOutOfStock = targetPrizeBefore ? targetPrizeBefore.count <= 0 : false;

        prizes = prizes.map(p => {
            if (p.id === prizeId) {
                const newCount = Math.max(0, p.count - amount);
                return { ...p, count: newCount };
            }
            return p;
        });
        StorageManager.savePrizes(prizes);
        renderPrizeList();

        // 자동 리필 감지
        const targetPrizeAfter = prizes.find(p => p.id === prizeId);
        if (targetPrizeAfter && targetPrizeAfter.count <= 0 && !wasOutOfStock) {
            const nextActiveIds = wheel.getActivePrizeIds();
            const newEnteredId = nextActiveIds.find(id => !prevActiveIds.includes(id));
            if (newEnteredId) {
                const newPrize = prizes.find(p => p.id === newEnteredId);
                if (newPrize) {
                    showToast(`📢 [경품 자동 보충] "${targetPrizeAfter.name}" 소진 완료! 새 경품 "${newPrize.name}"이(가) 돌림판에 새로 투입되었습니다!`, 4500);
                }
            } else {
                showToast(`📢 "${targetPrizeAfter.name}" 경품이 전량 소진되었습니다.`, 3000);
            }
        }
    }

    function addPrizeCount(prizeId, amount = 1) {
        prizes = prizes.map(p => {
            if (p.id === prizeId) {
                return { ...p, count: p.count + amount };
            }
            return p;
        });
        StorageManager.savePrizes(prizes);
        renderPrizeList();
    }

    function setPrizeCount(prizeId, count) {
        prizes = prizes.map(p => {
            if (p.id === prizeId) {
                const safeCount = Math.max(0, parseInt(count) || 0);
                return { ...p, count: safeCount };
            }
            return p;
        });
        StorageManager.savePrizes(prizes);
        renderPrizeList();
    }

    // 9. 스핀 시작 트리거
    function triggerSpin() {
        if (wheel.isSpinning) return;
        // 당첨 모달이 열려 있는 상태에서는 새로운 스핀 방지
        if (!winModal.classList.contains('hidden')) return;

        const activeItems = prizes.filter(p => p.enabled !== false && (!settings.hideOutOfStock || p.count > 0));
        if (activeItems.length === 0) {
            showToast('⚠️ 돌림판에 활성화된 경품이 없습니다! 관리창에서 항목을 선택해주세요.');
            return;
        }

        wheel.spin(parseFloat(settings.spinDuration) || 0.8);
    }

    // 10. 이벤트 리스너 등록
    spinBtn.addEventListener('click', () => {
        soundEngine.init();
        triggerSpin();
    });

    // 당첨 수량 1개 차감 취소 및 복원 공통 함수 (키보드 C 및 관리창 버튼 연동)
    function cancelDeduction() {
        if (pendingWinner) {
            addPrizeCount(pendingWinner.id, 1);
            showToast(`"${pendingWinner.name}" 1개 차감이 취소(복원)되었습니다.`);
            winModal.classList.add('hidden');
            pendingWinner = null;
        } else {
            showToast('취소할 최근 당첨 내역이 없습니다.');
        }
    }

    // 키보드 단축키 (스페이스바/엔터 추첨 및 모달 닫기, C키 차감 취소, P키 관리창)
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

        if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 32) {
            e.preventDefault();
            // 당첨 창이 열려 있는 상태에서 스페이스바 또는 엔터키를 누르면 모달 창 닫기!
            if (!winModal.classList.contains('hidden')) {
                winModal.classList.add('hidden');
                return;
            }
            soundEngine.init();
            triggerSpin();
        } else if (e.key === 'c' || e.key === 'C' || e.key === 'ㅊ' || e.code === 'KeyC') {
            // C 키: 당첨 수량 차감 취소 (모달 열려있을 때 또는 직전 당첨 건 복원)
            if (!winModal.classList.contains('hidden') || pendingWinner) {
                e.preventDefault();
                cancelDeduction();
            }
        } else if (e.code === 'Escape' || e.key === 'Escape' || e.keyCode === 27) {
            // 모달 닫기
            if (!winModal.classList.contains('hidden')) {
                winModal.classList.add('hidden');
            }
            if (!qrScannerModal.classList.contains('hidden')) {
                qrScanner.stop();
                qrScannerModal.classList.add('hidden');
            }
        } else if (e.key === 'p' || e.key === 'P' || e.key === 'ㅔ' || e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') {
            // P 키: 관리창 열기/닫기 토글
            presentationToggleBtn.click();
        }
    });

    // 당첨 모달 닫기 및 차감 취소 버튼
    winConfirmBtn.addEventListener('click', () => {
        winModal.classList.add('hidden');
    });

    winCancelDeductBtn.addEventListener('click', () => {
        cancelDeduction();
    });

    // QR 스캐너 토글 및 제어
    qrToggleBtn.addEventListener('click', () => {
        soundEngine.init();
        if (qrScannerModal.classList.contains('hidden')) {
            qrScannerModal.classList.remove('hidden');
            qrScanner.start(qrVideo);
        } else {
            qrScanner.stop();
            qrScannerModal.classList.add('hidden');
        }
    });

    qrCloseBtn.addEventListener('click', () => {
        qrScanner.stop();
        qrScannerModal.classList.add('hidden');
    });

    qrTestBtn.addEventListener('click', () => {
        qrScanner.simulateScan(settings.qrKeyword || '행사참여완료');
    });

    // 사운드 토글
    soundToggleBtn.addEventListener('click', () => {
        settings.soundEnabled = !settings.soundEnabled;
        soundEngine.setMuted(!settings.soundEnabled);
        StorageManager.saveSettings(settings);
        updateSoundBtnState();
        showToast(settings.soundEnabled ? '효과음 켜짐' : '효과음 꺼짐');
    });

    function updateSoundBtnState() {
        if (settings.soundEnabled) {
            soundToggleBtn.textContent = '🔊 소리 ON';
            soundToggleBtn.classList.add('active');
        } else {
            soundToggleBtn.textContent = '🔇 소리 OFF';
            soundToggleBtn.classList.remove('active');
        }
    }

    // 전체화면 토글
    fullscreenToggleBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                alert(`전체화면 오류: ${err.message}`);
            });
            fullscreenToggleBtn.textContent = '⤓ 화면 축소';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            fullscreenToggleBtn.textContent = '⤢ 전체 화면';
        }
    });

    // 부스 전용 발표 모드 (관리창 기본 숨김 -> 클릭 또는 P키로 토글)
    presentationToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('presentation-mode');
        const isPres = document.body.classList.contains('presentation-mode');
        presentationToggleBtn.textContent = isPres ? '📋 관리창 열기 (P)' : '🎪 부스 모드로 복귀 (P)';
        winConfirmBtn.textContent = isPres ? '수령완료' : '계속하기 (확인 [Space / Enter])';
        if (settings.autoDeduct && !winCancelDeductBtn.classList.contains('hidden-by-deduct-setting')) {
            winCancelDeductBtn.style.display = isPres ? 'none' : 'inline-flex';
        }
        showToast(isPres ? '부스 모드: 상단 메뉴와 푸터가 숨겨졌습니다 (관리창: P키)' : '관리창이 열렸습니다 (부스 모드 복귀: P키)');
        renderBoothShowcase();
        setTimeout(() => wheel.initCanvas() || wheel.draw(), 300);
    });

    // 설정 컨트롤
    settingDurationInput.value = settings.spinDuration;
    settingDurationVal.textContent = `${settings.spinDuration}초`;
    settingDurationInput.addEventListener('input', (e) => {
        settings.spinDuration = parseFloat(e.target.value);
        settingDurationVal.textContent = `${settings.spinDuration}초`;
        StorageManager.saveSettings(settings);
    });

    settingProbModeSelect.value = settings.probabilityMode || 'proportional';
    settingProbModeSelect.addEventListener('change', (e) => {
        settings.probabilityMode = e.target.value;
        StorageManager.saveSettings(settings);
        wheel.setPrizes(prizes, settings);
        showToast(settings.probabilityMode === 'proportional' ? '남은 수량 비례 확률 적용 (판 크기는 동일)' : '항목별 동일 확률 적용');
    });

    // 돌림판 최대 노출 개수 및 자동 보충 설정
    const settingMaxSlicesSelect = document.getElementById('setting-max-slices');
    const settingAutoRefillInput = document.getElementById('setting-auto-refill');

    if (settingMaxSlicesSelect) {
        settingMaxSlicesSelect.value = String(settings.maxVisibleSlices !== undefined ? settings.maxVisibleSlices : 4);
        settingMaxSlicesSelect.addEventListener('change', (e) => {
            settings.maxVisibleSlices = parseInt(e.target.value) || 0;
            StorageManager.saveSettings(settings);
            renderPrizeList();
            showToast(settings.maxVisibleSlices === 0 ? '돌림판 노출 제한 해제 (선택 품목 전체 노출)' : `돌림판 최대 노출: ${settings.maxVisibleSlices}개 품목으로 제한`);
        });
    }

    if (settingAutoRefillInput) {
        settingAutoRefillInput.checked = settings.autoRefillSlots !== false;
        settingAutoRefillInput.addEventListener('change', (e) => {
            settings.autoRefillSlots = e.target.checked;
            StorageManager.saveSettings(settings);
            renderPrizeList();
            showToast(settings.autoRefillSlots ? '품절 시 대기 경품 자동 보충 켜짐' : '품절 시 대기 경품 자동 보충 꺼짐');
        });
    }

    if (settingQrKeywordInput) {
        settingQrKeywordInput.value = settings.qrKeyword || '행사참여완료';
        settingQrKeywordInput.addEventListener('input', (e) => {
            settings.qrKeyword = e.target.value.trim() || '행사참여완료';
            qrScanner.options.targetKeyword = settings.qrKeyword;
            StorageManager.saveSettings(settings);
        });
    }

    settingHideOutOfStock.checked = settings.hideOutOfStock;
    settingHideOutOfStock.addEventListener('change', (e) => {
        settings.hideOutOfStock = e.target.checked;
        StorageManager.saveSettings(settings);
        wheel.setPrizes(prizes, settings);
    });

    settingAutoDeduct.checked = settings.autoDeduct;
    settingAutoDeduct.addEventListener('change', (e) => {
        settings.autoDeduct = e.target.checked;
        StorageManager.saveSettings(settings);
    });

    // 히스토리 CSV 내보내기
    exportCsvBtn.addEventListener('click', () => {
        StorageManager.exportHistoryCSV();
    });

    // 히스토리 삭제
    clearHistoryBtn.addEventListener('click', () => {
        if (history.length === 0) return;
        if (confirm('당첨 기록을 모두 삭제하시겠습니까?')) {
            StorageManager.clearHistory();
            history = [];
            renderHistoryList();
            showToast('당첨 기록이 초기화되었습니다.');
        }
    });

    // 수량만 초기화
    resetCountsBtn.addEventListener('click', () => {
        if (confirm('모든 경품의 수량을 초기 개수로 리셋하시겠습니까?')) {
            prizes = StorageManager.resetPrizeCounts(prizes);
            StorageManager.savePrizes(prizes);
            renderPrizeList();
            showToast('모든 경품 수량이 초기 개수로 리셋되었습니다.');
        }
    });

    // 전체 기본값 복원
    resetDefaultsBtn.addEventListener('click', () => {
        if (confirm('경품 목록과 설정을 초기 기본값으로 완전히 리셋하시겠습니까? (이전 데이터는 삭제됩니다)')) {
            const restored = StorageManager.resetToDefaults();
            prizes = restored.prizes;
            settings = restored.settings;
            wheel.setPrizes(prizes, settings);
            renderPrizeList();
            showToast('기본 프리셋으로 초기화되었습니다.');
        }
    });

    // JSON 백업 내보내기
    exportJsonBtn.addEventListener('click', () => {
        StorageManager.exportBackupData();
    });

    // JSON 복원 가져오기
    importJsonInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        StorageManager.importBackupData(
            file,
            (imported) => {
                prizes = imported.prizes;
                settings = imported.settings;
                history = StorageManager.loadHistory();
                wheel.setPrizes(prizes, settings);
                renderPrizeList();
                renderHistoryList();
                showToast('데이터가 성공적으로 복원되었습니다.');
            },
            (err) => {
                alert(`복원 실패: ${err.message}`);
            }
        );
        e.target.value = '';
    });

    // 신규 경품 추가
    addPrizeBtn.addEventListener('click', () => {
        const name = newPrizeNameInput.value.trim();
        const count = parseInt(newPrizeCountInput.value) || 0;
        const color = newPrizeColorInput.value;

        if (!name) {
            showToast('경품명을 입력해주세요.');
            newPrizeNameInput.focus();
            return;
        }

        if (count < 0) {
            showToast('수량은 0개 이상이어야 합니다.');
            return;
        }

        const newId = 'prize_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        prizes.push({
            id: newId,
            name: name,
            count: count,
            initialCount: count,
            color: color,
            textColor: '#0f172a',
            enabled: true
        });

        StorageManager.savePrizes(prizes);
        renderPrizeList();

        newPrizeNameInput.value = '';
        newPrizeCountInput.value = '10';
        showToast(`"${name}" 경품이 추가되었습니다.`);
    });

    // 2:3 비율 프리셋 정렬 버튼
    const btnPresetRatio = document.getElementById('btn-preset-ratio');
    if (btnPresetRatio) {
        btnPresetRatio.addEventListener('click', () => {
            prizes = StorageManager.sortPresetRatio2to3(prizes);
            settings.maxVisibleSlices = 5;
            StorageManager.saveSettings(settings);
            StorageManager.savePrizes(prizes);
            if (settingMaxSlicesSelect) settingMaxSlicesSelect.value = '5';
            renderPrizeList();
            showToast('치약/보조배터리 등 대용량과 소용량 경품이 2:3 비율로 자동 교차 정렬되었습니다! (돌림판 5슬롯 설정)');
        });
    }

    // 전체 선택 / 전체 해제 버튼
    const btnSelectAll = document.getElementById('btn-select-all');
    const btnDeselectAll = document.getElementById('btn-deselect-all');

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            prizes = prizes.map(p => ({ ...p, enabled: true }));
            StorageManager.savePrizes(prizes);
            renderPrizeList();
            showToast('모든 경품이 돌림판에 포함되었습니다.');
        });
    }

    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            prizes = prizes.map(p => ({ ...p, enabled: false }));
            StorageManager.savePrizes(prizes);
            renderPrizeList();
            showToast('모든 경품이 돌림판에서 제외되었습니다.');
        });
    }

    // 경품 순서 변경 / 수량 증감 / 삭제 이벤트 위임
    prizeListEl.addEventListener('click', (e) => {
        const moveUpBtn = e.target.closest('.btn-move-up');
        const moveDownBtn = e.target.closest('.btn-move-down');
        const plusBtn = e.target.closest('.btn-plus');
        const minusBtn = e.target.closest('.btn-minus');
        const delBtn = e.target.closest('.btn-delete-prize');

        if (moveUpBtn) {
            const id = moveUpBtn.dataset.id;
            const idx = prizes.findIndex(p => p.id === id);
            if (idx > 0) {
                const temp = prizes[idx];
                prizes[idx] = prizes[idx - 1];
                prizes[idx - 1] = temp;
                StorageManager.savePrizes(prizes);
                renderPrizeList();
                showToast(`"${temp.name}" 순서가 위로 이동되었습니다.`);
            }
        } else if (moveDownBtn) {
            const id = moveDownBtn.dataset.id;
            const idx = prizes.findIndex(p => p.id === id);
            if (idx >= 0 && idx < prizes.length - 1) {
                const temp = prizes[idx];
                prizes[idx] = prizes[idx + 1];
                prizes[idx + 1] = temp;
                StorageManager.savePrizes(prizes);
                renderPrizeList();
                showToast(`"${temp.name}" 순서가 아래로 이동되었습니다.`);
            }
        } else if (plusBtn) {
            const id = plusBtn.dataset.id;
            addPrizeCount(id, 1);
        } else if (minusBtn) {
            const id = minusBtn.dataset.id;
            deductPrizeCount(id, 1);
        } else if (delBtn) {
            const id = delBtn.dataset.id;
            const target = prizes.find(p => p.id === id);
            if (target && confirm(`"${target.name}" 경품을 삭제하시겠습니까?`)) {
                prizes = prizes.filter(p => p.id !== id);
                StorageManager.savePrizes(prizes);
                renderPrizeList();
                showToast(`"${target.name}" 경품이 삭제되었습니다.`);
            }
        }
    });

    // 추천 아이콘 칩 클릭 시 경품명 입력창에 자동 반영
    document.querySelectorAll('.chip-icon').forEach(chip => {
        chip.addEventListener('click', () => {
            const icon = chip.dataset.icon;
            const currentName = newPrizeNameInput.value.trim();
            const emojiMatch = currentName.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[^\w\s\uAC00-\uD7A3])+/u);
            if (emojiMatch) {
                newPrizeNameInput.value = icon + ' ' + currentName.slice(emojiMatch[0].length).trim();
            } else {
                newPrizeNameInput.value = currentName ? `${icon} ${currentName}` : `${icon} `;
            }
            newPrizeNameInput.focus();
        });
    });

    // 체크박스 선택/해제, 경품명 수정, 직접 수량 입력 변경 이벤트
    prizeListEl.addEventListener('change', (e) => {
        if (e.target.classList.contains('prize-enable-checkbox')) {
            const id = e.target.dataset.id;
            const checked = e.target.checked;
            prizes = prizes.map(p => {
                if (p.id === id) {
                    return { ...p, enabled: checked };
                }
                return p;
            });
            StorageManager.savePrizes(prizes);
            renderPrizeList();
            const targetPrize = prizes.find(p => p.id === id);
            const pName = targetPrize ? targetPrize.name : '';
            showToast(checked ? `"${pName}" 돌림판에 포함되었습니다.` : `"${pName}" 돌림판에서 제외되었습니다.`);
        } else if (e.target.classList.contains('input-prize-name-edit')) {
            const id = e.target.dataset.id;
            const newName = e.target.value.trim();
            if (!newName) {
                renderPrizeList();
                return;
            }
            prizes = prizes.map(p => {
                if (p.id === id) {
                    return { ...p, name: newName };
                }
                return p;
            });
            StorageManager.savePrizes(prizes);
            renderPrizeList();
            showToast(`경품명이 "${newName}"(으)로 변경되었습니다.`);
        } else if (e.target.classList.contains('input-count-direct')) {
            const id = e.target.dataset.id;
            const count = parseInt(e.target.value) || 0;
            setPrizeCount(id, count);
        }
    });

    // 관리자 탭 전환
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.dataset.tab;
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // 초기 렌더링
    renderPrizeList();
    renderHistoryList();
});

// 토스트 메시지 헬퍼
function showToast(msg, duration = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// HTML 이스케이프 헬퍼
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
