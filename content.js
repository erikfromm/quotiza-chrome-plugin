window.quotizaContentLoaded = true;
console.log('Content script loaded and running');

// Función para obtener los datos de la hoja
function getSheetData() {
    try {
        console.log('getSheetData called');
        // Obtener todas las filas
        const rows = Array.from(document.querySelectorAll('div[role="row"]'));
        console.log('Found rows:', rows.length);
        
        if (rows.length === 0) {
            console.error('No rows found');
            return null;
        }

        // Omitir la primera fila (headers) y procesar el resto
        const data = rows.slice(1).map(row => {
            const cells = Array.from(row.querySelectorAll('div[role="gridcell"]'));
            return cells.map(cell => cell.textContent.trim());
        });

        // Filtrar filas vacías
        const filteredData = data.filter(row => row.some(cell => cell !== ''));
        console.log('Processed data:', filteredData);
        return filteredData;
    } catch (error) {
        console.error('Error in getSheetData:', error);
        return null;
    }
}

// Función para crear el sidebar
function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'quotiza-sidebar';
    
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');
    
    sidebar.appendChild(iframe);
    document.body.appendChild(sidebar);
    return sidebar;
}

// Función para toggle del sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('quotiza-sidebar') || createSidebar();
    sidebar.classList.toggle('open');
}

// Escuchar mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleSidebar') {
        toggleSidebar();
        sendResponse({ success: true });
    }
    return true;
}); 