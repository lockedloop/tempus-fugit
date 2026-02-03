(function() {
    'use strict';

    // ==================== Storage Module ====================
    const Storage = {
        KEY_TIMERS: 'speedrun_timers',
        // Legacy keys for migration
        LEGACY_KEYS: {
            target: 'speedrun_target_date',
            start: 'speedrun_start_date',
            title: 'speedrun_title',
            description: 'speedrun_description'
        },

        generateId() {
            return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        async get() {
            // Try chrome.storage.sync first, fall back to localStorage
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.get([this.KEY_TIMERS], (result) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                                resolve(this.getFromLocalStorage());
                            } else {
                                const timers = result[this.KEY_TIMERS];
                                if (timers && Array.isArray(timers)) {
                                    resolve({ timers });
                                } else {
                                    resolve(this.getFromLocalStorage());
                                }
                            }
                        });
                    });
                } catch (e) {
                    console.warn('Chrome storage exception, using localStorage:', e);
                    return this.getFromLocalStorage();
                }
            }
            return this.getFromLocalStorage();
        },

        getFromLocalStorage() {
            const stored = localStorage.getItem(this.KEY_TIMERS);
            if (stored) {
                try {
                    const timers = JSON.parse(stored);
                    if (Array.isArray(timers)) {
                        return { timers };
                    }
                } catch (e) {
                    console.warn('Failed to parse stored timers:', e);
                }
            }
            return { timers: [] };
        },

        async set(timers) {
            const data = JSON.stringify(timers);
            localStorage.setItem(this.KEY_TIMERS, data);

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.set({ [this.KEY_TIMERS]: timers }, () => {
                            if (chrome.runtime.lastError) {
                                console.warn('Chrome storage set failed:', chrome.runtime.lastError);
                            }
                            resolve();
                        });
                    });
                } catch (e) {
                    console.warn('Chrome storage set exception:', e);
                }
            }
        },

        async addTimer(data) {
            const { timers } = await this.get();
            const newTimer = {
                id: this.generateId(),
                startDate: data.startDate,
                targetDate: data.targetDate,
                title: data.title || '',
                description: data.description || '',
                createdAt: Date.now()
            };
            timers.push(newTimer);
            await this.set(timers);
            return newTimer;
        },

        async updateTimer(id, data) {
            const { timers } = await this.get();
            const index = timers.findIndex(t => t.id === id);
            if (index !== -1) {
                timers[index] = { ...timers[index], ...data };
                await this.set(timers);
                return timers[index];
            }
            return null;
        },

        async deleteTimer(id) {
            const { timers } = await this.get();
            const filtered = timers.filter(t => t.id !== id);
            await this.set(filtered);
            return filtered;
        },

        async migrateFromLegacy() {
            // Check if legacy data exists
            const hasLegacy = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

            let legacyData = null;

            if (hasLegacy) {
                try {
                    legacyData = await new Promise((resolve) => {
                        chrome.storage.sync.get([
                            this.LEGACY_KEYS.target,
                            this.LEGACY_KEYS.start,
                            this.LEGACY_KEYS.title,
                            this.LEGACY_KEYS.description
                        ], (result) => {
                            if (chrome.runtime.lastError) {
                                resolve(null);
                            } else if (result[this.LEGACY_KEYS.target] && result[this.LEGACY_KEYS.start]) {
                                resolve({
                                    targetDate: result[this.LEGACY_KEYS.target],
                                    startDate: result[this.LEGACY_KEYS.start],
                                    title: result[this.LEGACY_KEYS.title] || '',
                                    description: result[this.LEGACY_KEYS.description] || ''
                                });
                            } else {
                                resolve(null);
                            }
                        });
                    });
                } catch (e) {
                    console.warn('Legacy migration from chrome.storage failed:', e);
                }
            }

            // Try localStorage if no chrome.storage data
            if (!legacyData) {
                const targetDate = localStorage.getItem(this.LEGACY_KEYS.target);
                const startDate = localStorage.getItem(this.LEGACY_KEYS.start);
                if (targetDate && startDate) {
                    legacyData = {
                        targetDate,
                        startDate,
                        title: localStorage.getItem(this.LEGACY_KEYS.title) || '',
                        description: localStorage.getItem(this.LEGACY_KEYS.description) || ''
                    };
                }
            }

            if (legacyData) {
                console.log('Migrating legacy timer data:', legacyData);
                const newTimer = await this.addTimer(legacyData);

                // Clean up legacy data
                Object.values(this.LEGACY_KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });

                if (hasLegacy) {
                    try {
                        chrome.storage.sync.remove(Object.values(this.LEGACY_KEYS));
                    } catch (e) {
                        console.warn('Failed to remove legacy chrome.storage keys:', e);
                    }
                }

                return newTimer;
            }

            return null;
        }
    };

    // ==================== TimeCalc Module ====================
    const TimeCalc = {
        MS_PER_DAY: 24 * 60 * 60 * 1000,
        MS_PER_WEEK: 7 * 24 * 60 * 60 * 1000,

        parseDate(dateString) {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(year, month - 1, day);
        },

        formatDate(date) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        },

        getWeeksBetween(startDate, endDate) {
            const diffMs = endDate - startDate;
            return Math.ceil(diffMs / this.MS_PER_WEEK);
        },

        getElapsedWeeks(startDate, now) {
            const diffMs = now - startDate;
            if (diffMs < 0) return 0;
            return Math.floor(diffMs / this.MS_PER_WEEK);
        },

        getCurrentTimeBreakdown(now) {
            const jsDay = now.getDay();
            const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now - startOfYear) / this.MS_PER_DAY);
            const weekOfYear = Math.ceil((days + startOfYear.getDay() + 1) / 7);

            const monthFull = now.toLocaleDateString('en-US', { month: 'long' });
            const dayOfMonth = now.getDate();

            return {
                dayOfWeek,
                weekOfYear,
                year: now.getFullYear(),
                month: monthFull,
                dayOfMonth,
                hour: now.getHours(),
                minute: now.getMinutes(),
                second: now.getSeconds()
            };
        },

        getYearRanges(startDate, endDate) {
            const ranges = [];
            const startYear = startDate.getFullYear();
            const endYear = endDate.getFullYear();

            for (let year = startYear; year <= endYear; year++) {
                const yearStart = year === startYear ? startDate : new Date(year, 0, 1);
                const yearEnd = year === endYear ? endDate : new Date(year, 11, 31);
                const weeksInYear = this.getWeeksBetween(yearStart, yearEnd);

                ranges.push({
                    year,
                    label: String(year),
                    weeks: Math.max(1, weeksInYear),
                    startDate: yearStart
                });
            }

            return ranges;
        },

        getRemainingTime(targetDate, now) {
            const diffMs = targetDate - now;
            if (diffMs <= 0) return { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

            const seconds = Math.floor(diffMs / 1000) % 60;
            const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
            const hours = Math.floor(diffMs / (1000 * 60 * 60)) % 24;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) % 7;
            const weeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));

            return { weeks, days, hours, minutes, seconds };
        }
    };

    // ==================== GlobalTimeDisplay Module ====================
    const GlobalTimeDisplay = {
        elements: {},

        init() {
            this.elements = {
                daysGrid: document.getElementById('days-grid'),
                hoursGrid: document.getElementById('hours-grid'),
                minutesGrid: document.getElementById('minutes-grid'),
                secondsGrid: document.getElementById('seconds-grid'),
                weekLabel: document.getElementById('week-label'),
                dateLabel: document.getElementById('date-label'),
                timeLabel: document.getElementById('time-label'),
                secondsLabel: document.getElementById('seconds-label'),
                hourglass: document.getElementById('hourglass')
            };

            // Generate static time grids
            this.generateTimeGrid(this.elements.daysGrid, 7);
            this.generateTimeGrid(this.elements.hoursGrid, 24);
            this.generateTimeGrid(this.elements.minutesGrid, 60);
            this.generateTimeGrid(this.elements.secondsGrid, 60);
        },

        generateTimeGrid(container, count) {
            container.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const cell = document.createElement('div');
                cell.className = 'time-cell';
                container.appendChild(cell);
            }
        },

        updateTimeGrid(container, currentValue, total) {
            const cells = container.children;
            for (let i = 0; i < total; i++) {
                const cell = cells[i];
                cell.classList.remove('filled', 'current');

                if (i < currentValue) {
                    cell.classList.add('filled');
                } else if (i === currentValue) {
                    cell.classList.add('current');
                }
            }
        },

        update(now) {
            const time = TimeCalc.getCurrentTimeBreakdown(now);
            const pad = (n) => String(n).padStart(2, '0');

            // Update labels
            this.elements.weekLabel.textContent = `Week ${time.weekOfYear}, ${time.year}`;
            this.elements.dateLabel.textContent = `${time.month} ${time.dayOfMonth}`;
            this.elements.timeLabel.textContent = `${pad(time.hour)}:${pad(time.minute)}`;
            this.elements.secondsLabel.textContent = `:${pad(time.second)}`;

            // Flip hourglass every second
            if (this.elements.hourglass) {
                this.elements.hourglass.classList.toggle('flipped', time.second % 2 === 1);
            }

            // Update time grids
            this.updateTimeGrid(this.elements.daysGrid, time.dayOfWeek, 7);
            this.updateTimeGrid(this.elements.hoursGrid, time.hour, 24);
            this.updateTimeGrid(this.elements.minutesGrid, time.minute, 60);
            this.updateTimeGrid(this.elements.secondsGrid, time.second, 60);
        }
    };

    // ==================== Timer Class ====================
    class Timer {
        constructor(id, data, containerElement) {
            this.id = id;
            this.data = data;
            this.container = containerElement;
            this.elements = {};
            this.startDate = TimeCalc.parseDate(data.startDate);
            this.targetDate = TimeCalc.parseDate(data.targetDate);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);
        }

        init() {
            this.render();
            this.cacheElements();
            this.updateHeader();
            this.update(new Date());
        }

        render() {
            this.container.innerHTML = `
                <button class="edit-btn" title="Edit Timer">&#128295;</button>
                <header>
                    <h2 class="timer-title-display">-- Weeks</h2>
                    <div class="timer-description-display subtitle"></div>
                    <div class="weeks-count"></div>
                    <div class="target-subtitle subtitle">Configure your target date</div>
                </header>
                <section class="weeks-section"></section>
                <div class="led-countdown">
                    <div class="led-time">
                        <span class="led-weeks">00</span>:<span class="led-days">00</span>:<span class="led-hours">00</span>:<span class="led-minutes">00</span>:<span class="led-seconds">00</span>
                    </div>
                    <div class="led-labels">
                        <span>WW</span><span>DD</span><span>HH</span><span>MM</span><span>SS</span>
                    </div>
                </div>
                <footer class="timer-footer"><span class="stats"></span></footer>
            `;
        }

        cacheElements() {
            this.elements = {
                editBtn: this.container.querySelector('.edit-btn'),
                titleDisplay: this.container.querySelector('.timer-title-display'),
                descriptionDisplay: this.container.querySelector('.timer-description-display'),
                weeksCount: this.container.querySelector('.weeks-count'),
                targetSubtitle: this.container.querySelector('.target-subtitle'),
                weeksSection: this.container.querySelector('.weeks-section'),
                ledWeeks: this.container.querySelector('.led-weeks'),
                ledDays: this.container.querySelector('.led-days'),
                ledHours: this.container.querySelector('.led-hours'),
                ledMinutes: this.container.querySelector('.led-minutes'),
                ledSeconds: this.container.querySelector('.led-seconds'),
                stats: this.container.querySelector('.stats')
            };

            // Bind edit button
            this.elements.editBtn.addEventListener('click', () => {
                Modal.openForEdit(this);
            });
        }

        updateHeader() {
            const { title, description } = this.data;

            if (title) {
                this.elements.titleDisplay.textContent = title;
                this.elements.weeksCount.textContent = `${this.totalWeeks.toLocaleString()} Weeks`;
            } else {
                this.elements.titleDisplay.textContent = `${this.totalWeeks.toLocaleString()} Weeks`;
                this.elements.weeksCount.textContent = '';
            }

            this.elements.descriptionDisplay.textContent = description || '';
            this.elements.targetSubtitle.textContent =
                `${TimeCalc.formatDate(this.startDate)} → ${TimeCalc.formatDate(this.targetDate)}`;
        }

        update(now) {
            const elapsedWeeks = TimeCalc.getElapsedWeeks(this.startDate, now);
            const remaining = TimeCalc.getRemainingTime(this.targetDate, now);

            this.generateWeeksGrid(elapsedWeeks);
            this.updateLedCountdown(remaining);
            this.updateStats(elapsedWeeks);
        }

        generateWeeksGrid(elapsedWeeks) {
            this.elements.weeksSection.innerHTML = '';
            let weekCounter = 0;

            for (const range of this.yearRanges) {
                const row = document.createElement('div');
                row.className = 'year-row';

                const label = document.createElement('span');
                label.className = 'year-label';
                label.textContent = range.label;
                row.appendChild(label);

                const grid = document.createElement('div');
                grid.className = 'weeks-grid';

                for (let i = 0; i < range.weeks; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'week-cell';

                    if (weekCounter < elapsedWeeks) {
                        cell.classList.add('filled');
                    } else if (weekCounter === elapsedWeeks) {
                        cell.classList.add('current');
                    }

                    grid.appendChild(cell);
                    weekCounter++;
                }

                row.appendChild(grid);
                this.elements.weeksSection.appendChild(row);
            }
        }

        updateLedCountdown(remaining) {
            const pad = (n) => String(n).padStart(2, '0');
            this.elements.ledWeeks.textContent = pad(remaining.weeks);
            this.elements.ledDays.textContent = pad(remaining.days);
            this.elements.ledHours.textContent = pad(remaining.hours);
            this.elements.ledMinutes.textContent = pad(remaining.minutes);
            this.elements.ledSeconds.textContent = pad(remaining.seconds);
        }

        updateStats(elapsedWeeks) {
            const remainingWeeks = this.totalWeeks - elapsedWeeks;
            const remainingDays = remainingWeeks * 7;

            this.elements.stats.textContent =
                `${remainingWeeks.toLocaleString()} weeks remaining | ` +
                `${remainingDays.toLocaleString()} days | ` +
                `${elapsedWeeks.toLocaleString()} weeks elapsed`;
        }

        destroy() {
            this.container.remove();
        }

        getData() {
            return { ...this.data };
        }

        updateData(newData) {
            this.data = { ...this.data, ...newData };
            this.startDate = TimeCalc.parseDate(this.data.startDate);
            this.targetDate = TimeCalc.parseDate(this.data.targetDate);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);
            this.updateHeader();
            this.update(new Date());
        }
    }

    // ==================== TimerManager Module ====================
    const TimerManager = {
        timers: new Map(),
        container: null,
        running: false,
        lastSecond: -1,

        init(containerElement) {
            this.container = containerElement;
        },

        async loadTimers() {
            const { timers } = await Storage.get();

            // Check for legacy migration if no timers exist
            if (timers.length === 0) {
                const migrated = await Storage.migrateFromLegacy();
                if (migrated) {
                    this.createTimer(migrated, false);
                    return;
                }
            }

            // Load existing timers
            for (const timerData of timers) {
                this.createTimer(timerData, false);
            }
        },

        createTimer(data, isNew = true) {
            const containerEl = document.createElement('div');
            containerEl.className = 'countdown-container';
            containerEl.dataset.timerId = data.id;
            this.container.appendChild(containerEl);

            const timer = new Timer(data.id, data, containerEl);
            timer.init();
            this.timers.set(data.id, timer);

            return timer;
        },

        async addNewTimer(data) {
            const timerData = await Storage.addTimer(data);
            return this.createTimer(timerData, true);
        },

        async updateTimer(id, data) {
            const timer = this.timers.get(id);
            if (timer) {
                await Storage.updateTimer(id, data);
                timer.updateData(data);
            }
        },

        async deleteTimer(id) {
            const timer = this.timers.get(id);
            if (timer) {
                timer.destroy();
                this.timers.delete(id);
                await Storage.deleteTimer(id);
            }
        },

        getTimerCount() {
            return this.timers.size;
        },

        start() {
            this.running = true;
            this.tick();
        },

        stop() {
            this.running = false;
        },

        tick() {
            if (!this.running) return;

            const now = new Date();
            const currentSecond = now.getSeconds();

            if (currentSecond !== this.lastSecond) {
                this.lastSecond = currentSecond;

                // Update global time display
                GlobalTimeDisplay.update(now);

                // Update all timers
                for (const timer of this.timers.values()) {
                    timer.update(now);
                }
            }

            requestAnimationFrame(() => this.tick());
        }
    };

    // ==================== Modal Module ====================
    const Modal = {
        mode: 'create', // 'create' | 'edit'
        editingTimerId: null,
        elements: {},

        init() {
            this.elements = {
                overlay: document.getElementById('config-modal'),
                title: document.querySelector('#config-modal .modal h2'),
                description: document.querySelector('#config-modal .modal p'),
                startDateInput: document.getElementById('start-date'),
                targetDateInput: document.getElementById('target-date'),
                titleInput: document.getElementById('timer-title'),
                descriptionInput: document.getElementById('timer-description'),
                saveBtn: document.getElementById('save-config'),
                cancelBtn: document.getElementById('cancel-config'),
                deleteBtn: document.getElementById('delete-timer')
            };

            this.bindEvents();
        },

        bindEvents() {
            this.elements.saveBtn.addEventListener('click', () => this.save());
            this.elements.cancelBtn.addEventListener('click', () => this.close());
            this.elements.deleteBtn.addEventListener('click', () => this.delete());
        },

        openForCreate() {
            this.mode = 'create';
            this.editingTimerId = null;

            // Update modal UI
            this.elements.title.textContent = 'Create Timer';
            this.elements.description.textContent = 'Set your target date to see remaining weeks and track time.';
            this.elements.saveBtn.textContent = 'Create';
            this.elements.deleteBtn.classList.add('hidden');

            // Set defaults
            const today = new Date();
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

            this.elements.startDateInput.value = this.formatInputDate(today);
            this.elements.targetDateInput.value = this.formatInputDate(oneYearFromNow);
            this.elements.titleInput.value = '';
            this.elements.descriptionInput.value = '';

            // Show cancel only if there are existing timers
            this.elements.cancelBtn.classList.toggle('hidden', TimerManager.getTimerCount() === 0);

            this.show();
        },

        openForEdit(timer) {
            this.mode = 'edit';
            this.editingTimerId = timer.id;

            // Update modal UI
            this.elements.title.textContent = 'Edit Timer';
            this.elements.description.textContent = 'Update your timer settings.';
            this.elements.saveBtn.textContent = 'Save';
            this.elements.deleteBtn.classList.remove('hidden');
            this.elements.cancelBtn.classList.remove('hidden');

            // Populate with timer data
            const data = timer.getData();
            this.elements.startDateInput.value = data.startDate;
            this.elements.targetDateInput.value = data.targetDate;
            this.elements.titleInput.value = data.title || '';
            this.elements.descriptionInput.value = data.description || '';

            this.show();
        },

        formatInputDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        },

        show() {
            this.elements.overlay.classList.remove('hidden');
        },

        close() {
            this.elements.overlay.classList.add('hidden');
        },

        async save() {
            const startValue = this.elements.startDateInput.value;
            const targetValue = this.elements.targetDateInput.value;
            const titleValue = this.elements.titleInput.value;
            const descriptionValue = this.elements.descriptionInput.value;

            if (!startValue || !targetValue) {
                alert('Please fill in both dates.');
                return;
            }

            const startDate = TimeCalc.parseDate(startValue);
            const targetDate = TimeCalc.parseDate(targetValue);

            if (targetDate <= startDate) {
                alert('Target date must be after start date.');
                return;
            }

            const data = {
                startDate: startValue,
                targetDate: targetValue,
                title: titleValue,
                description: descriptionValue
            };

            try {
                if (this.mode === 'create') {
                    await TimerManager.addNewTimer(data);
                } else {
                    await TimerManager.updateTimer(this.editingTimerId, data);
                }
                this.close();
            } catch (e) {
                console.error('Failed to save timer:', e);
                alert('Failed to save timer. Please try again.');
            }
        },

        async delete() {
            if (!this.editingTimerId) return;

            if (confirm('Are you sure you want to delete this timer?')) {
                await TimerManager.deleteTimer(this.editingTimerId);
                this.close();

                // If no timers left, open create modal
                if (TimerManager.getTimerCount() === 0) {
                    this.openForCreate();
                }
            }
        }
    };

    // ==================== App Module ====================
    const App = {
        async init() {
            console.log('App.init() starting');

            // Initialize modules
            GlobalTimeDisplay.init();
            Modal.init();
            TimerManager.init(document.getElementById('timers-grid'));

            // Bind add button
            const addBtn = document.getElementById('add-timer-btn');
            addBtn.addEventListener('click', () => Modal.openForCreate());

            // Load timers
            await TimerManager.loadTimers();

            // If no timers, show create modal
            if (TimerManager.getTimerCount() === 0) {
                Modal.openForCreate();
            }

            // Start the update loop
            TimerManager.start();
        }
    };

    // Initialize the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})();
