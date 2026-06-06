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
let analysisData = {}; // Will hold real DB data {date: {summary, lat, lon}}
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
            analysisData = await response.json();
            renderCalendar(currentMonth, currentYear);
            plotMapMarkers();
            if (selectedDateStr) showSummary(selectedDateStr);
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
                    analysisData[dateToSave] = {
                        summary: statusData.summary,
                        lat: statusData.lat, 
                        lon: statusData.lon
                    };
                    
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

        if (isCurrentMonth && i === currentDay) {
            dayCell.classList.add('today');
        }

        if (dateStr === selectedDateStr) {
            dayCell.classList.add('selected');
        }

        if (analysisData[dateStr]) {
            dayCell.classList.add('has-data');
        }

        dayCell.addEventListener('click', () => {
            selectedDateStr = dateStr;
            // Update UI
            renderCalendar(month, year); 
            // Also show summary
            if (!isProcessing) {
                showSummary(dateStr);
                
                // If map is open, center on it
                if (mapView.style.display === 'flex' && analysisData[dateStr] && analysisData[dateStr].lat) {
                    map.setView([analysisData[dateStr].lat, analysisData[dateStr].lon], 15);
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
    
    for (const [dateStr, data] of Object.entries(analysisData)) {
        if(data && data.lat !== null && data.lon !== null) {
            // Apply search filtering visibly to markers 
            let opacity = 1.0;
            if (highlightParams && highlightParams.dates && !highlightParams.dates.includes(dateStr)) {
                opacity = 0.3; // fade out non-matching 
            }
            
            let marker = L.circleMarker([data.lat, data.lon], {
                color: 'red',
                fillColor: '#f03',
                fillOpacity: opacity,
                radius: 8,
                opacity: opacity
            }).addTo(map);
            
            marker.bindTooltip(dateStr);
            
            marker.on('click', () => {
                selectedDateStr = dateStr;
                const dateObj = new Date(dateStr + "T00:00:00");
                currentMonth = dateObj.getMonth();
                currentYear = dateObj.getFullYear();
                renderCalendar(currentMonth, currentYear);
                showSummary(dateStr);
            });
            
            mapMarkers.push(marker);
            allCoordinates.push([data.lat, data.lon]);
        }
    }
    
    // fit bounds if no specific selection
    if (allCoordinates.length > 0 && !selectedDateStr && !highlightParams) {
        map.fitBounds(allCoordinates, {padding:[20,20]});
    }
}

// ---- Right Bottom: Summary Display Logic ----
function showSummary(dateStr) {
    // Basic format: "Invalid Date" check just in case
    if (!dateStr) return;
    
    const d = new Date(dateStr + "T00:00:00");
    selectedDateDisplay.textContent = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // if we are actively processing that exact date, return
    if (isProcessing && dateStr === selectedDateStr) {
        return; 
    }

    const data = analysisData[dateStr];
    const leftPanel = document.querySelector('.left-panel');
    
    if (data) {
        // Now data holds {summary, lat, lon} or string if we are handling backwards compatibility, but backend sends object
        const summaryText = typeof data === 'string' ? data : data.summary;
        const formattedData = summaryText.split('\n').join('<br>');
        summaryContent.innerHTML = `<div style="font-family: monospace; font-size: 0.95rem;">${formattedData}</div>`;
        
        // Dynamically fetch and set the video's first frame as the background
        leftPanel.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("${API_URL}/thumbnail/${dateStr}")`;
        leftPanel.style.backgroundSize = "cover";
        leftPanel.style.backgroundPosition = "center";
        
        // Center map on selected items if they exist
        if (map && data.lat !== null && data.lon !== null) {
             map.setView([data.lat, data.lon], 15);
        }
        
    } else {
        summaryContent.innerHTML = `<p class="placeholder-text">No recorded video analysis for this date.</p>`;
        // Reset background
        leftPanel.style.backgroundImage = "none";
    }
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
