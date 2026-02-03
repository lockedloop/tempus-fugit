(function() {
    'use strict';

    // ==================== Storage Module ====================
    const Storage = {
        KEY_CONTAINERS: 'speedrun_containers',
        KEY_WIDGETS: 'speedrun_widgets', // Legacy key for migration
        KEY_TIMERS: 'speedrun_timers', // Legacy key for migration
        KEY_SETTINGS: 'speedrun_settings',
        // Legacy keys for migration
        LEGACY_KEYS: {
            target: 'speedrun_target_date',
            start: 'speedrun_start_date',
            title: 'speedrun_title',
            description: 'speedrun_description'
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
            const stored = localStorage.getItem(this.KEY_CONTAINERS);
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
            return { containers: [] };
        },

        async set(containers) {
            const data = JSON.stringify(containers);
            localStorage.setItem(this.KEY_CONTAINERS, data);

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

        async addContainer(data) {
            const { containers } = await this.get();
            const newContainer = {
                id: this.generateId(),
                type: data.type || 'countdown',
                title: data.title || '',
                description: data.description || '',
                height: data.height || 2,
                createdAt: Date.now()
            };

            // Add type-specific fields
            if (newContainer.type === 'countdown') {
                newContainer.startDate = data.startDate;
                newContainer.targetDate = data.targetDate;
            } else if (newContainer.type === 'image') {
                newContainer.imageUrl = data.imageUrl || '';
            } else if (newContainer.type === 'text') {
                newContainer.text = data.text || '';
            }

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

        async reorderContainers(orderedIds) {
            const { containers } = await this.get();
            const reordered = orderedIds.map(id => containers.find(c => c.id === id)).filter(Boolean);
            await this.set(reordered);
            return reordered;
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

        async migrateTimersToContainers() {
            // First check if we already have containers
            const { containers } = await this.get();
            if (containers.length > 0) {
                return null; // Already have containers, no migration needed
            }

            // Check for old widgets data (speedrun_widgets key)
            let oldData = null;
            const storedWidgets = localStorage.getItem(this.KEY_WIDGETS);
            if (storedWidgets) {
                try {
                    oldData = JSON.parse(storedWidgets);
                } catch (e) {
                    console.warn('Failed to parse stored widgets for migration:', e);
                }
            }

            // Also check chrome.storage for old widgets
            if (!oldData && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                try {
                    oldData = await new Promise((resolve) => {
                        chrome.storage.sync.get([this.KEY_WIDGETS], (result) => {
                            if (chrome.runtime.lastError) {
                                resolve(null);
                            } else {
                                resolve(result[this.KEY_WIDGETS] || null);
                            }
                        });
                    });
                } catch (e) {
                    console.warn('Chrome storage widget migration failed:', e);
                }
            }

            // If no widgets found, try migrating from old timers
            if (!oldData) {
                const storedTimers = localStorage.getItem(this.KEY_TIMERS);
                if (storedTimers) {
                    try {
                        oldData = JSON.parse(storedTimers);
                    } catch (e) {
                        console.warn('Failed to parse stored timers for migration:', e);
                    }
                }

                // Also check chrome.storage for old timers
                if (!oldData && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    try {
                        oldData = await new Promise((resolve) => {
                            chrome.storage.sync.get([this.KEY_TIMERS], (result) => {
                                if (chrome.runtime.lastError) {
                                    resolve(null);
                                } else {
                                    resolve(result[this.KEY_TIMERS] || null);
                                }
                            });
                        });
                    } catch (e) {
                        console.warn('Chrome storage timer migration failed:', e);
                    }
                }
            }

            if (oldData && Array.isArray(oldData) && oldData.length > 0) {
                console.log('Migrating data to containers:', oldData);
                // Convert to containers by updating ID prefix and ensuring type
                const migratedContainers = oldData.map(item => ({
                    ...item,
                    id: item.id.replace(/^(timer_|widget_)/, 'container_'), // Update ID prefix
                    type: item.type || 'countdown'
                }));

                await this.set(migratedContainers);

                // Clean up old data
                localStorage.removeItem(this.KEY_WIDGETS);
                localStorage.removeItem(this.KEY_TIMERS);
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                    try {
                        chrome.storage.sync.remove([this.KEY_WIDGETS, this.KEY_TIMERS]);
                    } catch (e) {
                        console.warn('Failed to remove legacy keys:', e);
                    }
                }

                return migratedContainers;
            }

            return null;
        },

        async migrateFromLegacy() {
            // Check if legacy data exists (single timer keys)
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
                    ...legacyData,
                    type: 'countdown'
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

    // ==================== Container Base Class ====================
    class Container {
        constructor(id, data, containerElement) {
            this.id = id;
            this.data = data;
            this.container = containerElement;
            this.elements = {};
        }

        init() {
            this.render();
            this.cacheElements();
            this.initHeight();
            this.update(new Date());
        }

        initHeight() {
            const height = this.data.height || 2;
            this.container.setAttribute('data-height', height);
            this.container.setAttribute('data-type', this.data.type || 'countdown');
        }

        render() {
            this.container.innerHTML = this.renderChrome() + this.renderContent();
        }

        renderChrome() {
            return `
                <button class="expand-btn" title="Expand">&#x26F6;</button>
                <button class="edit-btn" title="Edit Widget">&#128295;</button>
                <button class="close-btn" title="Close">&#x2715;</button>
                <div class="height-controls">
                    <button class="height-btn height-btn-expand" title="Expand height">&#x25BC;</button>
                    <button class="height-btn height-btn-collapse" title="Collapse height">&#x25B2;</button>
                </div>
            `;
        }

        renderContent() {
            // Override in subclasses
            return '';
        }

        cacheElements() {
            this.elements = {
                editBtn: this.container.querySelector('.edit-btn'),
                expandBtn: this.container.querySelector('.expand-btn'),
                closeBtn: this.container.querySelector('.close-btn'),
                heightCollapseBtn: this.container.querySelector('.height-btn-collapse'),
                heightExpandBtn: this.container.querySelector('.height-btn-expand')
            };

            // Bind edit button
            this.elements.editBtn.addEventListener('click', () => {
                Modal.openForEdit(this);
            });

            // Bind expand/close buttons
            this.elements.expandBtn.addEventListener('click', () => this.enterFullscreen());
            this.elements.closeBtn.addEventListener('click', () => this.exitFullscreen());

            // Bind height control buttons
            this.elements.heightCollapseBtn.addEventListener('click', () => this.adjustHeight(-1));
            this.elements.heightExpandBtn.addEventListener('click', () => this.adjustHeight(1));

            // Cache type-specific elements
            this.cacheContentElements();
        }

        cacheContentElements() {
            // Override in subclasses
        }

        update(now) {
            // Override in subclasses if needed
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
            this.onDataUpdate();
        }

        onDataUpdate() {
            // Override in subclasses
        }

        adjustHeight(delta) {
            const currentHeight = parseInt(this.container.getAttribute('data-height') || '2', 10);
            const newHeight = Math.min(5, Math.max(1, currentHeight + delta));

            if (newHeight !== currentHeight) {
                this.container.setAttribute('data-height', newHeight);
                this.data.height = newHeight;
                Storage.updateContainer(this.id, { height: newHeight });
            }
        }
    }

    // ==================== CountdownContainer Class ====================
    class CountdownContainer extends Container {
        constructor(id, data, containerElement) {
            super(id, data, containerElement);
            this.startDate = TimeCalc.parseDate(data.startDate);
            this.targetDate = TimeCalc.parseDate(data.targetDate);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);
        }

        renderChrome() {
            return `
                <button class="info-btn" title="Info">&#x2139;</button>
                <button class="expand-btn" title="Expand">&#x26F6;</button>
                <button class="edit-btn" title="Edit Widget">&#128295;</button>
                <button class="close-btn" title="Close">&#x2715;</button>
                <div class="height-controls">
                    <button class="height-btn height-btn-expand" title="Expand height">&#x25BC;</button>
                    <button class="height-btn height-btn-collapse" title="Collapse height">&#x25B2;</button>
                </div>
                <div class="info-popup">
                    <div class="info-weeks"></div>
                    <div class="info-dates"></div>
                    <div class="info-description"></div>
                </div>
            `;
        }

        renderContent() {
            return `
                <header>
                    <h2 class="widget-title-display">-- Weeks</h2>
                    <div class="widget-description-display subtitle"></div>
                    <div class="weeks-count"></div>
                    <div class="target-subtitle subtitle">Configure your target date</div>
                </header>
                <section class="weeks-section"></section>
                <div class="led-countdown">
                    <div class="led-time">
                        <span class="led-days">0000</span>D : <span class="led-hours">00</span>H : <span class="led-minutes">00</span>M : <span class="led-seconds">00</span>S
                    </div>
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                </div>
                <footer class="widget-footer"><span class="stats"></span></footer>
            `;
        }

        cacheContentElements() {
            this.elements.infoBtn = this.container.querySelector('.info-btn');
            this.elements.infoPopup = this.container.querySelector('.info-popup');
            this.elements.infoWeeks = this.container.querySelector('.info-weeks');
            this.elements.infoDates = this.container.querySelector('.info-dates');
            this.elements.infoDescription = this.container.querySelector('.info-description');
            this.elements.titleDisplay = this.container.querySelector('.widget-title-display');
            this.elements.descriptionDisplay = this.container.querySelector('.widget-description-display');
            this.elements.weeksCount = this.container.querySelector('.weeks-count');
            this.elements.targetSubtitle = this.container.querySelector('.target-subtitle');
            this.elements.weeksSection = this.container.querySelector('.weeks-section');
            this.elements.ledDays = this.container.querySelector('.led-days');
            this.elements.ledHours = this.container.querySelector('.led-hours');
            this.elements.ledMinutes = this.container.querySelector('.led-minutes');
            this.elements.ledSeconds = this.container.querySelector('.led-seconds');
            this.elements.progressFill = this.container.querySelector('.progress-fill');
            this.elements.stats = this.container.querySelector('.stats');

            // Bind info button toggle
            this.elements.infoBtn.addEventListener('click', () => {
                this.elements.infoPopup.classList.toggle('visible');
            });

            this.updateHeader();
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

            // Populate info popup
            this.elements.infoWeeks.textContent = `${this.totalWeeks.toLocaleString()} Weeks`;
            this.elements.infoDates.textContent =
                `${TimeCalc.formatDate(this.startDate)} → ${TimeCalc.formatDate(this.targetDate)}`;
            this.elements.infoDescription.textContent = description || '';
        }

        update(now) {
            const elapsedWeeks = TimeCalc.getElapsedWeeks(this.startDate, now);
            const remaining = TimeCalc.getRemainingTime(this.targetDate, now);

            this.generateWeeksGrid(elapsedWeeks);
            this.updateLedCountdown(remaining);
            this.updateStats(elapsedWeeks);

            const currentSecond = now.getSeconds();
            if (currentSecond === 0 || this.lastProgressUpdate === undefined) {
                this.updateProgress();
                this.lastProgressUpdate = now.getMinutes();
            }
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
        }

        onDataUpdate() {
            this.startDate = TimeCalc.parseDate(this.data.startDate);
            this.targetDate = TimeCalc.parseDate(this.data.targetDate);
            this.totalWeeks = TimeCalc.getWeeksBetween(this.startDate, this.targetDate);
            this.yearRanges = TimeCalc.getYearRanges(this.startDate, this.targetDate);
            this.updateHeader();
            this.update(new Date());
        }
    }

    // ==================== ImageContainer Class ====================
    class ImageContainer extends Container {
        renderContent() {
            const { title, description, imageUrl } = this.data;
            return `
                <header>
                    <h2 class="widget-title-display">${title || 'Image'}</h2>
                    <div class="widget-description-display subtitle">${description || ''}</div>
                </header>
                <div class="image-container">
                    <img class="widget-image" src="${imageUrl || ''}" alt="${title || 'Image'}" />
                </div>
            `;
        }

        cacheContentElements() {
            this.elements.titleDisplay = this.container.querySelector('.widget-title-display');
            this.elements.descriptionDisplay = this.container.querySelector('.widget-description-display');
            this.elements.imageContainer = this.container.querySelector('.image-container');
            this.elements.image = this.container.querySelector('.widget-image');
        }

        onDataUpdate() {
            const { title, description, imageUrl } = this.data;
            this.elements.titleDisplay.textContent = title || 'Image';
            this.elements.descriptionDisplay.textContent = description || '';
            this.elements.image.src = imageUrl || '';
            this.elements.image.alt = title || 'Image';
        }
    }

    // ==================== TextContainer Class ====================
    class TextContainer extends Container {
        renderContent() {
            const { title, description, text } = this.data;
            return `
                <header>
                    <h2 class="widget-title-display">${title || 'Text'}</h2>
                    <div class="widget-description-display subtitle">${description || ''}</div>
                </header>
                <div class="text-content">${this.parseMarkdown(text || '')}</div>
            `;
        }

        cacheContentElements() {
            this.elements.titleDisplay = this.container.querySelector('.widget-title-display');
            this.elements.descriptionDisplay = this.container.querySelector('.widget-description-display');
            this.elements.textContent = this.container.querySelector('.text-content');
        }

        parseMarkdown(text) {
            if (!text) return '';

            let html = text
                // Escape HTML first
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                // Headers
                .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                // Bold
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                // Italic
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                // Links
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
                // Line breaks
                .replace(/\n/g, '<br>');

            return html;
        }

        onDataUpdate() {
            const { title, description, text } = this.data;
            this.elements.titleDisplay.textContent = title || 'Text';
            this.elements.descriptionDisplay.textContent = description || '';
            this.elements.textContent.innerHTML = this.parseMarkdown(text || '');
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
            const type = data.type || 'countdown';
            const ContainerClass = this.types[type] || CountdownContainer;
            return new ContainerClass(id, data, containerElement);
        },

        getTypeNames() {
            return Object.keys(this.types);
        }
    };

    // ==================== ContainerManager Module ====================
    const ContainerManager = {
        containers: new Map(),
        containerEl: null,
        running: false,
        lastSecond: -1,

        init(gridElement) {
            this.containerEl = gridElement;
            DragDrop.init(gridElement);
        },

        async loadContainers() {
            // First try to migrate from old timers format
            const migrated = await Storage.migrateTimersToContainers();
            if (migrated) {
                for (const containerData of migrated) {
                    this.createContainer(containerData, false);
                }
                return;
            }

            const { containers } = await Storage.get();

            // Check for legacy migration if no containers exist
            if (containers.length === 0) {
                const legacyMigrated = await Storage.migrateFromLegacy();
                if (legacyMigrated) {
                    this.createContainer(legacyMigrated, false);
                    return;
                }
            }

            // Load existing containers
            for (const containerData of containers) {
                this.createContainer(containerData, false);
            }
        },

        createContainer(data, isNew = true) {
            const containerElement = document.createElement('div');
            containerElement.className = 'container';
            containerElement.dataset.containerId = data.id;
            this.containerEl.appendChild(containerElement);

            const container = ContainerFactory.create(data.id, data, containerElement);
            container.init();
            DragDrop.setupContainer(containerElement);
            this.containers.set(data.id, container);

            return container;
        },

        async addNewContainer(data) {
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
        editingContainerType: null,
        elements: {},

        init() {
            this.elements = {
                overlay: document.getElementById('config-modal'),
                title: document.querySelector('#config-modal .modal h2'),
                description: document.querySelector('#config-modal .modal p'),
                typeSelector: document.querySelector('.type-selector'),
                typeRadios: document.querySelectorAll('input[name="container-type"]'),
                // Common fields
                titleInput: document.getElementById('container-title'),
                descriptionInput: document.getElementById('container-description'),
                // Countdown fields
                countdownFields: document.getElementById('countdown-fields'),
                startDateInput: document.getElementById('start-date'),
                targetDateInput: document.getElementById('target-date'),
                // Image fields
                imageFields: document.getElementById('image-fields'),
                imageUrlInput: document.getElementById('image-url'),
                imageFileInput: document.getElementById('image-file'),
                // Text fields
                textFields: document.getElementById('text-fields'),
                textContentInput: document.getElementById('text-content'),
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

            // Type selector changes
            this.elements.typeRadios.forEach(radio => {
                radio.addEventListener('change', () => this.onTypeChange());
            });

            // Image file upload handler
            if (this.elements.imageFileInput) {
                this.elements.imageFileInput.addEventListener('change', (e) => this.handleImageUpload(e));
            }
        },

        onTypeChange() {
            const selectedType = this.getSelectedType();
            this.showFieldsForType(selectedType);
        },

        getSelectedType() {
            const checked = document.querySelector('input[name="container-type"]:checked');
            return checked ? checked.value : 'countdown';
        },

        showFieldsForType(type) {
            // Hide all type-specific fields
            if (this.elements.countdownFields) {
                this.elements.countdownFields.classList.toggle('hidden', type !== 'countdown');
            }
            if (this.elements.imageFields) {
                this.elements.imageFields.classList.toggle('hidden', type !== 'image');
            }
            if (this.elements.textFields) {
                this.elements.textFields.classList.toggle('hidden', type !== 'text');
            }
        },

        handleImageUpload(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this.elements.imageUrlInput.value = event.target.result;
            };
            reader.readAsDataURL(file);
        },

        openForCreate() {
            this.mode = 'create';
            this.editingContainerId = null;
            this.editingContainerType = null;

            // Update modal UI
            this.elements.title.textContent = 'Create Container';
            this.elements.description.textContent = 'Choose a container type and configure it.';
            this.elements.saveBtn.textContent = 'Create';
            this.elements.deleteBtn.classList.add('hidden');

            // Show type selector
            if (this.elements.typeSelector) {
                this.elements.typeSelector.classList.remove('hidden');
            }

            // Set default type to countdown
            const countdownRadio = document.querySelector('input[name="container-type"][value="countdown"]');
            if (countdownRadio) {
                countdownRadio.checked = true;
            }
            this.showFieldsForType('countdown');

            // Set defaults for countdown
            const today = new Date();
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

            if (this.elements.startDateInput) {
                this.elements.startDateInput.value = this.formatInputDate(today);
            }
            if (this.elements.targetDateInput) {
                this.elements.targetDateInput.value = this.formatInputDate(oneYearFromNow);
            }
            if (this.elements.titleInput) {
                this.elements.titleInput.value = '';
            }
            if (this.elements.descriptionInput) {
                this.elements.descriptionInput.value = '';
            }
            if (this.elements.imageUrlInput) {
                this.elements.imageUrlInput.value = '';
            }
            if (this.elements.imageFileInput) {
                this.elements.imageFileInput.value = '';
            }
            if (this.elements.textContentInput) {
                this.elements.textContentInput.value = '';
            }

            // Show cancel only if there are existing containers
            this.elements.cancelBtn.classList.toggle('hidden', ContainerManager.getContainerCount() === 0);

            this.show();
        },

        openForEdit(container) {
            this.mode = 'edit';
            this.editingContainerId = container.id;
            this.editingContainerType = container.data.type || 'countdown';

            // Update modal UI
            this.elements.title.textContent = 'Edit Container';
            this.elements.description.textContent = 'Update your container settings.';
            this.elements.saveBtn.textContent = 'Save';
            this.elements.deleteBtn.classList.remove('hidden');
            this.elements.cancelBtn.classList.remove('hidden');

            // Hide type selector in edit mode (can't change type)
            if (this.elements.typeSelector) {
                this.elements.typeSelector.classList.add('hidden');
            }

            // Show fields for this container type
            this.showFieldsForType(this.editingContainerType);

            // Populate common fields
            const data = container.getData();
            if (this.elements.titleInput) {
                this.elements.titleInput.value = data.title || '';
            }
            if (this.elements.descriptionInput) {
                this.elements.descriptionInput.value = data.description || '';
            }

            // Populate type-specific fields
            if (this.editingContainerType === 'countdown') {
                if (this.elements.startDateInput) {
                    this.elements.startDateInput.value = data.startDate || '';
                }
                if (this.elements.targetDateInput) {
                    this.elements.targetDateInput.value = data.targetDate || '';
                }
            } else if (this.editingContainerType === 'image') {
                if (this.elements.imageUrlInput) {
                    this.elements.imageUrlInput.value = data.imageUrl || '';
                }
                if (this.elements.imageFileInput) {
                    this.elements.imageFileInput.value = '';
                }
            } else if (this.editingContainerType === 'text') {
                if (this.elements.textContentInput) {
                    this.elements.textContentInput.value = data.text || '';
                }
            }

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
            const type = this.mode === 'edit' ? this.editingContainerType : this.getSelectedType();
            const titleValue = this.elements.titleInput ? this.elements.titleInput.value : '';
            const descriptionValue = this.elements.descriptionInput ? this.elements.descriptionInput.value : '';

            const data = {
                type,
                title: titleValue,
                description: descriptionValue
            };

            // Validate and add type-specific fields
            if (type === 'countdown') {
                const startValue = this.elements.startDateInput ? this.elements.startDateInput.value : '';
                const targetValue = this.elements.targetDateInput ? this.elements.targetDateInput.value : '';

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

                data.startDate = startValue;
                data.targetDate = targetValue;
            } else if (type === 'image') {
                const imageUrl = this.elements.imageUrlInput ? this.elements.imageUrlInput.value : '';
                if (!imageUrl) {
                    alert('Please provide an image URL or upload an image.');
                    return;
                }
                data.imageUrl = imageUrl;
            } else if (type === 'text') {
                const textContent = this.elements.textContentInput ? this.elements.textContentInput.value : '';
                data.text = textContent;
            }

            try {
                if (this.mode === 'create') {
                    await ContainerManager.addNewContainer(data);
                } else {
                    await ContainerManager.updateContainer(this.editingContainerId, data);
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

            // Ensure columns has a default value
            if (!this.current.columns) {
                this.current.columns = this.defaults.columns;
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
                gridColumns: document.getElementById('grid-columns'),
                themeRadios: document.querySelectorAll('input[name="theme"]'),
                containersGrid: document.getElementById('containers-grid')
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

            // Column changes - apply immediately
            this.elements.gridColumns.addEventListener('change', () => this.saveAndApply());

            // Theme changes - apply immediately
            this.elements.themeRadios.forEach(radio => {
                radio.addEventListener('change', () => this.saveAndApply());
            });
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

            // Apply font sizes
            root.setAttribute('data-font-titles', this.current.fontSize.titles);
            root.setAttribute('data-font-metadata', this.current.fontSize.metadata);
            root.setAttribute('data-font-countdown', this.current.fontSize.countdown);

            // Apply grid columns
            if (this.elements.containersGrid) {
                this.elements.containersGrid.style.setProperty('--grid-columns', this.current.columns);
            }
        },

        updateUI() {
            // Update font size selects
            this.elements.fontTitles.value = this.current.fontSize.titles;
            this.elements.fontMetadata.value = this.current.fontSize.metadata;
            this.elements.fontCountdown.value = this.current.fontSize.countdown;

            // Update grid columns select
            this.elements.gridColumns.value = this.current.columns;

            // Update theme radio
            this.elements.themeRadios.forEach(radio => {
                radio.checked = radio.value === this.current.theme;
            });
        },

        async saveAndApply() {
            // Read current values from UI
            this.current.fontSize.titles = this.elements.fontTitles.value;
            this.current.fontSize.metadata = this.elements.fontMetadata.value;
            this.current.fontSize.countdown = this.elements.fontCountdown.value;
            this.current.columns = parseInt(this.elements.gridColumns.value, 10);

            const selectedTheme = document.querySelector('input[name="theme"]:checked');
            this.current.theme = selectedTheme ? selectedTheme.value : 'default';

            // Apply changes
            this.apply();

            // Save to storage
            await Storage.setSettings(this.current);
        }
    };

    // ==================== DragDrop Module ====================
    const DragDrop = {
        draggedElement: null,
        draggedContainerId: null,
        gridContainer: null,

        init(gridContainer) {
            this.gridContainer = gridContainer;
        },

        setupContainer(containerElement) {
            // Add drag handle button
            const dragHandle = document.createElement('button');
            dragHandle.className = 'drag-handle';
            dragHandle.title = 'Drag to reorder';
            dragHandle.innerHTML = '&#x2630;'; // hamburger menu icon
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
            // Don't allow drag in fullscreen mode
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
            e.dataTransfer.dropEffect = 'move';

            if (!this.draggedElement || this.draggedElement === element) return;

            // Determine drop position based on mouse position
            const rect = element.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            // Clear previous indicators on this element
            element.classList.remove('drop-before', 'drop-after');

            if (e.clientY < midY) {
                element.classList.add('drop-before');
            } else {
                element.classList.add('drop-after');
            }
        },

        handleDragEnter(e, element) {
            e.preventDefault();
            if (!this.draggedElement || this.draggedElement === element) return;
            element.classList.add('drag-over');
        },

        handleDragLeave(e, element) {
            // Only remove if we're actually leaving the element (not entering a child)
            if (!element.contains(e.relatedTarget)) {
                element.classList.remove('drag-over', 'drop-before', 'drop-after');
            }
        },

        handleDrop(e, targetElement) {
            e.preventDefault();

            if (!this.draggedElement || this.draggedElement === targetElement) {
                this.clearDropIndicators();
                return;
            }

            // Determine insertion position
            const insertBefore = targetElement.classList.contains('drop-before');

            // Get all containers and their IDs in current order
            const containers = Array.from(this.gridContainer.querySelectorAll('.container'));
            const currentOrder = containers.map(c => c.dataset.containerId);

            // Remove dragged item from current position
            const draggedId = this.draggedContainerId;
            const newOrder = currentOrder.filter(id => id !== draggedId);

            // Find target position
            const targetId = targetElement.dataset.containerId;
            let targetIndex = newOrder.indexOf(targetId);

            // Insert at appropriate position
            if (insertBefore) {
                newOrder.splice(targetIndex, 0, draggedId);
            } else {
                newOrder.splice(targetIndex + 1, 0, draggedId);
            }

            // Reorder DOM
            this.reorderDOM(newOrder);

            // Persist to storage
            Storage.reorderContainers(newOrder);

            this.clearDropIndicators();
        },

        reorderDOM(orderedIds) {
            orderedIds.forEach(id => {
                const element = this.gridContainer.querySelector(`[data-container-id="${id}"]`);
                if (element) {
                    this.gridContainer.appendChild(element);
                }
            });
        },

        clearDropIndicators() {
            if (!this.gridContainer) return;
            const containers = this.gridContainer.querySelectorAll('.container');
            containers.forEach(c => {
                c.classList.remove('drag-over', 'drop-before', 'drop-after');
            });
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
            ContainerManager.init(document.getElementById('containers-grid'));

            // Bind add button
            const addBtn = document.getElementById('add-container-btn');
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
