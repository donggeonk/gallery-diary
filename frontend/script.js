// UI Elements
const uploadBtn = document.getElementById('upload-btn');
const videoUploadInput = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name');

const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const monthYearDisplay = document.getElementById('month-year-display');
const calendarDays = document.getElementById('calendar-days');

const viewCalendarBtn = document.getElementById('view-calendar-btn');
const viewMapBtn = document.getElementById('view-map-btn');
const calendarView = document.getElementById('calendar-view');
const mapView = document.getElementById('map-view');

const selectedDateDisplay = document.getElementById('selected-date-display');
const summaryContent = document.getElementById('summary-content');

const searchInput = document.getElementById('log-search-input');
const searchDropdown = document.getElementById('search-dropdown');

// State
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let selectedDateStr = null;
let selectedLogId = null;
let analysisData = {}; // Real DB data grouped as {date: [logs]}
let isProcessing = false;
let currentPollInterval = null;

// Map State
let map = null;
let mapMarkers = [];

// API Endpoints
const API_URL = "http://127.0.0.1:8000/api";

// Initialize
async function init() {
    initMap();
    await fetchLogs();
    renderCalendar(currentMonth, currentYear);
}

function initMap() {
    map = L.map('map').setView([37.7749, -122.4194], 12); // Default to SF
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);
    
    // Fix leaflet display bug inside hidden container
    setTimeout(() => { map.invalidateSize(); }, 100);
}

// Fetch all logs from SQLite
async function fetchLogs() {
    try {
        const response = await fetch(`${API_URL}/logs`);
        if (response.ok) {
            analysisData = normalizeLogData(await response.json());
            renderCalendar(currentMonth, currentYear);
            plotMapMarkers();
            if (selectedDateStr) showSummary(selectedDateStr, selectedLogId);
        }
    } catch (error) {
        console.error("Error fetching logs:", error);
    }
}

// ---- Panel Views ----
viewCalendarBtn.addEventListener('click', () => {
    calendarView.style.display = 'flex';
    mapView.style.display = 'none';
    viewCalendarBtn.classList.add('active');
    viewMapBtn.classList.remove('active');
});

viewMapBtn.addEventListener('click', () => {
    calendarView.style.display = 'none';
    mapView.style.display = 'flex';
    viewMapBtn.classList.add('active');
    viewCalendarBtn.classList.remove('active');
    
    // Map requires invalidateSize when unhidden
    setTimeout(() => { map.invalidateSize(); }, 100);
});


// ---- Left Panel: Upload Video Logic ----
uploadBtn.addEventListener('click', () => {
    if (isProcessing) {
        alert("A video is currently processing. Please wait.");
        return;
    }
    videoUploadInput.click();
});

videoUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const isVideo = file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.mp4');
        if (!isVideo) {
            alert('File not supported. Please upload a video.');
            
            // clear the input so user can try again
            videoUploadInput.value = '';
            return;
        }
        
        fileNameDisplay.textContent = `Selected: ${file.name}`;
        
        let dateToSave = selectedDateStr || getLocalDateString(new Date());
        
        summaryContent.innerHTML = `<h3>Logging Video...</h3><p>Running VLM...<br>Please wait (this can take a few minutes)...</p>`;
        isProcessing = true;
        
        // 1. Send file via FormData
        const formData = new FormData();
        formData.append("file", file);
        formData.append("date", dateToSave);

        try {
            const uploadRes = await fetch(`${API_URL}/upload`, {
                method: "POST",
                body: formData,
            });

            if (!uploadRes.ok) throw new Error("Upload request failed");
            
            const uploadData = await uploadRes.json();
            if (uploadData.error) {
                alert(uploadData.error);
                isProcessing = false;
                showSummary(selectedDateStr);
                return;
            }

            // Adjust the date dynamically if backend extracted actual metadata from the video
            if (uploadData.date && uploadData.date !== dateToSave) {
                dateToSave = uploadData.date;
                selectedDateStr = dateToSave;
                
                const dObj = new Date(dateToSave + "T00:00:00");
                currentMonth = dObj.getMonth();
                currentYear = dObj.getFullYear();
                
                renderCalendar(currentMonth, currentYear);
                showSummary(dateToSave);
            }

            const taskId = uploadData.task_id;
            
            // 2. Poll Status indefinitely every 5 seconds
            currentPollInterval = setInterval(async () => {
                const statusRes = await fetch(`${API_URL}/status/${taskId}`);
                const statusData = await statusRes.json();
                
                if (statusData.status === "completed") {
                    clearInterval(currentPollInterval);
                    isProcessing = false;
                    
                    // Save dynamically into tracking variable
                    const completedLog = {
                        id: statusData.log_id || `pending-${Date.now()}`,
                        date: dateToSave,
                        title: statusData.title || extractLogTitle(statusData.summary),
                        summary: statusData.summary,
                        lat: statusData.lat, 
                        lon: statusData.lon
                    };
                    analysisData[dateToSave] = getLogsForDate(dateToSave);
                    analysisData[dateToSave].unshift(completedLog);
                    
                    // Show final visual message
                    summaryContent.innerHTML = `<h3>Logging completed!</h3>`;
                    
                    setTimeout(() => {
                        renderCalendar(currentMonth, currentYear);
                        plotMapMarkers();
                        showSummary(dateToSave);
                        fileNameDisplay.textContent = `Completed: ${file.name}`;
                    }, 1000);
                } else if (statusData.status === "error") {
                    clearInterval(currentPollInterval);
                    isProcessing = false;
                    summaryContent.innerHTML = `<h3 style="color:red">Error</h3><p>${statusData.error}</p>`;
                }
            }, 5000);
            
        } catch (error) {
            console.error("Upload error:", error);
            isProcessing = false;
            summaryContent.innerHTML = `<p style="color:red">Failed to connect to backend server.</p>`;
        }
    }
});

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeLogData(rawData) {
    const normalized = {};
    for (const [dateStr, value] of Object.entries(rawData || {})) {
        normalized[dateStr] = Array.isArray(value) ? value : [value];
    }
    return normalized;
}

function getLogsForDate(dateStr) {
    const logs = analysisData[dateStr];
    if (!logs) return [];
    return Array.isArray(logs) ? logs : [logs];
}

function getLogId(log, index, dateStr) {
    if (log && typeof log === 'object' && log.id !== undefined && log.id !== null) {
        return String(log.id);
    }
    return `${dateStr}-${index}`;
}

function getSummaryText(log) {
    if (typeof log === 'string') return log;
    return (log && log.summary) ? log.summary : '';
}

function extractLogTitle(summaryText) {
    const titleLine = (summaryText || '').split('\n').find(line => line.trim().toLowerCase().startsWith('title:'));
    if (titleLine) {
        const title = titleLine.split(':').slice(1).join(':').trim();
        if (title) return title;
    }

    const fallback = (summaryText || '').replace(/\s+/g, ' ').trim();
    return fallback ? `${fallback.slice(0, 60)}${fallback.length > 60 ? '...' : ''}` : 'Untitled log';
}

function getLogTitle(log) {
    if (log && typeof log === 'object' && log.title) return log.title;
    return extractLogTitle(getSummaryText(log));
}

function findLogById(dateStr, logId) {
    return getLogsForDate(dateStr).find((log, index) => getLogId(log, index, dateStr) === String(logId));
}

function getFirstLocatedLog(dateStr) {
    return getLogsForDate(dateStr).find(log => log && log.lat !== null && log.lat !== undefined && log.lon !== null && log.lon !== undefined);
}

function escapeHTML(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getThumbnailUrl(dateStr, log, index) {
    const id = getLogId(log, index, dateStr);
    return id.startsWith(`${dateStr}-`) || id.startsWith('pending-')
        ? `${API_URL}/thumbnail/${dateStr}`
        : `${API_URL}/thumbnail/log/${id}`;
}

async function deleteLog(dateStr, logId) {
    const response = await fetch(`${API_URL}/logs/${logId}`, {
        method: 'DELETE',
    });

    const result = await response.json();
    if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete log');
    }

    const remainingLogs = getLogsForDate(dateStr).filter((log, index) => getLogId(log, index, dateStr) !== String(logId));
    if (remainingLogs.length > 0) {
        analysisData[dateStr] = remainingLogs;
    } else {
        delete analysisData[dateStr];
    }

    if (selectedLogId && String(selectedLogId) === String(logId)) {
        selectedLogId = null;
    }

    renderCalendar(currentMonth, currentYear);
    plotMapMarkers();
    showSummary(dateStr);
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function renderCalendar(month, year) {
    calendarDays.innerHTML = '';
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
    const currentDay = today.getDate();

    // Empty cells
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        calendarDays.appendChild(emptyCell);
    }

    // Day cells
    for (let i = 1; i <= daysInMonth; i++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day-cell');
        dayCell.textContent = i;
        
        const dateStr = getLocalDateString(new Date(year, month, i));
        const logsForDate = getLogsForDate(dateStr);

        if (isCurrentMonth && i === currentDay) {
            dayCell.classList.add('today');
        }

        if (dateStr === selectedDateStr) {
            dayCell.classList.add('selected');
        }

        if (logsForDate.length > 0) {
            dayCell.classList.add('has-data');
        }

        dayCell.addEventListener('click', () => {
            selectedDateStr = dateStr;
            selectedLogId = null;
            // Update UI
            renderCalendar(month, year); 
            // Also show the day's log menu
            if (!isProcessing) {
                showSummary(dateStr);
                
                // If map is open, center on it
                const locatedLog = getFirstLocatedLog(dateStr);
                if (mapView.style.display === 'flex' && locatedLog) {
                    map.setView([locatedLog.lat, locatedLog.lon], 15);
                }
            }
        });

        calendarDays.appendChild(dayCell);
    }
}

prevMonthBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar(currentMonth, currentYear);
});

nextMonthBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar(currentMonth, currentYear);
});

function plotMapMarkers(highlightParams = null) {
    if(!map) return;
    
    // Clear old markers
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];
    
    let allCoordinates = [];
    
    for (const [dateStr, logs] of Object.entries(analysisData)) {
        getLogsForDate(dateStr).forEach((data, index) => {
            if(!data || data.lat === null || data.lat === undefined || data.lon === null || data.lon === undefined) {
                return;
            }

            const logId = getLogId(data, index, dateStr);
            // Apply search filtering visibly to markers 
            let opacity = 1.0;
            if (highlightParams && highlightParams.logIds && !highlightParams.logIds.includes(logId)) {
                opacity = 0.3; // fade out non-matching
            } else if (highlightParams && highlightParams.dates && !highlightParams.dates.includes(dateStr)) {
                opacity = 0.3; // fade out non-matching 
            }
            
            let marker = L.circleMarker([data.lat, data.lon], {
                color: 'red',
                fillColor: '#f03',
                fillOpacity: opacity,
                radius: 8,
                opacity: opacity
            }).addTo(map);
            
            marker.bindTooltip(`${dateStr} - ${getLogTitle(data)}`);
            
            marker.on('click', () => {
                selectedDateStr = dateStr;
                selectedLogId = logId;
                const dateObj = new Date(dateStr + "T00:00:00");
                currentMonth = dateObj.getMonth();
                currentYear = dateObj.getFullYear();
                renderCalendar(currentMonth, currentYear);
                showSummary(dateStr, logId);
            });
            
            mapMarkers.push(marker);
            allCoordinates.push([data.lat, data.lon]);
        });
    }
    
    // fit bounds if no specific selection
    if (allCoordinates.length > 0 && !selectedDateStr && !highlightParams) {
        map.fitBounds(allCoordinates, {padding:[20,20]});
    }
}

// ---- Right Bottom: Summary Display Logic ----
function showSummary(dateStr, logId = null) {
    // Basic format: "Invalid Date" check just in case
    if (!dateStr) return;

    selectedDateStr = dateStr;
    selectedLogId = logId ? String(logId) : null;
    
    const d = new Date(dateStr + "T00:00:00");
    selectedDateDisplay.textContent = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // if we are actively processing that exact date, return
    if (isProcessing && dateStr === selectedDateStr) {
        return; 
    }

    const logs = getLogsForDate(dateStr);
    
    if (logs.length === 0) {
        renderEmptyDate();
        return;
    }

    if (selectedLogId) {
        renderLogDetail(dateStr, selectedLogId);
        return;
    }

    renderLogMenu(dateStr, logs);
}

function renderEmptyDate() {
    summaryContent.innerHTML = `<p class="placeholder-text">No recorded video analysis for this date.</p>`;
    document.querySelector('.left-panel').style.backgroundImage = "none";
}

function renderLogMenu(dateStr, logs) {
    selectedDateDisplay.textContent += ` - ${logs.length} ${logs.length === 1 ? 'log' : 'logs'}`;
    summaryContent.innerHTML = '';

    const menu = document.createElement('div');
    menu.classList.add('log-menu');

    logs.forEach((log, index) => {
        const logId = getLogId(log, index, dateStr);

        const item = document.createElement('div');
        item.classList.add('log-menu-item');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');

        const title = document.createElement('span');
        title.classList.add('log-menu-title');
        title.textContent = getLogTitle(log);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.classList.add('log-delete-btn');
        deleteButton.setAttribute('aria-label', `Delete ${getLogTitle(log)}`);
        deleteButton.textContent = '×';

        deleteButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!confirm('Delete this log?')) return;

            try {
                await deleteLog(dateStr, logId);
            } catch (error) {
                alert(error.message);
            }
        });

        item.appendChild(title);
        item.appendChild(deleteButton);

        item.addEventListener('click', () => {
            showSummary(dateStr, logId);
        });

        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showSummary(dateStr, logId);
            }
        });

        menu.appendChild(item);
    });

    summaryContent.appendChild(menu);
    setLeftPanelPreview(dateStr, logs[0], 0);

    const locatedLog = getFirstLocatedLog(dateStr);
    if (map && locatedLog) {
        map.setView([locatedLog.lat, locatedLog.lon], 15);
    }
}

function renderLogDetail(dateStr, logId) {
    const logs = getLogsForDate(dateStr);
    const logIndex = logs.findIndex((log, index) => getLogId(log, index, dateStr) === String(logId));
    const log = logIndex >= 0 ? logs[logIndex] : null;
    if (!log) {
        selectedLogId = null;
        renderLogMenu(dateStr, logs);
        return;
    }

    const titleText = getLogTitle(log);
    const summaryText = getSummaryText(log);
    selectedDateDisplay.textContent = `${selectedDateDisplay.textContent} - ${titleText}`;
    summaryContent.innerHTML = `
        <div class="summary-detail-header">
            <button type="button" class="back-btn" aria-label="Back to log list">&larr;</button>
            <h4>${escapeHTML(titleText)}</h4>
        </div>
        <div class="summary-text">${escapeHTML(summaryText).split('\n').join('<br>')}</div>
    `;

    summaryContent.querySelector('.back-btn').addEventListener('click', () => {
        selectedLogId = null;
        showSummary(dateStr);
    });

    setLeftPanelPreview(dateStr, log, logIndex);

    if (map && log.lat !== null && log.lat !== undefined && log.lon !== null && log.lon !== undefined) {
        map.setView([log.lat, log.lon], 15);
    }
}

function setLeftPanelPreview(dateStr, log, index) {
    const leftPanel = document.querySelector('.left-panel');
    leftPanel.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${getThumbnailUrl(dateStr, log, index)}")`;
    leftPanel.style.backgroundSize = "cover";
    leftPanel.style.backgroundPosition = "center";
}

// ---- Search Logic ----
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    searchDropdown.innerHTML = '';
    
    if (query === '') {
        searchDropdown.style.display = 'none';
        plotMapMarkers(); // Reset map visuals
        return;
    }
    
    const matches = [];
    
    for (const [dateStr, data] of Object.entries(analysisData)) {
        const summaryText = typeof data === 'string' ? data : data.summary;
        if (summaryText.toLowerCase().includes(query) || dateStr.includes(query)) {
            matches.push({ date: dateStr, summary: summaryText });
        }
    }
    
    // Highlight matching markers on the map
    plotMapMarkers({dates: matches.map(m => m.date)});
    
    if (matches.length > 0) {
        matches.sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest first
        
        matches.forEach(match => {
            const item = document.createElement('div');
            item.classList.add('search-dropdown-item');
            
            const dateSpan = document.createElement('span');
            dateSpan.classList.add('search-date');
            dateSpan.textContent = match.date;
            
            const snippetSpan = document.createElement('span');
            snippetSpan.classList.add('search-snippet');
            snippetSpan.textContent = match.summary;
            
            item.appendChild(dateSpan);
            item.appendChild(snippetSpan);
            
            item.addEventListener('click', () => {
                const dateObj = new Date(match.date + "T00:00:00");
                currentMonth = dateObj.getMonth();
                currentYear = dateObj.getFullYear();
                selectedDateStr = match.date;
                
                searchInput.value = '';
                searchDropdown.style.display = 'none';
                
                plotMapMarkers(); // Reset highlighting to normal
                renderCalendar(currentMonth, currentYear);
                showSummary(match.date);
            });
            
            searchDropdown.appendChild(item);
        });
        searchDropdown.style.display = 'block';
    } else {
        const noMatch = document.createElement('div');
        noMatch.classList.add('search-dropdown-item');
        noMatch.style.color = '#999';
        noMatch.style.cursor = 'default';
        noMatch.textContent = 'No matching videos found.';
        searchDropdown.appendChild(noMatch);
        searchDropdown.style.display = 'block';
    }
});

// Hide dropdown if clicked outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = 'none';
    }
});

init();
