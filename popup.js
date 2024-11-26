async function handleImport() {
    try {
        showStatus('Preparing import...', 'info');

        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const matches = currentTab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) {
            await saveColumnMapping(matches[1]);
        }

        const mapping = {
            sku: document.getElementById('skuColumn').value,
            name: document.getElementById('nameColumn').value,
            brand: document.getElementById('brandColumn').value,
            category: document.getElementById('categoryColumn').value,
            imageUrl: document.getElementById('imageUrlColumn').value,
            basePrice: document.getElementById('basePriceColumn').value
        };

        // Verificar campos requeridos
        if (!mapping.sku || !mapping.name || !mapping.brand) {
            showError('SKU, Name and Brand columns are required');
            return;
        }

        const sheetData = await getSheetData();
        const dataRows = sheetData.slice(1);

        // Validación mejorada con tracking de errores
        const products = [];
        const validationErrors = [];
        
        dataRows.forEach((row, index) => {
            const rowNumber = index + 2; // +2 porque empezamos desde la fila 2 (después de headers)
            const product = {};
            let hasError = false;

            // Validar campos requeridos
            const requiredFields = {
                sku: mapping.sku,
                name: mapping.name,
                brand: mapping.brand
            };

            for (const [field, column] of Object.entries(requiredFields)) {
                const value = row[column.charCodeAt(0) - 65]?.trim();
                if (!value) {
                    validationErrors.push({
                        row: rowNumber,
                        column: column,
                        field: field,
                        message: `Empty ${field} in cell ${column}${rowNumber}`
                    });
                    hasError = true;
                } else {
                    product[field] = value;
                }
            }

            // Solo procesar campos opcionales si no hay errores en los requeridos
            if (!hasError) {
                // Campos opcionales
                if (mapping.category) {
                    product.category = row[mapping.category.charCodeAt(0) - 65]?.trim();
                }
                if (mapping.imageUrl) {
                    product.image_url = row[mapping.imageUrl.charCodeAt(0) - 65]?.trim();
                }
                if (mapping.basePrice) {
                    const price = parseFloat(row[mapping.basePrice.charCodeAt(0) - 65]);
                    if (!isNaN(price)) {
                        product.base_price = price;
                    }
                }
                products.push(product);
            }
        });

        // Preparar resumen con validación
        const summary = {
            totalRows: dataRows.length,
            validProducts: products.length,
            errors: validationErrors,
            withCategory: products.filter(p => p.category).length,
            withImage: products.filter(p => p.image_url).length,
            withPrice: products.filter(p => p.base_price).length,
            sampleProducts: products.slice(0, 3),
            canProceed: validationErrors.length === 0
        };

        const confirmImport = await showImportSummary(summary);
        if (!confirmImport) {
            showStatus('Import cancelled', 'info');
            return;
        }

        // Solo proceder si no hay errores
        if (validationErrors.length > 0) {
            throw new Error('Please fix validation errors before importing');
        }

        showStatus('Starting import...', 'info');

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
        showStatus(`Import successful! ${products.length} products are being processed.`, 'success');

        // Guardar en el historial
        await saveToHistory({
            totalProducts: products.length,
            spreadsheetId: matches[1],
            spreadsheetName: currentTab.title,
        });

        // Mostrar modal de éxito
        await showSuccessModal({
            totalProducts: products.length
        });

    } catch (error) {
        console.error('Import error:', error);
        showError(`Import failed: ${error.message}`);
    }
}

// Función para mostrar el resumen de importación
function showImportSummary(summary) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'import-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Import Summary</h3>
                
                ${summary.errors.length > 0 ? `
                    <div class="validation-errors">
                        <h4>Warning: Validation Errors</h4>
                        <div class="errors-list">
                            ${summary.errors.map(error => `
                                <div class="error-item">
                                    ${error.message}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="summary-stats">
                    <p><strong>Total rows:</strong> ${summary.totalRows}</p>
                    <p><strong>Products to import:</strong> ${summary.validProducts}</p>
                </div>

                <div class="modal-buttons">
                    ${summary.canProceed ? `
                        <button class="confirm-btn">Confirm Import</button>
                    ` : `
                        <button class="error-btn" disabled>Cannot Import - Fix Errors</button>
                    `}
                    <button class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;

        // Estilos del modal
        const style = document.createElement('style');
        style.textContent = `
            .import-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .modal-content {
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            .validation-errors {
                background: #fff3cd;
                border: 1px solid #ffeeba;
                padding: 15px;
                margin: 15px 0;
                border-radius: 4px;
            }
            
            .error-item {
                color: #856404;
                padding: 5px 0;
                border-bottom: 1px solid #ffeeba;
            }
            
            .summary-stats {
                margin: 15px 0;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 4px;
            }
            
            .summary-stats p {
                margin: 5px 0;
            }
            
            .modal-buttons {
                margin-top: 20px;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            
            .confirm-btn {
                background: #4285f4;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .cancel-btn {
                background: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .error-btn {
                background: #6c757d;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: not-allowed;
                opacity: 0.65;
            }
        `;

        document.body.appendChild(style);
        document.body.appendChild(modal);

        // Manejar botones
        if (summary.canProceed) {
            modal.querySelector('.confirm-btn').onclick = () => {
                modal.remove();
                resolve(true);
            };
        }
        modal.querySelector('.cancel-btn').onclick = () => {
            modal.remove();
            resolve(false);
        };
    });
}

// Variables globales para las credenciales
let apiToken = '';
let accountId = '';

// Función para configurar los event listeners de la sección de mapeo
function setupMappingSectionListeners() {
    // Import button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', handleImport);
    }

    // History button
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', showHistory);
    }

    // Back button en la vista de historial
    const backBtn = document.getElementById('backFromHistoryBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backFromHistory);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Modificar la función handleLogin
async function handleLogin() {
    try {
        const token = document.getElementById('apiToken').value.trim();
        const account = document.getElementById('accountId').value.trim();

        if (!token || !account) {
            showError('Please enter both API Token and Account ID');
            return;
        }

        // Guardar credenciales
        await chrome.storage.local.set({
            apiToken: token,
            accountId: account
        });

        apiToken = token;
        accountId = account;

        // Mostrar sección de mapeo
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('mappingSection').style.display = 'block';

        // Configurar listeners después de mostrar la sección
        setupMappingSectionListeners();

        // Cargar columnas
        await loadSheetColumns();

    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
    }
}

// Modificar loadSavedCredentials
async function loadSavedCredentials() {
    try {
        const { apiToken: savedToken, accountId: savedAccount } = 
            await chrome.storage.local.get(['apiToken', 'accountId']);

        if (savedToken && savedAccount) {
            apiToken = savedToken;
            accountId = savedAccount;
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('mappingSection').style.display = 'block';
            
            // Configurar listeners después de mostrar la sección
            setupMappingSectionListeners();
            
            await loadSheetColumns();
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
    }
}

// Event Listeners iniciales
document.addEventListener('DOMContentLoaded', async () => {
    // Solo el botón de login inicialmente
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // Cargar credenciales guardadas
    await loadSavedCredentials();
});

// Función para manejar el logout
async function handleLogout() {
    try {
        // Limpiar credenciales del storage
        await chrome.storage.local.remove(['apiToken', 'accountId', 'columnMapping']);
        
        // Limpiar variables globales
        apiToken = '';
        accountId = '';
        
        // Limpiar campos de input
        document.getElementById('apiToken').value = '';
        document.getElementById('accountId').value = '';
        
        // Ocultar sección de mapeo y mostrar login
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('mappingSection').style.display = 'none';
        
        // Limpiar los selectores de columnas
        const selects = document.querySelectorAll('.column-select');
        selects.forEach(select => {
            select.innerHTML = '<option value="">-- Select Column --</option>';
        });

        showStatus('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error logging out: ' + error.message);
    }
}

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

// Funci��n para mostrar mensajes de estado
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

        const matches = tab.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!matches) {
            throw new Error('Invalid Google Sheets URL');
        }
        const spreadsheetId = matches[1];

        const sheetData = await window.getSheetData(spreadsheetId);
        
        if (!sheetData || sheetData.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        const headers = sheetData[0].map((header, index) => ({
            column: String.fromCharCode(65 + index),
            name: header || `Column ${String.fromCharCode(65 + index)}`,
            index: index
        }));

        populateColumnSelects(headers);
        
        // Cargar mapeo guardado después de popular los selectores
        await loadColumnMapping(spreadsheetId);

        // Agregar event listeners para guardar cambios
        const selects = document.querySelectorAll('.column-select');
        selects.forEach(select => {
            select.addEventListener('change', () => saveColumnMapping(spreadsheetId));
        });

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

// Función para guardar el mapeo actual
async function saveColumnMapping(spreadsheetId) {
    const mapping = {
        sku: document.getElementById('skuColumn').value,
        name: document.getElementById('nameColumn').value,
        brand: document.getElementById('brandColumn').value,
        category: document.getElementById('categoryColumn').value,
        imageUrl: document.getElementById('imageUrlColumn').value,
        basePrice: document.getElementById('basePriceColumn').value,
        spreadsheetId: spreadsheetId
    };

    await chrome.storage.local.set({ columnMapping: mapping });
}

// Función para cargar el mapeo guardado
async function loadColumnMapping(spreadsheetId) {
    const { columnMapping } = await chrome.storage.local.get('columnMapping');
    
    if (columnMapping && columnMapping.spreadsheetId === spreadsheetId) {
        const selectors = {
            'skuColumn': columnMapping.sku,
            'nameColumn': columnMapping.name,
            'brandColumn': columnMapping.brand,
            'categoryColumn': columnMapping.category,
            'imageUrlColumn': columnMapping.imageUrl,
            'basePriceColumn': columnMapping.basePrice
        };

        for (const [id, value] of Object.entries(selectors)) {
            const select = document.getElementById(id);
            if (select && value) {
                select.value = value;
            }
        }
    }
}

function showSuccessModal(result) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'import-modal';
        modal.innerHTML = `
            <div class="modal-content success-modal">
                <div class="success-icon">✅</div>
                <h3>Import Successful!</h3>
                <div class="success-details">
                    <p>Your products are being processed</p>
                    <p class="product-count">${result.totalProducts} products imported</p>
                </div>
                <div class="modal-buttons">
                    <button class="confirm-btn">Close</button>
                </div>
            </div>
        `;

        // Estilos específicos para el modal de éxito
        const style = document.createElement('style');
        style.textContent = `
            .success-modal {
                text-align: center;
                padding: 20px;
            }
            
            .success-icon {
                font-size: 64px;
                margin: 20px 0;
            }
            
            .success-details {
                margin: 20px 0;
            }
            
            .product-count {
                font-size: 24px;
                font-weight: bold;
                color: #4285f4;
                margin: 15px 0;
            }
        `;

        document.body.appendChild(style);
        document.body.appendChild(modal);

        modal.querySelector('.confirm-btn').onclick = () => {
            modal.remove();
            resolve();
        };
    });
}

// Función para guardar una importación en el historial
async function saveToHistory(importDetails) {
    const { importHistory = [] } = await chrome.storage.local.get('importHistory');
    
    const newImport = {
        date: new Date().toISOString(),
        totalProducts: importDetails.totalProducts,
        spreadsheetId: importDetails.spreadsheetId,
        spreadsheetName: importDetails.spreadsheetName,
        status: 'completed'
    };

    importHistory.unshift(newImport); // Agregar al inicio
    
    // Mantener solo las últimas 10 importaciones
    if (importHistory.length > 10) {
        importHistory.pop();
    }

    await chrome.storage.local.set({ importHistory });
}

// Función para mostrar el historial
async function showHistory() {
    try {
        // Ocultar sección de mapeo y mostrar historial
        document.getElementById('mappingSection').style.display = 'none';
        document.getElementById('historySection').style.display = 'block';
        
        // Limpiar cualquier mensaje de estado previo
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.style.display = 'none';
        }

        const { importHistory = [] } = await chrome.storage.local.get('importHistory');
        const historyList = document.getElementById('historyList');
        
        if (importHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <p>No import history yet</p>
                </div>
            `;
            return;
        }

        // Ordenar por fecha más reciente primero
        const sortedHistory = [...importHistory].sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );

        historyList.innerHTML = sortedHistory.map(entry => `
            <div class="history-card">
                <div class="history-date">
                    ${new Date(entry.date).toLocaleDateString()} 
                    ${new Date(entry.date).toLocaleTimeString()}
                </div>
                <div class="history-products">
                    ${entry.totalProducts} products imported
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error showing history:', error);
        showError('Error loading history: ' + error.message);
    }
}

// Función para volver desde el historial
function backFromHistory() {
    document.getElementById('historySection').style.display = 'none';
    document.getElementById('mappingSection').style.display = 'block';
    
    // Restaurar visibilidad del mensaje de estado si es necesario
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
        statusMessage.style.display = 'block';
    }
}
