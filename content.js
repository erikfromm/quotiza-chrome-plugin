// Log cuando el script se carga
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

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request);
    
    if (request.action === 'getSheetData') {
        console.log('Getting sheet data...');
        const data = getSheetData();
        console.log('Sending data back:', data);
        sendResponse({ data: data });
    }
    return true; // Mantener el canal de comunicación abierto
}); 