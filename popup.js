async function handleImport() {
    try {
        showStatus('Starting import...', 'info');

        // Obtener los mapeos seleccionados
        const mapping = {
            sku: document.getElementById('skuColumn').value,
            name: document.getElementById('nameColumn').value,
            brand: document.getElementById('brandColumn').value,
            category: document.getElementById('categoryColumn').value,
            imageUrl: document.getElementById('imageUrlColumn').value,
            basePrice: document.getElementById('basePriceColumn').value
        };

        console.log('Selected mapping:', mapping);

        // Verificar campos requeridos
        if (!mapping.sku || !mapping.name || !mapping.brand) {
            showError('SKU, Name and Brand columns are required');
            return;
        }

        const sheetData = await getSheetData();
        
        // Omitir la primera fila (headers)
        const dataRows = sheetData.slice(1);

        // Procesar productos
        const products = dataRows.map(row => {
            const product = {
                sku: row[mapping.sku.charCodeAt(0) - 65],
                name: row[mapping.name.charCodeAt(0) - 65],
                brand: row[mapping.brand.charCodeAt(0) - 65]
            };

            if (mapping.category) {
                product.category = row[mapping.category.charCodeAt(0) - 65];
            }
            if (mapping.imageUrl) {
                product.image_url = row[mapping.imageUrl.charCodeAt(0) - 65];
            }
            if (mapping.basePrice) {
                const price = parseFloat(row[mapping.basePrice.charCodeAt(0) - 65]);
                if (!isNaN(price)) {
                    product.base_price = price;
                }
            }

            return product;
        }).filter(product => product.sku && product.name && product.brand);

        console.log('Processed products:', products);

        if (products.length === 0) {
            throw new Error('No valid products found to import');
        }

        // Enviar a la API
        const response = await fetch('https://app.quotiza.com/api/v1/products/import', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                account_id: accountId,
                products: products
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Import failed');
        }

        const result = await response.json();
        showStatus(`Import started successfully! Processing ${products.length} products...`, 'success');

    } catch (error) {
        console.error('Import error:', error);
        showError(`Import failed: ${error.message}`);
    }
}

// Variables globales para almacenar las credenciales
let apiToken = '';
let accountId = '';

async function handleLogin() {
    try {
        const token = document.getElementById('apiToken').value.trim();
        const account = document.getElementById('accountId').value.trim();
        
        if (!token || !account) {
            showError('Please enter both API Token and Account ID');
            return;
        }

        showStatus('Verifying credentials...', 'info');

        const response = await fetch('https://app.quotiza.com/api/v1/products/import', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                account_id: account,
                products: [] // Array vacío para validación
            })
        });

        if (response.ok || response.status === 400) {
            apiToken = token;
            accountId = account;
            await chrome.storage.local.set({ apiToken, accountId });
            showStatus('Successfully logged in!', 'success');
            showMappingSection();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Invalid credentials');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(`Login failed: ${error.message}`);
        apiToken = '';
        accountId = '';
        await chrome.storage.local.remove(['apiToken', 'accountId']);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // Verificar si ya hay credenciales guardadas
    chrome.storage.local.get(['apiToken', 'accountId'], (result) => {
        if (result.apiToken && result.accountId) {
            apiToken = result.apiToken;
            accountId = result.accountId;
            
            const tokenInput = document.getElementById('apiToken');
            const accountInput = document.getElementById('accountId');
            if (tokenInput) tokenInput.value = apiToken;
            if (accountInput) accountInput.value = accountId;

            showMappingSection();
        }
    });

    // Agregar el listener para el botón de importar
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', handleImport);
    }
});

// Función para mostrar la sección de mapping
async function showMappingSection() {
    try {
        showStatus('Authenticating with Google...', 'info');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('docs.google.com/spreadsheets')) {
            throw new Error('Please open a Google Spreadsheet first');
        }

        // Extraer el ID de la hoja para validación
        const matches = tab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!matches) {
            throw new Error('Invalid Google Sheets URL');
        }
        
        // Intentar autenticar y hacer una petición de prueba
        const spreadsheetId = matches[1];
        await window.getSheetData(spreadsheetId);

        // Si llegamos aquí, la autenticación fue exitosa
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('mappingSection').style.display = 'block';
        
        // Cargar las columnas
        await loadSheetColumns();
        
        showStatus('Ready to import', 'success');
    } catch (error) {
        console.error('Authentication error:', error);
        let errorMessage = 'Google authentication failed: ';
        
        if (error.message.includes('Please open a Google Spreadsheet')) {
            errorMessage = 'Please open a Google Spreadsheet first';
        } else if (error.message.includes('Invalid Google Sheets URL')) {
            errorMessage = 'Invalid Google Sheets URL';
        } else {
            errorMessage += error.message;
        }
        
        showError(errorMessage);
        // Mantener visible la sección de login si falla la autenticación
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('mappingSection').style.display = 'none';
    }
}

// Función para mostrar mensajes de estado
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = type;
}

// Función para mostrar errores
function showError(message) {
    showStatus(message, 'error');
}

// Función para cargar las columnas en los selectores
async function loadSheetColumns() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('docs.google.com/spreadsheets')) {
            showError('Please open a Google Spreadsheet first');
            return;
        }

        // Extraer el ID de la hoja
        const matches = tab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!matches) {
            throw new Error('Invalid Google Sheets URL');
        }
        const spreadsheetId = matches[1];

        // Usar la nueva función
        const sheetData = await window.getSheetData(spreadsheetId);
        
        if (!sheetData || sheetData.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        // Usar la primera fila como headers
        const headers = sheetData[0].map((header, index) => ({
            column: String.fromCharCode(65 + index),
            name: header || `Column ${String.fromCharCode(65 + index)}`,
            index: index
        }));

        populateColumnSelects(headers);
    } catch (error) {
        console.error('Error loading columns:', error);
        showError('Error loading spreadsheet columns: ' + error.message);
    }
}

// Función para poblar los selectores con las columnas
function populateColumnSelects(headers) {
    const selects = document.querySelectorAll('.column-select');
    selects.forEach(select => {
        // Mantener la opción por defecto
        const defaultOption = select.querySelector('option');
        select.innerHTML = '';
        if (defaultOption) {
            select.appendChild(defaultOption);
        }

        // Agregar las opciones de columnas
        headers.forEach(header => {
            const option = document.createElement('option');
            option.value = header.column;
            option.textContent = `${header.column} - ${header.name}`;
            select.appendChild(option);
        });
    });
}

// Función para obtener los datos de la hoja
async function getSheetData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Extraer el ID de la hoja de la URL
        const matches = tab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!matches) {
            throw new Error('Invalid Google Sheets URL');
        }
        const spreadsheetId = matches[1];

        // Inicializar el cliente de Google
        await gapi.client.init({
            clientId: '389846337856-7n6159cngm0jkltolcec255v5ap7nnj9.apps.googleusercontent.com',
            scope: 'https://www.googleapis.com/auth/spreadsheets.readonly'
        });

        // Obtener los datos de la hoja
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'A:Z'  // Rango amplio para obtener todas las columnas necesarias
        });

        if (!response.result.values || response.result.values.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        console.log('Sheet data retrieved:', response.result.values);
        return response.result.values;

    } catch (error) {
        console.error('Error getting sheet data:', error);
        throw new Error('Could not read spreadsheet data: ' + error.message);
    }
}
