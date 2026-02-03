(function() {
    'use strict';

    // ==================== Storage Module ====================
    const Storage = {
        KEY_TARGET: 'speedrun_target_date',
        KEY_START: 'speedrun_start_date',
        KEY_TITLE: 'speedrun_title',
        KEY_DESCRIPTION: 'speedrun_description',

        async get() {
            // Try chrome.storage.sync first, fall back to localStorage
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.get([this.KEY_TARGET, this.KEY_START, this.KEY_TITLE, this.KEY_DESCRIPTION], (result) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                                resolve({
                                    targetDate: localStorage.getItem(this.KEY_TARGET),
                                    startDate: localStorage.getItem(this.KEY_START),
                                    title: localStorage.getItem(this.KEY_TITLE),
                                    description: localStorage.getItem(this.KEY_DESCRIPTION)
                                });
                            } else {
                                resolve({
                                    targetDate: result[this.KEY_TARGET] || null,
                                    startDate: result[this.KEY_START] || null,
                                    title: result[this.KEY_TITLE] || null,
                                    description: result[this.KEY_DESCRIPTION] || null
                                });
                            }
                        });
                    });
                } catch (e) {
                    console.warn('Chrome storage exception, using localStorage:', e);
                    return {
                        targetDate: localStorage.getItem(this.KEY_TARGET),
                        startDate: localStorage.getItem(this.KEY_START),
                        title: localStorage.getItem(this.KEY_TITLE),
                        description: localStorage.getItem(this.KEY_DESCRIPTION)
                    };
                }
            }
            return {
                targetDate: localStorage.getItem(this.KEY_TARGET),
                startDate: localStorage.getItem(this.KEY_START),
                title: localStorage.getItem(this.KEY_TITLE),
                description: localStorage.getItem(this.KEY_DESCRIPTION)
            };
        },

        async set(startDate, targetDate, title, description) {
            // Always save to localStorage as backup
            localStorage.setItem(this.KEY_START, startDate);
            localStorage.setItem(this.KEY_TARGET, targetDate);
            if (title !== undefined) localStorage.setItem(this.KEY_TITLE, title || '');
            if (description !== undefined) localStorage.setItem(this.KEY_DESCRIPTION, description || '');

            // Try chrome.storage.sync if available
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.set({
                            [this.KEY_START]: startDate,
                            [this.KEY_TARGET]: targetDate,
                            [this.KEY_TITLE]: title || '',
                            [this.KEY_DESCRIPTION]: description || ''
                        }, () => {
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
            // Day of week: 0 = Monday, 6 = Sunday (ISO week)
            const jsDay = now.getDay(); // 0 = Sunday
            const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

            // Week of year (ISO week number)
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now - startOfYear) / this.MS_PER_DAY);
            const weekOfYear = Math.ceil((days + startOfYear.getDay() + 1) / 7);

            // Month name (full)
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

    // ==================== DOM Module ====================
    const DOM = {
        elements: {},

        init() {
            this.elements = {
                configModal: document.getElementById('config-modal'),
                startDateInput: document.getElementById('start-date'),
                targetDateInput: document.getElementById('target-date'),
                titleInput: document.getElementById('timer-title'),
                descriptionInput: document.getElementById('timer-description'),
                saveConfigBtn: document.getElementById('save-config'),
                cancelConfigBtn: document.getElementById('cancel-config'),
                settingsBtn: document.getElementById('settings-btn'),
                editBtn: document.getElementById('edit-btn'),
                titleDisplay: document.getElementById('timer-title-display'),
                descriptionDisplay: document.getElementById('timer-description-display'),
                weeksCount: document.getElementById('weeks-count'),
                targetSubtitle: document.getElementById('target-subtitle'),
                weeksSection: document.getElementById('weeks-section'),
                daysGrid: document.getElementById('days-grid'),
                hoursGrid: document.getElementById('hours-grid'),
                minutesGrid: document.getElementById('minutes-grid'),
                secondsGrid: document.getElementById('seconds-grid'),
                weekLabel: document.getElementById('week-label'),
                dateLabel: document.getElementById('date-label'),
                timeLabel: document.getElementById('time-label'),
                secondsLabel: document.getElementById('seconds-label'),
                hourglass: document.getElementById('hourglass'),
                stats: document.getElementById('stats'),
                ledWeeks: document.getElementById('led-weeks'),
                ledDays: document.getElementById('led-days'),
                ledHours: document.getElementById('led-hours'),
                ledMinutes: document.getElementById('led-minutes'),
                ledSeconds: document.getElementById('led-seconds')
            };
        },

        showModal(isFirstRun = false) {
            this.elements.configModal.classList.remove('hidden');
            this.elements.cancelConfigBtn.classList.toggle('hidden', isFirstRun);
        },

        hideModal() {
            this.elements.configModal.classList.add('hidden');
        },

        updateHeader(totalWeeks, startDate, targetDate, title, description) {
            // Show title or fallback to weeks count
            if (title) {
                this.elements.titleDisplay.textContent = title;
                this.elements.weeksCount.textContent = `${totalWeeks.toLocaleString()} Weeks`;
            } else {
                this.elements.titleDisplay.textContent = `${totalWeeks.toLocaleString()} Weeks`;
                this.elements.weeksCount.textContent = '';
            }
            this.elements.descriptionDisplay.textContent = description || '';
            this.elements.targetSubtitle.textContent = `${TimeCalc.formatDate(startDate)} → ${TimeCalc.formatDate(targetDate)}`;
        },

        updateLedCountdown(remaining) {
            const pad = (n) => String(n).padStart(2, '0');
            this.elements.ledWeeks.textContent = pad(remaining.weeks);
            this.elements.ledDays.textContent = pad(remaining.days);
            this.elements.ledHours.textContent = pad(remaining.hours);
            this.elements.ledMinutes.textContent = pad(remaining.minutes);
            this.elements.ledSeconds.textContent = pad(remaining.seconds);
        },

        generateWeeksGrid(yearRanges, elapsedWeeks, currentWeekIndex) {
            this.elements.weeksSection.innerHTML = '';
            let weekCounter = 0;

            for (const range of yearRanges) {
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
                    } else if (weekCounter === currentWeekIndex) {
                        cell.classList.add('current');
                    }

                    grid.appendChild(cell);
                    weekCounter++;
                }

                row.appendChild(grid);
                this.elements.weeksSection.appendChild(row);
            }
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

        updateStats(totalWeeks, elapsedWeeks) {
            const remainingWeeks = totalWeeks - elapsedWeeks;
            const remainingDays = remainingWeeks * 7;

            this.elements.stats.textContent =
                `${remainingWeeks.toLocaleString()} weeks remaining | ` +
                `${remainingDays.toLocaleString()} days | ` +
                `${elapsedWeeks.toLocaleString()} weeks elapsed`;
        },

        updateCounterLabels(time) {
            const pad = (n) => String(n).padStart(2, '0');

            this.elements.weekLabel.textContent = `Week ${time.weekOfYear}, ${time.year}`;
            this.elements.dateLabel.textContent = `${time.month} ${time.dayOfMonth}`;
            this.elements.timeLabel.textContent = `${pad(time.hour)}:${pad(time.minute)}`;
            this.elements.secondsLabel.textContent = `:${pad(time.second)}`;

            // Flip hourglass every second (odd/even)
            if (this.elements.hourglass) {
                this.elements.hourglass.classList.toggle('flipped', time.second % 2 === 1);
            }
        }
    };

    // ==================== UpdateLoop Module ====================
    const UpdateLoop = {
        lastSecond: -1,
        targetDate: null,
        startDate: null,
        totalWeeks: 0,
        yearRanges: [],
        running: false,
        title: '',
        description: '',

        init(startDateString, targetDateString, title, description) {
            this.startDate = TimeCalc.parseDate(startDateString);
            this.targetDate = TimeCalc.parseDate(targetDateString);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);
            this.title = title || '';
            this.description = description || '';

            // Generate static time grids
            DOM.generateTimeGrid(DOM.elements.daysGrid, 7);
            DOM.generateTimeGrid(DOM.elements.hoursGrid, 24);
            DOM.generateTimeGrid(DOM.elements.minutesGrid, 60);
            DOM.generateTimeGrid(DOM.elements.secondsGrid, 60);

            // Update header
            DOM.updateHeader(this.totalWeeks, this.startDate, this.targetDate, this.title, this.description);

            // Initial render
            this.update();

            // Start the loop
            this.running = true;
            this.tick();
        },

        tick() {
            if (!this.running) return;

            const now = new Date();
            const currentSecond = now.getSeconds();

            // Only update on second change
            if (currentSecond !== this.lastSecond) {
                this.lastSecond = currentSecond;
                this.update();
            }

            requestAnimationFrame(() => this.tick());
        },

        update() {
            const now = new Date();
            const time = TimeCalc.getCurrentTimeBreakdown(now);
            const elapsedWeeks = TimeCalc.getElapsedWeeks(this.startDate, now);
            const remaining = TimeCalc.getRemainingTime(this.targetDate, now);

            // Update counter labels
            DOM.updateCounterLabels(time);

            // Update weeks grid
            DOM.generateWeeksGrid(this.yearRanges, elapsedWeeks, elapsedWeeks);

            // Update time grids
            DOM.updateTimeGrid(DOM.elements.daysGrid, time.dayOfWeek, 7);
            DOM.updateTimeGrid(DOM.elements.hoursGrid, time.hour, 24);
            DOM.updateTimeGrid(DOM.elements.minutesGrid, time.minute, 60);
            DOM.updateTimeGrid(DOM.elements.secondsGrid, time.second, 60);

            // Update LED countdown
            DOM.updateLedCountdown(remaining);

            // Update stats
            DOM.updateStats(this.totalWeeks, elapsedWeeks);
        },

        stop() {
            this.running = false;
        }
    };

    // ==================== App Module ====================
    const App = {
        async init() {
            console.log('App.init() starting');
            DOM.init();
            this.bindEvents();

            try {
                const saved = await Storage.get();
                console.log('Saved config:', saved);

                if (saved.startDate && saved.targetDate) {
                    UpdateLoop.init(saved.startDate, saved.targetDate, saved.title, saved.description);
                    DOM.elements.startDateInput.value = saved.startDate;
                    DOM.elements.targetDateInput.value = saved.targetDate;
                    DOM.elements.titleInput.value = saved.title || '';
                    DOM.elements.descriptionInput.value = saved.description || '';
                } else {
                    // Show configuration modal on first run
                    console.log('No saved config, showing modal');
                    DOM.showModal(true);
                    // Set default start date to today
                    DOM.elements.startDateInput.value = this.formatInputDate(new Date());
                    // Set default target date to 1 year from now
                    const defaultTarget = new Date();
                    defaultTarget.setFullYear(defaultTarget.getFullYear() + 1);
                    DOM.elements.targetDateInput.value = this.formatInputDate(defaultTarget);
                }
            } catch (e) {
                console.error('Init error:', e);
                DOM.showModal(true);
            }
        },

        formatInputDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        },

        bindEvents() {
            console.log('Binding events, saveBtn:', DOM.elements.saveConfigBtn);

            DOM.elements.settingsBtn.addEventListener('click', () => {
                DOM.showModal(false);
            });

            DOM.elements.editBtn.addEventListener('click', () => {
                DOM.showModal(false);
            });

            DOM.elements.saveConfigBtn.addEventListener('click', async () => {
                const startValue = DOM.elements.startDateInput.value;
                const targetValue = DOM.elements.targetDateInput.value;
                const titleValue = DOM.elements.titleInput.value;
                const descriptionValue = DOM.elements.descriptionInput.value;
                console.log('Save clicked, startDate:', startValue, 'targetDate:', targetValue);

                if (!startValue || !targetValue) {
                    console.log('Missing date value');
                    alert('Please fill in both dates.');
                    return;
                }

                const startDate = TimeCalc.parseDate(startValue);
                const targetDate = TimeCalc.parseDate(targetValue);
                console.log('Start date:', startDate, 'Target date:', targetDate);

                if (targetDate <= startDate) {
                    alert('Target date must be after start date.');
                    return;
                }

                try {
                    await Storage.set(startValue, targetValue, titleValue, descriptionValue);
                    console.log('Config saved successfully');
                    DOM.hideModal();

                    // Restart the update loop with new dates
                    UpdateLoop.stop();
                    UpdateLoop.init(startValue, targetValue, titleValue, descriptionValue);
                } catch (e) {
                    console.error('Failed to save:', e);
                    alert('Failed to save configuration. Please try again.');
                }
            });

            DOM.elements.cancelConfigBtn.addEventListener('click', () => {
                DOM.hideModal();
            });
        }
    };

    // Initialize the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})();
