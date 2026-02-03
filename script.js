(function() {
    'use strict';

    // ==================== Storage Module ====================
    const Storage = {
        KEY_CONTAINERS: 'speedrun_containers',
        KEY_SETTINGS: 'speedrun_settings',
        // Legacy keys for migration
        LEGACY_KEYS: {
            target: 'speedrun_target_date',
            start: 'speedrun_start_date',
            title: 'speedrun_title',
            description: 'speedrun_description',
            timers: 'speedrun_timers'
        },

        generateId() {
            return `container_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        },

        async get() {
            // Try chrome.storage.sync first, fall back to localStorage
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.get([this.KEY_CONTAINERS], (result) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                                resolve(this.getFromLocalStorage());
                            } else {
                                const containers = result[this.KEY_CONTAINERS];
                                if (containers && Array.isArray(containers)) {
                                    resolve({ containers });
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
            // First try the new key
            let stored = localStorage.getItem(this.KEY_CONTAINERS);
            if (stored) {
                try {
                    const containers = JSON.parse(stored);
                    if (Array.isArray(containers)) {
                        return { containers };
                    }
                } catch (e) {
                    console.warn('Failed to parse stored containers:', e);
                }
            }

            // Try legacy timers key and migrate
            stored = localStorage.getItem(this.LEGACY_KEYS.timers);
            if (stored) {
                try {
                    const timers = JSON.parse(stored);
                    if (Array.isArray(timers)) {
                        const containers = this.migrateTimersToContainers(timers);
                        // Save migrated data
                        this.set(containers);
                        // Remove old key
                        localStorage.removeItem(this.LEGACY_KEYS.timers);
                        return { containers };
                    }
                } catch (e) {
                    console.warn('Failed to parse legacy timers:', e);
                }
            }

            return { containers: [] };
        },

        migrateTimersToContainers(timers) {
            return timers.map(timer => ({
                id: timer.id.replace('timer_', 'container_'),
                type: 'countdown',
                title: timer.title || '',
                description: timer.description || '',
                height: timer.height || 2,
                column: timer.column !== undefined ? timer.column : 0,
                createdAt: timer.createdAt || Date.now(),
                data: {
                    startDate: timer.startDate,
                    targetDate: timer.targetDate
                }
            }));
        },

        async set(containers) {
            const data = JSON.stringify(containers);

            try {
                localStorage.setItem(this.KEY_CONTAINERS, data);
            } catch (e) {
                console.error('localStorage quota exceeded or unavailable:', e);
                throw new Error('Failed to save data. Storage quota may be exceeded.');
            }

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.set({ [this.KEY_CONTAINERS]: containers }, () => {
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

        async addContainer(containerData) {
            const { containers } = await this.get();
            const newContainer = {
                id: this.generateId(),
                type: containerData.type || 'countdown',
                title: containerData.title || '',
                description: containerData.description || '',
                height: containerData.height || 2,
                column: containerData.column !== undefined ? containerData.column : 0,
                createdAt: Date.now(),
                data: containerData.data || {}
            };
            containers.push(newContainer);
            await this.set(containers);
            return newContainer;
        },

        async updateContainer(id, data) {
            const { containers } = await this.get();
            const index = containers.findIndex(c => c.id === id);
            if (index !== -1) {
                containers[index] = { ...containers[index], ...data };
                await this.set(containers);
                return containers[index];
            }
            return null;
        },

        async deleteContainer(id) {
            const { containers } = await this.get();
            const filtered = containers.filter(c => c.id !== id);
            await this.set(filtered);
            return filtered;
        },

        async getSettings() {
            // Try chrome.storage.sync first, fall back to localStorage
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.get([this.KEY_SETTINGS], (result) => {
                            if (chrome.runtime.lastError) {
                                resolve(this.getSettingsFromLocalStorage());
                            } else {
                                const settings = result[this.KEY_SETTINGS];
                                if (settings) {
                                    resolve(settings);
                                } else {
                                    resolve(null);
                                }
                            }
                        });
                    });
                } catch (e) {
                    return this.getSettingsFromLocalStorage();
                }
            }
            return this.getSettingsFromLocalStorage();
        },

        getSettingsFromLocalStorage() {
            const stored = localStorage.getItem(this.KEY_SETTINGS);
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    return null;
                }
            }
            return null;
        },

        async setSettings(settings) {
            const data = JSON.stringify(settings);
            localStorage.setItem(this.KEY_SETTINGS, data);

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    return new Promise((resolve) => {
                        chrome.storage.sync.set({ [this.KEY_SETTINGS]: settings }, () => {
                            resolve();
                        });
                    });
                } catch (e) {
                    // Ignore chrome storage errors
                }
            }
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
                const newContainer = await this.addContainer({
                    type: 'countdown',
                    title: legacyData.title,
                    description: legacyData.description,
                    data: {
                        startDate: legacyData.startDate,
                        targetDate: legacyData.targetDate
                    }
                });

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

                return newContainer;
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

    // ==================== Base Container Class ====================
    class Container {
        static get type() { return 'base'; }

        constructor(id, data, containerElement) {
            this.id = id;
            this.data = data;
            this.container = containerElement;
            this.elements = {};
        }

        init() {
            this.render();
            this.cacheElements();
            this.applyHeight();
            this.updateHeader();
        }

        render() {
            this.container.innerHTML = `
                <div class="height-controls">
                    <button class="height-btn height-down" title="Decrease height">&#x25B2;</button>
                    <button class="height-btn height-up" title="Increase height">&#x25BC;</button>
                </div>
                <button class="info-btn" title="Info">&#x2139;</button>
                <button class="expand-btn" title="Expand">&#x26F6;</button>
                <button class="edit-btn" title="Edit">&#128295;</button>
                <button class="close-btn" title="Close">&#x2715;</button>
                <div class="info-popup">
                    <div class="info-title"></div>
                    <div class="info-description"></div>
                </div>
                <header>
                    <h2 class="container-title-display">${this.getDefaultTitle()}</h2>
                    <div class="container-description-display subtitle"></div>
                </header>
                <div class="container-body">
                    ${this.renderBody()}
                </div>
            `;
        }

        renderBody() {
            // Subclasses override this
            return '';
        }

        cacheElements() {
            this.elements = {
                heightUpBtn: this.container.querySelector('.height-up'),
                heightDownBtn: this.container.querySelector('.height-down'),
                editBtn: this.container.querySelector('.edit-btn'),
                expandBtn: this.container.querySelector('.expand-btn'),
                closeBtn: this.container.querySelector('.close-btn'),
                infoBtn: this.container.querySelector('.info-btn'),
                infoPopup: this.container.querySelector('.info-popup'),
                infoTitle: this.container.querySelector('.info-title'),
                infoDescription: this.container.querySelector('.info-description'),
                titleDisplay: this.container.querySelector('.container-title-display'),
                descriptionDisplay: this.container.querySelector('.container-description-display'),
                body: this.container.querySelector('.container-body')
            };

            // Bind height control buttons
            this.elements.heightUpBtn.addEventListener('click', () => this.adjustHeight(1));
            this.elements.heightDownBtn.addEventListener('click', () => this.adjustHeight(-1));

            // Bind edit button
            this.elements.editBtn.addEventListener('click', () => {
                Modal.openForEdit(this);
            });

            // Bind expand/close buttons
            this.elements.expandBtn.addEventListener('click', () => this.enterFullscreen());
            this.elements.closeBtn.addEventListener('click', () => this.exitFullscreen());

            // Bind info button toggle
            this.elements.infoBtn.addEventListener('click', () => {
                this.elements.infoPopup.classList.toggle('visible');
            });

            // Cache type-specific elements
            this.cacheTypeElements();
        }

        cacheTypeElements() {
            // Subclasses override this
        }

        getDefaultTitle() {
            return 'Container';
        }

        updateHeader() {
            const { title, description } = this.data;

            this.elements.titleDisplay.textContent = title || this.getDefaultTitle();
            this.elements.descriptionDisplay.textContent = description || '';

            // Populate info popup
            this.elements.infoTitle.textContent = title || this.getDefaultTitle();
            this.elements.infoDescription.textContent = description || '';
        }

        applyHeight() {
            // Remove existing height classes
            for (let i = 1; i <= 5; i++) {
                this.container.classList.remove(`height-${i}`);
            }
            // Apply current height class (default to 2 if not set)
            const height = this.data.height || 2;
            this.container.classList.add(`height-${height}`);
        }

        async adjustHeight(delta) {
            const currentHeight = this.data.height || 2;
            const newHeight = Math.max(1, Math.min(5, currentHeight + delta));

            if (newHeight !== currentHeight) {
                this.data.height = newHeight;
                this.applyHeight();
                await Storage.updateContainer(this.id, { height: newHeight });
            }
        }

        update(now) {
            // Subclasses override this if they need time updates
        }

        destroy() {
            this.container.remove();
        }

        enterFullscreen() {
            this.container.classList.add('fullscreen');
            document.addEventListener('keydown', this.handleEsc);
        }

        exitFullscreen() {
            this.container.classList.remove('fullscreen');
            document.removeEventListener('keydown', this.handleEsc);
        }

        handleEsc = (e) => {
            if (e.key === 'Escape') this.exitFullscreen();
        }

        getData() {
            return { ...this.data };
        }

        updateData(newData) {
            this.data = { ...this.data, ...newData };
            this.updateHeader();
            this.onDataUpdated();
        }

        onDataUpdated() {
            // Subclasses override this
        }
    }

    // ==================== CountdownContainer Class ====================
    class CountdownContainer extends Container {
        static get type() { return 'countdown'; }

        constructor(id, data, containerElement) {
            super(id, data, containerElement);
            this.isFullscreenMode = false;
            this.initCountdownData();
        }

        initCountdownData() {
            const typeData = this.data.data || {};
            this.startDate = TimeCalc.parseDate(typeData.startDate);
            this.targetDate = TimeCalc.parseDate(typeData.targetDate);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);

            // Initialize todos array if not present
            if (!typeData.todos) {
                typeData.todos = [];
            }
            this.todos = typeData.todos;

            // Read showTodos flag (default true for backward compatibility)
            this.showTodos = typeData.showTodos !== false;

            // Check if countdown is short-term (< 7 days)
            const now = new Date();
            const diffMs = this.targetDate - now;
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            this.isShortTerm = diffDays < 7 && diffDays > 0;
        }

        init() {
            super.init();
            this.update(new Date());
        }

        getDefaultTitle() {
            return `${this.totalWeeks.toLocaleString()} Weeks`;
        }

        renderBody() {
            return `
                <div class="countdown-header-info">
                    <div class="weeks-count"></div>
                    <div class="target-subtitle subtitle">Configure your target date</div>
                </div>
                <section class="weeks-section"></section>
                <section class="todo-section">
                    <div class="todo-list"></div>
                    <div class="todo-input-row">
                        <input type="text" class="todo-input" placeholder="Add task...">
                        <button class="todo-add-btn">+</button>
                    </div>
                </section>
                <div class="led-countdown">
                    <div class="led-time">
                        <span class="led-days">0000</span>D : <span class="led-hours">00</span>H : <span class="led-minutes">00</span>M : <span class="led-seconds">00</span>S
                    </div>
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                    <span class="progress-percent">0%</span>
                </div>
                <footer class="container-footer"><span class="stats"></span></footer>
            `;
        }

        cacheTypeElements() {
            this.elements.weeksCount = this.container.querySelector('.weeks-count');
            this.elements.targetSubtitle = this.container.querySelector('.target-subtitle');
            this.elements.weeksSection = this.container.querySelector('.weeks-section');
            this.elements.ledDays = this.container.querySelector('.led-days');
            this.elements.ledHours = this.container.querySelector('.led-hours');
            this.elements.ledMinutes = this.container.querySelector('.led-minutes');
            this.elements.ledSeconds = this.container.querySelector('.led-seconds');
            this.elements.progressFill = this.container.querySelector('.progress-fill');
            this.elements.progressPercent = this.container.querySelector('.progress-percent');
            this.elements.stats = this.container.querySelector('.stats');

            // Todo elements
            this.elements.todoSection = this.container.querySelector('.todo-section');
            this.elements.todoList = this.container.querySelector('.todo-list');
            this.elements.todoInput = this.container.querySelector('.todo-input');
            this.elements.todoAddBtn = this.container.querySelector('.todo-add-btn');

            // Bind todo events
            this.elements.todoAddBtn.addEventListener('click', () => this.addTodoFromInput());
            this.elements.todoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTodoFromInput();
                }
            });

            // Render existing todos
            this.renderTodos();

            // Apply short-term visibility
            this.updateWeeksSectionVisibility();

            // Apply todo section visibility
            this.updateTodoSectionVisibility();
        }

        updateHeader() {
            super.updateHeader();

            const { title } = this.data;

            if (title) {
                this.elements.weeksCount.textContent = `${this.totalWeeks.toLocaleString()} Weeks`;
            } else {
                this.elements.weeksCount.textContent = '';
            }

            this.elements.targetSubtitle.textContent =
                `${TimeCalc.formatDate(this.startDate)} → ${TimeCalc.formatDate(this.targetDate)}`;

            // Update info popup with countdown-specific info
            this.elements.infoTitle.textContent = `${this.totalWeeks.toLocaleString()} Weeks`;
            this.elements.infoDescription.innerHTML =
                `${TimeCalc.formatDate(this.startDate)} → ${TimeCalc.formatDate(this.targetDate)}` +
                (this.data.description ? `<br><br>${this.data.description}` : '');
        }

        update(now) {
            const elapsedWeeks = TimeCalc.getElapsedWeeks(this.startDate, now);
            const remaining = TimeCalc.getRemainingTime(this.targetDate, now);

            // Generate appropriate weeks grid
            if (!this.isShortTerm) {
                if (this.isFullscreenMode) {
                    this.generateFullscreenWeeksGrid(elapsedWeeks);
                } else {
                    this.elements.weeksSection.classList.remove('fullscreen-grid');
                    this.generateWeeksGrid(elapsedWeeks);
                }
            }
            this.updateLedCountdown(remaining);
            this.updateStats(elapsedWeeks);

            // Update progress bar once per minute (when seconds = 0) or on first call
            const currentSecond = now.getSeconds();
            if (currentSecond === 0 || this.lastProgressUpdate === undefined) {
                this.updateProgress();
                this.lastProgressUpdate = now.getMinutes();
            }
        }

        updateWeeksSectionVisibility() {
            if (this.elements.weeksSection) {
                if (this.isShortTerm) {
                    this.elements.weeksSection.classList.add('hidden');
                } else {
                    this.elements.weeksSection.classList.remove('hidden');
                }
            }
        }

        updateTodoSectionVisibility() {
            if (this.elements.todoSection) {
                this.elements.todoSection.classList.toggle('hidden', !this.showTodos);
            }
        }

        enterFullscreen() {
            super.enterFullscreen();
            this.isFullscreenMode = true;
            this.update(new Date());
        }

        exitFullscreen() {
            super.exitFullscreen();
            this.isFullscreenMode = false;
            this.update(new Date());
        }

        generateFullscreenWeeksGrid(elapsedWeeks) {
            this.elements.weeksSection.innerHTML = '';
            this.elements.weeksSection.classList.add('fullscreen-grid');

            const grid = document.createElement('div');
            grid.className = 'weeks-grid-landscape';

            for (let i = 0; i < this.totalWeeks; i++) {
                const cell = document.createElement('div');
                cell.className = 'week-cell';

                if (i < elapsedWeeks) {
                    cell.classList.add('filled');
                } else if (i === elapsedWeeks) {
                    cell.classList.add('current');
                }

                grid.appendChild(cell);
            }

            this.elements.weeksSection.appendChild(grid);
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

            // Scroll current week into view
            const currentCell = this.elements.weeksSection.querySelector('.week-cell.current');
            if (currentCell) {
                currentCell.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
        }

        updateLedCountdown(remaining) {
            const pad = (n, len = 2) => String(n).padStart(len, '0');
            const totalDays = remaining.weeks * 7 + remaining.days;
            this.elements.ledDays.textContent = pad(totalDays, 4);
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

        updateProgress() {
            const total = this.targetDate - this.startDate;
            const elapsed = Date.now() - this.startDate;
            const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
            this.elements.progressFill.style.width = `${percent}%`;
            if (this.elements.progressPercent) {
                this.elements.progressPercent.textContent = `${Math.round(percent)}%`;
            }
        }

        // ==================== TODO List Methods ====================

        renderTodos() {
            this.elements.todoList.innerHTML = '';

            for (const todo of this.todos) {
                const todoItem = document.createElement('div');
                todoItem.className = 'todo-item' + (todo.completed ? ' completed' : '');
                todoItem.dataset.todoId = todo.id;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'todo-checkbox';
                checkbox.checked = todo.completed;
                checkbox.addEventListener('change', () => this.toggleTodo(todo.id));

                const text = document.createElement('span');
                text.className = 'todo-text';
                text.textContent = todo.text;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'todo-remove-btn';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Remove task';
                removeBtn.addEventListener('click', () => this.removeTodo(todo.id));

                todoItem.appendChild(checkbox);
                todoItem.appendChild(text);
                todoItem.appendChild(removeBtn);
                this.elements.todoList.appendChild(todoItem);
            }
        }

        addTodoFromInput() {
            const text = this.elements.todoInput.value.trim();
            if (text) {
                this.addTodo(text);
                this.elements.todoInput.value = '';
            }
        }

        addTodo(text) {
            const todo = {
                id: `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                text: text,
                completed: false
            };
            this.todos.push(todo);
            this.saveTodos();
            this.renderTodos();
        }

        toggleTodo(id) {
            const todo = this.todos.find(t => t.id === id);
            if (todo) {
                todo.completed = !todo.completed;
                this.saveTodos();
                this.renderTodos();
            }
        }

        removeTodo(id) {
            const index = this.todos.findIndex(t => t.id === id);
            if (index !== -1) {
                this.todos.splice(index, 1);
                this.saveTodos();
                this.renderTodos();
            }
        }

        async saveTodos() {
            // Update the data object with current todos
            if (!this.data.data) {
                this.data.data = {};
            }
            this.data.data.todos = this.todos;

            // Persist to storage
            await Storage.updateContainer(this.id, { data: this.data.data });
        }

        onDataUpdated() {
            this.initCountdownData();
            this.updateWeeksSectionVisibility();
            this.updateTodoSectionVisibility();
            this.renderTodos();
            this.update(new Date());
        }
    }

    // ==================== ImageContainer Class ====================
    class ImageContainer extends Container {
        static get type() { return 'image'; }

        getDefaultTitle() {
            return 'Image';
        }

        renderBody() {
            const typeData = this.data.data || {};
            const imageUrl = typeData.imageUrl || '';
            const fit = typeData.fit || 'cover';

            return `
                <div class="image-body" data-fit="${fit}">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${this.data.title || 'Image'}" style="object-fit: ${fit};">` : '<div class="image-placeholder">No image set</div>'}
                </div>
            `;
        }

        cacheTypeElements() {
            this.elements.imageBody = this.container.querySelector('.image-body');
            this.elements.image = this.container.querySelector('.image-body img');
        }

        onDataUpdated() {
            const typeData = this.data.data || {};
            const imageUrl = typeData.imageUrl || '';
            const fit = typeData.fit || 'cover';

            this.elements.imageBody.dataset.fit = fit;

            if (imageUrl) {
                if (this.elements.image) {
                    this.elements.image.src = imageUrl;
                    this.elements.image.style.objectFit = fit;
                } else {
                    this.elements.imageBody.innerHTML = `<img src="${imageUrl}" alt="${this.data.title || 'Image'}" style="object-fit: ${fit};">`;
                    this.elements.image = this.elements.imageBody.querySelector('img');
                }
            } else {
                this.elements.imageBody.innerHTML = '<div class="image-placeholder">No image set</div>';
                this.elements.image = null;
            }
        }
    }

    // ==================== TextContainer Class ====================
    class TextContainer extends Container {
        static get type() { return 'text'; }

        getDefaultTitle() {
            return 'Text';
        }

        renderBody() {
            const typeData = this.data.data || {};
            const content = typeData.content || '';
            const fontSize = typeData.fontSize || 'medium';
            const alignment = typeData.alignment || 'center';

            return `
                <div class="text-body" data-font-size="${fontSize}" data-alignment="${alignment}">
                    <div class="text-content">${this.escapeHtml(content) || '<span class="text-placeholder">No content</span>'}</div>
                </div>
            `;
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/\n/g, '<br>');
        }

        cacheTypeElements() {
            this.elements.textBody = this.container.querySelector('.text-body');
            this.elements.textContent = this.container.querySelector('.text-content');
        }

        onDataUpdated() {
            const typeData = this.data.data || {};
            const content = typeData.content || '';
            const fontSize = typeData.fontSize || 'medium';
            const alignment = typeData.alignment || 'center';

            this.elements.textBody.dataset.fontSize = fontSize;
            this.elements.textBody.dataset.alignment = alignment;
            this.elements.textContent.innerHTML = this.escapeHtml(content) || '<span class="text-placeholder">No content</span>';
        }
    }

    // ==================== ContainerFactory ====================
    const ContainerFactory = {
        types: {
            countdown: CountdownContainer,
            image: ImageContainer,
            text: TextContainer
        },

        create(id, data, containerElement) {
            const ContainerClass = this.types[data.type] || CountdownContainer;
            return new ContainerClass(id, data, containerElement);
        },

        getTypeNames() {
            return Object.keys(this.types);
        }
    };

    // ==================== ContainerManager Module ====================
    const ContainerManager = {
        containers: new Map(),
        gridEl: null,
        columnEls: [],
        columnCount: 2,
        running: false,
        lastSecond: -1,

        init(gridElement) {
            this.gridEl = gridElement;
            this.createColumns();
            DragDrop.init(this);
        },

        createColumns() {
            this.gridEl.innerHTML = '';
            this.columnEls = [];

            for (let i = 0; i < this.columnCount; i++) {
                const columnEl = document.createElement('div');
                columnEl.className = 'container-column';
                columnEl.dataset.columnIndex = i;
                this.gridEl.appendChild(columnEl);
                this.columnEls.push(columnEl);
            }
        },

        setColumnCount(count) {
            if (count === this.columnCount) return;

            this.columnCount = count;

            // Redistribute containers to fit new column count
            const allContainers = Array.from(this.containers.values());
            for (const container of allContainers) {
                if ((container.data.column || 0) >= count) {
                    container.data.column = count - 1;
                    Storage.updateContainer(container.id, { column: container.data.column });
                }
            }

            // Recreate columns
            this.createColumns();

            // Re-setup DragDrop for new columns
            DragDrop.init(this);

            // Re-add containers to their columns
            for (const container of allContainers) {
                const columnIndex = container.data.column || 0;
                const columnEl = this.columnEls[columnIndex];
                if (columnEl) {
                    columnEl.appendChild(container.container);
                    DragDrop.setupContainer(container.container);
                }
            }
        },

        getColumnElement(index) {
            return this.columnEls[index] || this.columnEls[0];
        },

        async loadContainers() {
            const { containers } = await Storage.get();

            // Check for legacy migration if no containers exist
            if (containers.length === 0) {
                const migrated = await Storage.migrateFromLegacy();
                if (migrated) {
                    this.createContainer(migrated, false);
                    return;
                }
            }

            // Load existing containers
            for (const containerData of containers) {
                this.createContainer(containerData, false);
            }
        },

        createContainer(data, isNew = true) {
            const containerEl = document.createElement('div');
            containerEl.className = 'container';
            containerEl.dataset.containerId = data.id;
            containerEl.dataset.containerType = data.type || 'countdown';

            // Place in the appropriate column
            const columnIndex = Math.min(data.column || 0, this.columnCount - 1);
            const columnEl = this.getColumnElement(columnIndex);
            columnEl.appendChild(containerEl);

            const container = ContainerFactory.create(data.id, data, containerEl);
            container.init();
            DragDrop.setupContainer(containerEl);
            this.containers.set(data.id, container);

            return container;
        },

        async addNewContainer(data) {
            // If no column specified, add to the column with fewest containers
            if (data.column === undefined) {
                const columnCounts = this.columnEls.map(col => col.children.length);
                data.column = columnCounts.indexOf(Math.min(...columnCounts));
            }
            const containerData = await Storage.addContainer(data);
            return this.createContainer(containerData, true);
        },

        async updateContainer(id, data) {
            const container = this.containers.get(id);
            if (container) {
                await Storage.updateContainer(id, data);
                container.updateData(data);
            }
        },

        async moveContainerToColumn(id, newColumnIndex) {
            const container = this.containers.get(id);
            if (container && newColumnIndex >= 0 && newColumnIndex < this.columnCount) {
                container.data.column = newColumnIndex;
                const columnEl = this.getColumnElement(newColumnIndex);
                columnEl.appendChild(container.container);
                await Storage.updateContainer(id, { column: newColumnIndex });
            }
        },

        async deleteContainer(id) {
            const container = this.containers.get(id);
            if (container) {
                container.destroy();
                this.containers.delete(id);
                await Storage.deleteContainer(id);
            }
        },

        getContainerCount() {
            return this.containers.size;
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

                // Update all containers
                for (const container of this.containers.values()) {
                    container.update(now);
                }
            }

            requestAnimationFrame(() => this.tick());
        }
    };

    // ==================== Modal Module ====================
    const Modal = {
        mode: 'create', // 'create' | 'edit'
        editingContainerId: null,
        containerType: 'countdown',
        elements: {},

        init() {
            this.elements = {
                overlay: document.getElementById('config-modal'),
                title: document.querySelector('#config-modal .modal h2'),
                description: document.querySelector('#config-modal .modal p'),
                typeSelector: document.getElementById('container-type'),
                titleInput: document.getElementById('container-title'),
                descriptionInput: document.getElementById('container-description'),
                // Countdown fields
                countdownFields: document.getElementById('countdown-fields'),
                startDateInput: document.getElementById('start-date'),
                targetDateInput: document.getElementById('target-date'),
                showTodosCheckbox: document.getElementById('show-todos'),
                // Image fields
                imageFields: document.getElementById('image-fields'),
                imageUrlInput: document.getElementById('image-url'),
                imageFitSelect: document.getElementById('image-fit'),
                // Text fields
                textFields: document.getElementById('text-fields'),
                textContentInput: document.getElementById('text-content'),
                textFontSizeSelect: document.getElementById('text-font-size'),
                textAlignmentSelect: document.getElementById('text-alignment'),
                // Buttons
                saveBtn: document.getElementById('save-config'),
                cancelBtn: document.getElementById('cancel-config'),
                deleteBtn: document.getElementById('delete-container')
            };

            this.bindEvents();
        },

        bindEvents() {
            this.elements.saveBtn.addEventListener('click', () => this.save());
            this.elements.cancelBtn.addEventListener('click', () => this.close());
            this.elements.deleteBtn.addEventListener('click', () => this.delete());

            // Type selector change
            if (this.elements.typeSelector) {
                this.elements.typeSelector.addEventListener('change', () => {
                    this.containerType = this.elements.typeSelector.value;
                    this.showFieldsForType(this.containerType);
                });
            }
        },

        showFieldsForType(type) {
            // Hide all type-specific fields
            if (this.elements.countdownFields) this.elements.countdownFields.classList.add('hidden');
            if (this.elements.imageFields) this.elements.imageFields.classList.add('hidden');
            if (this.elements.textFields) this.elements.textFields.classList.add('hidden');

            // Show fields for selected type
            switch (type) {
                case 'countdown':
                    if (this.elements.countdownFields) this.elements.countdownFields.classList.remove('hidden');
                    break;
                case 'image':
                    if (this.elements.imageFields) this.elements.imageFields.classList.remove('hidden');
                    break;
                case 'text':
                    if (this.elements.textFields) this.elements.textFields.classList.remove('hidden');
                    break;
            }
        },

        openForCreate() {
            this.mode = 'create';
            this.editingContainerId = null;
            this.containerType = 'countdown';

            // Update modal UI
            this.elements.title.textContent = 'Create Container';
            this.elements.description.textContent = 'Choose a container type and configure its settings.';
            this.elements.saveBtn.textContent = 'Create';
            this.elements.deleteBtn.classList.add('hidden');

            // Enable type selector
            if (this.elements.typeSelector) {
                this.elements.typeSelector.disabled = false;
                this.elements.typeSelector.value = 'countdown';
            }

            // Set defaults
            this.elements.titleInput.value = '';
            this.elements.descriptionInput.value = '';

            // Countdown defaults
            const today = new Date();
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

            if (this.elements.startDateInput) {
                this.elements.startDateInput.value = this.formatInputDate(today);
            }
            if (this.elements.targetDateInput) {
                this.elements.targetDateInput.value = this.formatInputDate(oneYearFromNow);
            }
            if (this.elements.showTodosCheckbox) {
                this.elements.showTodosCheckbox.checked = true;
            }

            // Image defaults
            if (this.elements.imageUrlInput) this.elements.imageUrlInput.value = '';
            if (this.elements.imageFitSelect) this.elements.imageFitSelect.value = 'cover';

            // Text defaults
            if (this.elements.textContentInput) this.elements.textContentInput.value = '';
            if (this.elements.textFontSizeSelect) this.elements.textFontSizeSelect.value = 'medium';
            if (this.elements.textAlignmentSelect) this.elements.textAlignmentSelect.value = 'center';

            // Show cancel only if there are existing containers
            this.elements.cancelBtn.classList.toggle('hidden', ContainerManager.getContainerCount() === 0);

            this.showFieldsForType('countdown');
            this.show();
        },

        openForEdit(container) {
            this.mode = 'edit';
            this.editingContainerId = container.id;
            this.containerType = container.data.type || 'countdown';

            // Update modal UI
            this.elements.title.textContent = 'Edit Container';
            this.elements.description.textContent = 'Update your container settings.';
            this.elements.saveBtn.textContent = 'Save';
            this.elements.deleteBtn.classList.remove('hidden');
            this.elements.cancelBtn.classList.remove('hidden');

            // Disable type selector when editing
            if (this.elements.typeSelector) {
                this.elements.typeSelector.disabled = true;
                this.elements.typeSelector.value = this.containerType;
            }

            // Populate common fields
            const data = container.getData();
            this.elements.titleInput.value = data.title || '';
            this.elements.descriptionInput.value = data.description || '';

            // Populate type-specific fields
            const typeData = data.data || {};

            switch (this.containerType) {
                case 'countdown':
                    if (this.elements.startDateInput) {
                        this.elements.startDateInput.value = typeData.startDate || '';
                    }
                    if (this.elements.targetDateInput) {
                        this.elements.targetDateInput.value = typeData.targetDate || '';
                    }
                    if (this.elements.showTodosCheckbox) {
                        this.elements.showTodosCheckbox.checked = typeData.showTodos !== false;
                    }
                    break;
                case 'image':
                    const imageUrl = typeData.imageUrl || '';
                    if (this.elements.imageUrlInput) {
                        this.elements.imageUrlInput.value = imageUrl;
                    }
                    if (this.elements.imageFitSelect) {
                        this.elements.imageFitSelect.value = typeData.fit || 'cover';
                    }
                    break;
                case 'text':
                    if (this.elements.textContentInput) {
                        this.elements.textContentInput.value = typeData.content || '';
                    }
                    if (this.elements.textFontSizeSelect) {
                        this.elements.textFontSizeSelect.value = typeData.fontSize || 'medium';
                    }
                    if (this.elements.textAlignmentSelect) {
                        this.elements.textAlignmentSelect.value = typeData.alignment || 'center';
                    }
                    break;
            }

            this.showFieldsForType(this.containerType);
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
            const titleValue = this.elements.titleInput.value;
            const descriptionValue = this.elements.descriptionInput.value;

            // Gather type-specific data
            let typeData = {};

            switch (this.containerType) {
                case 'countdown':
                    const startValue = this.elements.startDateInput?.value;
                    const targetValue = this.elements.targetDateInput?.value;

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

                    typeData = {
                        startDate: startValue,
                        targetDate: targetValue,
                        showTodos: this.elements.showTodosCheckbox?.checked !== false
                    };

                    // Preserve existing todos when editing
                    if (this.mode === 'edit' && this.editingContainerId) {
                        const container = ContainerManager.containers.get(this.editingContainerId);
                        if (container && container.data.data && container.data.data.todos) {
                            typeData.todos = container.data.data.todos;
                        }
                    }
                    break;

                case 'image':
                    typeData = {
                        imageUrl: this.elements.imageUrlInput?.value || '',
                        fit: this.elements.imageFitSelect?.value || 'cover'
                    };
                    break;

                case 'text':
                    typeData = {
                        content: this.elements.textContentInput?.value || '',
                        fontSize: this.elements.textFontSizeSelect?.value || 'medium',
                        alignment: this.elements.textAlignmentSelect?.value || 'center'
                    };
                    break;
            }

            const containerData = {
                type: this.containerType,
                title: titleValue,
                description: descriptionValue,
                data: typeData
            };

            try {
                if (this.mode === 'create') {
                    await ContainerManager.addNewContainer(containerData);
                } else {
                    await ContainerManager.updateContainer(this.editingContainerId, containerData);
                }
                this.close();
            } catch (e) {
                console.error('Failed to save container:', e);
                alert('Failed to save container. Please try again.');
            }
        },

        async delete() {
            if (!this.editingContainerId) return;

            if (confirm('Are you sure you want to delete this container?')) {
                await ContainerManager.deleteContainer(this.editingContainerId);
                this.close();

                // If no containers left, open create modal
                if (ContainerManager.getContainerCount() === 0) {
                    this.openForCreate();
                }
            }
        }
    };

    // ==================== Settings Module ====================
    const Settings = {
        defaults: {
            theme: 'default',
            effect: 'none',
            fontSize: {
                titles: 'medium',
                metadata: 'medium',
                countdown: 'medium'
            },
            columns: 2
        },
        current: null,
        elements: {},

        async init() {
            this.cacheElements();
            this.bindEvents();

            // Load saved settings or use defaults
            const saved = await Storage.getSettings();
            this.current = saved ? { ...this.defaults, ...saved } : { ...this.defaults };

            // Ensure fontSize object exists with all properties
            if (!this.current.fontSize) {
                this.current.fontSize = { ...this.defaults.fontSize };
            } else {
                this.current.fontSize = { ...this.defaults.fontSize, ...this.current.fontSize };
            }

            // Ensure effect exists
            if (!this.current.effect) {
                this.current.effect = this.defaults.effect;
            }

            this.apply();
            this.updateUI();
        },

        cacheElements() {
            this.elements = {
                overlay: document.getElementById('settings-modal'),
                closeBtn: document.getElementById('close-settings'),
                settingsBtn: document.getElementById('settings-btn'),
                fontTitles: document.getElementById('font-size-titles'),
                fontMetadata: document.getElementById('font-size-metadata'),
                fontCountdown: document.getElementById('font-size-countdown'),
                columnCount: document.getElementById('column-count'),
                themeRadios: document.querySelectorAll('input[name="theme"]'),
                effectRadios: document.querySelectorAll('input[name="effect"]'),
                exportBtn: document.getElementById('export-data'),
                importBtn: document.getElementById('import-data'),
                importFile: document.getElementById('import-file')
            };
        },

        bindEvents() {
            // Open settings modal
            this.elements.settingsBtn.addEventListener('click', () => this.openModal());

            // Close settings modal
            this.elements.closeBtn.addEventListener('click', () => this.closeModal());

            // Close on overlay click
            this.elements.overlay.addEventListener('click', (e) => {
                if (e.target === this.elements.overlay) {
                    this.closeModal();
                }
            });

            // Font size changes - apply immediately
            this.elements.fontTitles.addEventListener('change', () => this.saveAndApply());
            this.elements.fontMetadata.addEventListener('change', () => this.saveAndApply());
            this.elements.fontCountdown.addEventListener('change', () => this.saveAndApply());

            // Column count changes - apply immediately
            this.elements.columnCount.addEventListener('change', () => this.saveAndApply());

            // Theme changes - apply immediately
            this.elements.themeRadios.forEach(radio => {
                radio.addEventListener('change', () => this.saveAndApply());
            });

            // Effect changes - apply immediately
            if (this.elements.effectRadios) {
                this.elements.effectRadios.forEach(radio => {
                    radio.addEventListener('change', () => this.saveAndApply());
                });
            }

            // Export/Import buttons
            if (this.elements.exportBtn) {
                this.elements.exportBtn.addEventListener('click', () => this.exportData());
            }
            if (this.elements.importBtn) {
                this.elements.importBtn.addEventListener('click', () => this.elements.importFile.click());
            }
            if (this.elements.importFile) {
                this.elements.importFile.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        this.importData(e.target.files[0]);
                        e.target.value = ''; // Reset for next import
                    }
                });
            }
        },

        openModal() {
            this.elements.overlay.classList.remove('hidden');
        },

        closeModal() {
            this.elements.overlay.classList.add('hidden');
        },

        apply() {
            const root = document.documentElement;

            // Apply theme
            if (this.current.theme === 'default') {
                root.removeAttribute('data-theme');
            } else {
                root.setAttribute('data-theme', this.current.theme);
            }

            // Apply effect
            if (this.current.effect === 'none') {
                root.removeAttribute('data-effect');
            } else {
                root.setAttribute('data-effect', this.current.effect);
            }

            // Apply font sizes
            root.setAttribute('data-font-titles', this.current.fontSize.titles);
            root.setAttribute('data-font-metadata', this.current.fontSize.metadata);
            root.setAttribute('data-font-countdown', this.current.fontSize.countdown);
        },

        updateUI() {
            // Update font size selects
            this.elements.fontTitles.value = this.current.fontSize.titles;
            this.elements.fontMetadata.value = this.current.fontSize.metadata;
            this.elements.fontCountdown.value = this.current.fontSize.countdown;

            // Update column count select
            this.elements.columnCount.value = this.current.columns || this.defaults.columns;

            // Update theme radio
            this.elements.themeRadios.forEach(radio => {
                radio.checked = radio.value === this.current.theme;
            });

            // Update effect radio
            if (this.elements.effectRadios) {
                this.elements.effectRadios.forEach(radio => {
                    radio.checked = radio.value === this.current.effect;
                });
            }
        },

        async saveAndApply() {
            // Read current values from UI
            this.current.fontSize.titles = this.elements.fontTitles.value;
            this.current.fontSize.metadata = this.elements.fontMetadata.value;
            this.current.fontSize.countdown = this.elements.fontCountdown.value;
            this.current.columns = parseInt(this.elements.columnCount.value, 10);

            const selectedTheme = document.querySelector('input[name="theme"]:checked');
            this.current.theme = selectedTheme ? selectedTheme.value : 'default';

            const selectedEffect = document.querySelector('input[name="effect"]:checked');
            this.current.effect = selectedEffect ? selectedEffect.value : 'none';

            // Apply changes
            this.apply();

            // Save to storage
            await Storage.setSettings(this.current);

            // Apply column count to ContainerManager
            if (typeof ContainerManager !== 'undefined' && ContainerManager.gridEl && ContainerManager.setColumnCount) {
                ContainerManager.setColumnCount(this.current.columns);
            }
        },

        async exportData() {
            const { containers } = await Storage.get();
            const settings = await Storage.getSettings();
            const data = {
                version: 1,
                exportedAt: new Date().toISOString(),
                containers,
                settings
            };

            // Create and download file
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `speedrun-backup-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        async importData(file) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Validate
                if (!data.containers || !Array.isArray(data.containers)) {
                    throw new Error('Invalid backup file');
                }

                // Restore
                await Storage.set(data.containers);
                if (data.settings) {
                    await Storage.setSettings(data.settings);
                }

                // Reload page to apply
                location.reload();
            } catch (e) {
                console.error('Failed to import data:', e);
                alert('Failed to import data. Please ensure the file is a valid Speedrun backup.');
            }
        }
    };

    // ==================== DragDrop Module ====================
    const DragDrop = {
        draggedElement: null,
        draggedContainerId: null,
        manager: null,

        init(manager) {
            this.manager = manager;

            // Setup column drop targets
            for (const columnEl of manager.columnEls) {
                this.setupColumn(columnEl);
            }
        },

        setupColumn(columnEl) {
            columnEl.addEventListener('dragover', (e) => this.handleColumnDragOver(e, columnEl));
            columnEl.addEventListener('dragenter', (e) => this.handleColumnDragEnter(e, columnEl));
            columnEl.addEventListener('dragleave', (e) => this.handleColumnDragLeave(e, columnEl));
            columnEl.addEventListener('drop', (e) => this.handleColumnDrop(e, columnEl));
        },

        setupContainer(containerElement) {
            // Check if drag handle already exists
            if (containerElement.querySelector('.drag-handle')) return;

            // Add drag handle button
            const dragHandle = document.createElement('button');
            dragHandle.className = 'drag-handle';
            dragHandle.title = 'Drag to reorder';
            dragHandle.innerHTML = '&#x2630;';
            containerElement.insertBefore(dragHandle, containerElement.firstChild);

            // Make container draggable
            containerElement.setAttribute('draggable', 'true');

            // Bind drag events
            containerElement.addEventListener('dragstart', (e) => this.handleDragStart(e, containerElement));
            containerElement.addEventListener('dragend', (e) => this.handleDragEnd(e, containerElement));
            containerElement.addEventListener('dragover', (e) => this.handleDragOver(e, containerElement));
            containerElement.addEventListener('dragenter', (e) => this.handleDragEnter(e, containerElement));
            containerElement.addEventListener('dragleave', (e) => this.handleDragLeave(e, containerElement));
            containerElement.addEventListener('drop', (e) => this.handleDrop(e, containerElement));
        },

        handleDragStart(e, element) {
            if (element.classList.contains('fullscreen')) {
                e.preventDefault();
                return;
            }

            this.draggedElement = element;
            this.draggedContainerId = element.dataset.containerId;

            element.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.draggedContainerId);
        },

        handleDragEnd(e, element) {
            element.classList.remove('dragging');
            this.clearDropIndicators();
            this.draggedElement = null;
            this.draggedContainerId = null;
        },

        handleDragOver(e, element) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';

            if (!this.draggedElement || this.draggedElement === element) return;

            const rect = element.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            element.classList.remove('drop-before', 'drop-after');

            if (e.clientY < midY) {
                element.classList.add('drop-before');
            } else {
                element.classList.add('drop-after');
            }
        },

        handleDragEnter(e, element) {
            e.preventDefault();
            e.stopPropagation();
            if (!this.draggedElement || this.draggedElement === element) return;
            element.classList.add('drag-over');
        },

        handleDragLeave(e, element) {
            if (!element.contains(e.relatedTarget)) {
                element.classList.remove('drag-over', 'drop-before', 'drop-after');
            }
        },

        handleDrop(e, targetElement) {
            e.preventDefault();
            e.stopPropagation();

            if (!this.draggedElement || this.draggedElement === targetElement) {
                this.clearDropIndicators();
                return;
            }

            const targetColumn = targetElement.closest('.container-column');
            if (!targetColumn) {
                this.clearDropIndicators();
                return;
            }

            const targetColumnIndex = parseInt(targetColumn.dataset.columnIndex, 10);
            const insertBefore = targetElement.classList.contains('drop-before');

            if (insertBefore) {
                targetColumn.insertBefore(this.draggedElement, targetElement);
            } else {
                targetColumn.insertBefore(this.draggedElement, targetElement.nextSibling);
            }

            // Update the container's column data
            const container = this.manager.containers.get(this.draggedContainerId);
            if (container) {
                container.data.column = targetColumnIndex;
                Storage.updateContainer(this.draggedContainerId, { column: targetColumnIndex });
            }

            this.clearDropIndicators();
        },

        handleColumnDragOver(e, columnEl) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        },

        handleColumnDragEnter(e, columnEl) {
            e.preventDefault();
            if (!this.draggedElement) return;
            columnEl.classList.add('drop-target');
        },

        handleColumnDragLeave(e, columnEl) {
            if (!columnEl.contains(e.relatedTarget)) {
                columnEl.classList.remove('drop-target');
            }
        },

        handleColumnDrop(e, columnEl) {
            e.preventDefault();

            // Only handle if not dropped on a container
            if (e.target.closest('.container')) return;

            if (!this.draggedElement) {
                this.clearDropIndicators();
                return;
            }

            const targetColumnIndex = parseInt(columnEl.dataset.columnIndex, 10);

            columnEl.appendChild(this.draggedElement);

            const container = this.manager.containers.get(this.draggedContainerId);
            if (container) {
                container.data.column = targetColumnIndex;
                Storage.updateContainer(this.draggedContainerId, { column: targetColumnIndex });
            }

            this.clearDropIndicators();
        },

        clearDropIndicators() {
            if (!this.manager) return;

            for (const col of this.manager.columnEls) {
                col.classList.remove('drop-target', 'drag-over');
                const containers = col.querySelectorAll('.container');
                containers.forEach(c => {
                    c.classList.remove('drag-over', 'drop-before', 'drop-after');
                });
            }
        }
    };

    // ==================== App Module ====================
    const App = {
        async init() {
            console.log('App.init() starting');

            // Initialize settings first (applies theme and font sizes)
            await Settings.init();

            // Initialize modules
            GlobalTimeDisplay.init();
            Modal.init();

            // Initialize ContainerManager with column count from settings
            const columnCount = Settings.current.columns || Settings.defaults.columns;
            ContainerManager.columnCount = columnCount;
            ContainerManager.init(document.getElementById('timers-grid'));

            // Bind add button
            const addBtn = document.getElementById('add-timer-btn');
            addBtn.addEventListener('click', () => Modal.openForCreate());

            // Load containers
            await ContainerManager.loadContainers();

            // If no containers, show create modal
            if (ContainerManager.getContainerCount() === 0) {
                Modal.openForCreate();
            }

            // Start the update loop
            ContainerManager.start();
        }
    };

    // Initialize the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})();
