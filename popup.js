document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    
    // Configurar event listeners
    const loginButton = document.getElementById('loginBtn');
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
        console.log('Login button listener added');
    }

    const importButton = document.getElementById('importBtn');
    if (importButton) {
        importButton.addEventListener('click', handleImport);
        console.log('Import button listener added');
    }

    const closeButton = document.querySelector('.hide-sidebar-btn');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.parent.postMessage({ action: 'toggleSidebar' }, '*');
        });
        console.log('Sidebar button found');
    }

    setupLogoutButton();
});

function showStatus(message, type = 'info') {
    const statusContainer = document.createElement('div');
    statusContainer.className = `status-message ${type}`;
    statusContainer.textContent = message;
    
    // Remover cualquier mensaje de estado anterior
    const oldStatus = document.querySelector('.status-message');
    if (oldStatus) {
        oldStatus.remove();
    }
    
    document.body.appendChild(statusContainer);
    
    // Auto-ocultar después de 3 segundos
    setTimeout(() => {
        statusContainer.remove();
    }, 3000);
}

function showError(message) {
    showStatus(message, 'error');
}

async function handleLogin() {
    try {
        const apiToken = document.getElementById('apiToken').value.trim();
        const accountId = document.getElementById('accountId').value.trim();

        if (!apiToken || !accountId) {
            throw new Error('API Token and Account ID are required');
        }

        const queryParams = new URLSearchParams({
            account_id: accountId,
            job_id: "fake_job_id"
        }).toString();

        const url = `https://app.quotiza.com/api/v1/products/import_status?${queryParams}`;

        console.log('Validating credentials with URL:', url);
        console.log('API Token:', apiToken);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response Status:', response.status);
        const responseText = await response.text();
        console.log('Response Body:', responseText);

        if (response.status === 401) {
            throw new Error('Invalid API token or Account ID');
        } else if (response.status === 404) {
            // If it's 404 and the message is "job not found", then the credentials are valid
            console.log('Credentials validated successfully');
        } else if (!response.ok) {
            const errorData = JSON.parse(responseText || '{}');
            throw new Error(errorData.error ? errorData.error.message : 'Unexpected error occurred');
        }

        // Store credentials
        window.apiToken = apiToken;
        window.accountId = accountId;

        // Switch views
        const loginSection = document.getElementById('loginSection');
        const mainSection = document.getElementById('mainSection');

        if (loginSection && mainSection) {
            loginSection.style.display = 'none';
            mainSection.style.display = 'block';
        } else {
            console.error('Required sections not found:', {
                loginSection: !!loginSection,
                mainSection: !!mainSection
            });
            throw new Error('Unable to switch views - required elements not found');
        }

        // Initialize tabs
        setupTabListeners();

        // Check if we're in a spreadsheet
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url.includes('docs.google.com/spreadsheets')) {
            await loadSheetColumns();
        }

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message);
    }
}

async function handleImport() {
    try {
        showStatus('Preparing import...', 'info');
        
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!currentTab.url.includes('docs.google.com/spreadsheets')) {
            throw new Error('Invalid spreadsheet URL');
        }

        // Extraer el ID y el gid de la hoja activa
        const url = new URL(currentTab.url);
        const pathParts = url.pathname.split('/');
        let spreadsheetId = '';
        let activeSheetId = '';

        // Buscar el ID en la URL
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'd' && i + 1 < pathParts.length) {
                spreadsheetId = pathParts[i + 1];
                break;
            }
        }

        // Obtener el gid de la URL
        const gidMatch = url.hash.match(/gid=(\d+)/);
        if (gidMatch && gidMatch[1]) {
            activeSheetId = gidMatch[1];
        }

        if (!spreadsheetId || !activeSheetId) {
            throw new Error('Invalid spreadsheet URL');
        }

        console.log('Import - Spreadsheet ID:', spreadsheetId);
        console.log('Import - Active sheet ID:', activeSheetId);

        const data = await window.getSheetData(spreadsheetId, activeSheetId);
        
        if (!data || data.length <= 1) {
            throw new Error('No data found in spreadsheet');
        }

        // Validar límite de 1000 productos
        if (data.length > 1001) {
            showValidationModal([{
                message: 'Too many products. Maximum allowed is 1000 products per import.',
                type: 'error'
            }]);
            return;
        }

        // Obtener los valores de los selectores de columnas
        const skuColumn = document.getElementById('skuColumn').value;
        const nameColumn = document.getElementById('nameColumn').value;
        const brandColumn = document.getElementById('brandColumn').value;
        const categoryColumn = document.getElementById('categoryColumn').value;
        const imageUrlColumn = document.getElementById('imageUrlColumn').value;
        const basePriceColumn = document.getElementById('basePriceColumn').value;

        // Mapear los índices de las columnas
        const skuIndex = skuColumn.charCodeAt(0) - 65;
        const nameIndex = nameColumn.charCodeAt(0) - 65;
        const brandIndex = brandColumn.charCodeAt(0) - 65;
        const categoryIndex = categoryColumn.charCodeAt(0) - 65;
        const imageUrlIndex = imageUrlColumn.charCodeAt(0) - 65;
        const basePriceIndex = basePriceColumn.charCodeAt(0) - 65;

        // Map and validate products
        const products = [];
        const errors = [];
        
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const product = {
                sku: row[skuIndex]?.trim(),
                name: row[nameIndex]?.trim(),
                brand: row[brandIndex]?.trim(),
                category: row[categoryIndex]?.trim(),
                image_url: row[imageUrlIndex]?.trim(),
                base_price: row[basePriceIndex] ? parseFloat(row[basePriceIndex]) : undefined
            };

            // Solo incluir campos que tienen valor
            Object.keys(product).forEach(key => {
                if (product[key] === undefined || product[key] === '') {
                    delete product[key];
                }
            });

            const productErrors = validateProduct(product, i + 1);
            if (productErrors.length > 0) {
                errors.push(...productErrors);
            } else {
                products.push(product);
            }
        }

        if (errors.length > 0) {
            showValidationModal(errors);
            return;
        }

        // Preparar los datos para la importación
        const importData = {
            account_id: window.accountId,
            products: products
        };

        console.log('Import request body:', importData);

        // Realizar la importación
        const response = await fetch('https://app.quotiza.com/api/v1/products/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.apiToken}`
            },
            body: JSON.stringify(importData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to import products');
        }

        const responseData = await response.json();
        console.log('API Response:', responseData);

        // Verificar el estado de la importación
        await checkImportStatus(responseData.job_id);

    } catch (error) {
        console.error('Import error:', error);
        showError(error.message);
    }
}

async function checkImportStatus(jobId) {
    try {
        const response = await fetch(
            `https://app.quotiza.com/api/v1/products/import_status?account_id=${window.accountId}&job_id=${jobId}`,
            {
                headers: {
                    'Authorization': `Bearer ${window.apiToken}`
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to check import status');
        }

        const statusData = await response.json();
        console.log('Import status:', statusData);

        if (statusData.status === 'completed') {
            showStatus(`Import completed: ${statusData.successes} products imported successfully, ${statusData.failures} failures`, 'success');
        } else if (statusData.status === 'failed') {
            showError('Import failed: ' + (statusData.errors?.[0]?.message || 'Unknown error'));
        } else {
            // Si todavía está procesando, verificar nuevamente en 2 segundos
            setTimeout(() => checkImportStatus(jobId), 2000);
        }

    } catch (error) {
        console.error('Status check error:', error);
        showError(error.message);
    }
}

async function validateAndMapProducts(data) {
    const products = [];
    const headers = data[0];
    
    // Get column mappings
    const mappings = {
        sku: document.getElementById('skuColumn').value,
        name: document.getElementById('nameColumn').value,
        basePrice: document.getElementById('basePriceColumn').value,
        // Add other mappings as needed
    };

    // Validate each row
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const product = {};
        let isValid = true;
        const validationErrors = [];

        // Map and validate required fields
        const skuIndex = getColumnIndex(mappings.sku);
        const nameIndex = getColumnIndex(mappings.name);
        const priceIndex = getColumnIndex(mappings.basePrice);

        if (!row[skuIndex]?.trim()) {
            validationErrors.push(`Row ${i + 1}: SKU is required`);
            isValid = false;
        }

        if (!row[nameIndex]?.trim()) {
            validationErrors.push(`Row ${i + 1}: Name is required`);
            isValid = false;
        }

        if (!row[priceIndex] || isNaN(parseFloat(row[priceIndex]))) {
            validationErrors.push(`Row ${i + 1}: Base Price must be a valid number`);
            isValid = false;
        }

        if (!isValid) {
            console.error('Validation errors:', validationErrors);
            continue;
        }

        // Map the product data
        product.sku = row[skuIndex].trim();
        product.name = row[nameIndex].trim();
        product.base_price = parseFloat(row[priceIndex]);
        
        // Add other mapped fields...

        products.push(product);
    }

    return products;
}

function getColumnIndex(columnLetter) {
    return columnLetter ? columnLetter.charCodeAt(0) - 65 : -1;
}

// Función para cargar las columnas en los selectores
async function loadSheetColumns() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url.includes('docs.google.com/spreadsheets')) {
            console.log('Not in a Google Spreadsheet');
            return;
        }

        // Extraer el ID y el gid de la hoja activa
        const url = new URL(tab.url);
        const pathParts = url.pathname.split('/');
        let spreadsheetId = '';
        let activeSheetId = '';

        // Buscar el ID en la URL
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'd' && i + 1 < pathParts.length) {
                spreadsheetId = pathParts[i + 1];
                break;
            }
        }

        // Obtener el gid de la URL
        const gidMatch = url.hash.match(/gid=(\d+)/);
        if (gidMatch && gidMatch[1]) {
            activeSheetId = gidMatch[1];
        }

        if (!spreadsheetId || !activeSheetId) {
            throw new Error('Invalid spreadsheet URL');
        }

        console.log('Spreadsheet URL:', tab.url);
        console.log('Extracted spreadsheet ID:', spreadsheetId);
        console.log('Active sheet ID:', activeSheetId);

        const data = await window.getSheetData(spreadsheetId, activeSheetId);
        
        if (!data || data.length === 0) {
            console.log('No data found in spreadsheet');
            showTemplateModal();
            return;
        }

        const headers = data[0];
        populateDropdowns(headers);

        console.log('Columns loaded successfully');

    } catch (error) {
        console.error('Error loading columns:', error);
        showError('Failed to load spreadsheet columns: ' + error.message);
    }
}

function populateDropdowns(headers) {
    const dropdowns = [
        'skuColumn',
        'nameColumn',
        'brandColumn',
        'categoryColumn',
        'imageUrlColumn',
        'basePriceColumn'
    ];

    dropdowns.forEach(dropdownId => {
        const select = document.getElementById(dropdownId);
        if (!select) return;

        // Clear existing options
        select.innerHTML = '<option value="">Select Column</option>';

        // Add column options
        headers.forEach((header, index) => {
            const option = document.createElement('option');
            option.value = String.fromCharCode(65 + index); // Convert to A, B, C, etc.
            option.textContent = `${String.fromCharCode(65 + index)} - ${header}`;
            select.appendChild(option);
        });
    });
}

// Función para configurar los event listeners de la sección de mapeo
function setupMappingSectionListeners() {
    // Import button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', handleImport);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Función para manejar el logout
async function handleLogout() {
    try {
        // Limpiar credenciales del storage
        await chrome.storage.local.remove(['apiToken', 'accountId']);
        
        // Limpiar variables globales
        window.apiToken = '';
        window.accountId = '';
        
        // Limpiar campos de input
        document.getElementById('apiToken').value = '';
        document.getElementById('accountId').value = '';
        
        // Ocultar sección principal y mostrar login
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('mainSection').style.display = 'none';
        
        showStatus('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showError('Error logging out: ' + error.message);
    }
}

function validateProducts(products) {
    const errors = [];
    const skus = new Set();

    if (products.length > 1000) {
        errors.push('Maximum 1000 products allowed per import');
        return errors;
    }

    products.forEach((product, index) => {
        const rowNum = index + 2; // +2 porque la primera fila es headers y el índice empieza en 0

        // Validar SKU (requerido y único)
        if (!product.sku) {
            errors.push(`Row ${rowNum}: SKU is required`);
        } else if (product.sku.length < 3) {
            errors.push(`Row ${rowNum}: SKU must be at least 3 characters`);
        } else if (skus.has(product.sku)) {
            errors.push(`Row ${rowNum}: Duplicate SKU "${product.sku}"`);
        }
        skus.add(product.sku);

        // Validar Name (requerido)
        if (!product.name) {
            errors.push(`Row ${rowNum}: Name is required`);
        } else if (product.name.length < 3) {
            errors.push(`Row ${rowNum}: Name must be at least 3 characters`);
        }

        // Validar Brand (requerido)
        if (!product.brand) {
            errors.push(`Row ${rowNum}: Brand is required`);
        } else if (product.brand.length < 2) {
            errors.push(`Row ${rowNum}: Brand must be at least 2 characters`);
        }

        // Validar precios si existen
        if (product.base_price !== undefined && (isNaN(product.base_price) || product.base_price < 0)) {
            errors.push(`Row ${rowNum}: Base price must be a positive number`);
        }
        if (product.cost !== undefined && (isNaN(product.cost) || product.cost < 0)) {
            errors.push(`Row ${rowNum}: Cost must be a positive number`);
        }
        if (product.msrp !== undefined && (isNaN(product.msrp) || product.msrp < 0)) {
            errors.push(`Row ${rowNum}: MSRP must be a positive number`);
        }
    });

    return errors;
}

function showValidationModal(errors) {
    console.log('Showing validation modal with errors:', errors);
    
    // Remover modales existentes
    const existingModal = document.querySelector('.validation-modal');
    const existingOverlay = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();
    if (existingOverlay) existingOverlay.remove();

    // Crear el overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
    `;
    
    // Crear el modal
    const modal = document.createElement('div');
    modal.className = 'validation-modal';
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 16px;
        z-index: 1001;
        width: calc(100% - 88px);
        max-width: 400px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;
    
    // Contenido del modal basado en si hay errores o no
    const hasErrors = errors && errors.length > 0;
    modal.innerHTML = hasErrors ? `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <h3 style="font-size: 20px; margin: 0; flex-grow: 1;">Import Summary</h3>
            <button style="background: none; border: none; cursor: pointer; padding: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.25 6.75L6.75 17.25M6.75 6.75L17.25 17.25" stroke="#8A8AA3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
        <p style="margin-bottom: 20px; color: #666;">Review the following validation errors before proceeding</p>
        <div style="
            background: #F8F8F9;
            border: 1px solid #E5E5E9;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 20px;
        ">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4.95227 16.3535L10.2153 5.85653C10.9532 4.38476 13.054 4.38515 13.7913 5.85718L19.0495 16.3542C19.7157 17.6841 18.7487 19.25 17.2613 19.25H6.74014C5.25241 19.25 4.28547 17.6835 4.95227 16.3535Z" stroke="#4B4B63" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 10V12" stroke="#4B4B63" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12.5 16C12.5 16.2761 12.2761 16.5 12 16.5C11.7239 16.5 11.5 16.2761 11.5 16C11.5 15.7239 11.7239 15.5 12 15.5C12.2761 15.5 12.5 15.7239 12.5 16Z" stroke="#4B4B63"/>
                </svg>
                <h4 style="font-size: 16px; margin: 0; color: #4B4B63;">Warning: Validation Errors</h4>
            </div>
            ${errors.map(error => `
                <div style="color: #666; margin-bottom: 8px; padding-left: 28px;">
                    ${error.message}
                </div>
            `).join('')}
        </div>
        <button id="checkErrorsBtn" style="
            width: 100%;
            padding: 12px;
            background: #EF4444;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.25 4.75L8.75 7L11.25 9.25M12.75 19.25L15.25 17L12.75 14.75M9.75 7H13.25C16.5637 7 19.25 9.68629 19.25 13V13.25M14.25 17H10.75C7.43629 17 4.75 14.3137 4.75 11V10.75" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Check Errors
        </button>
    ` : `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
            <h3 style="font-size: 20px; margin: 0; flex-grow: 1;">Import Summary</h3>
            <button style="background: none; border: none; cursor: pointer; padding: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.25 6.75L6.75 17.25M6.75 6.75L17.25 17.25" stroke="#8A8AA3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
        <p style="margin-bottom: 20px; color: #666;">No errors found! Your products are ready to import.</p>
        <button id="importProductsBtn" style="
            width: 100%;
            padding: 12px;
            background: #057a55;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.75 14.75V16.25C4.75 17.9069 6.09315 19.25 7.75 19.25H16.25C17.9069 19.25 19.25 17.9069 19.25 16.25V14.75M12 14.25V5M8.75 8.25L12 4.75L15.25 8.25" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Import Products
        </button>
    `;

    // Agregar al DOM
    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Event listeners
    const closeButton = modal.querySelector('button');
    const actionButton = modal.querySelector(hasErrors ? '#checkErrorsBtn' : '#importProductsBtn');
    
    const closeModal = () => {
        modal.remove();
        overlay.remove();
    };

    closeButton.addEventListener('click', closeModal);
    
    if (hasErrors) {
        actionButton.addEventListener('click', async () => {
            closeModal();
            await handleImport(); // Volver a verificar errores
        });
    } else {
        actionButton.addEventListener('click', async () => {
            closeModal();
            // Aquí iría la lógica de importación real
        });
    }
    
    overlay.addEventListener('click', closeModal);
}

// Función para manejar el historial local
async function addToImportHistory(importData) {
    try {
        const storageKey = `importHistory_${window.accountId}`;
        const stored = await chrome.storage.local.get(storageKey);
        let history = stored[storageKey] || [];

        const newEntry = {
            created_at: new Date().toISOString(),
            total_products: importData.total_products,
            status: 'completed',
            account_id: window.accountId
        };

        history.unshift(newEntry);
        
        // Guardar con key específica para la cuenta
        await chrome.storage.local.set({ [storageKey]: history });

        const historyList = document.getElementById('historyList');
        if (historyList && historyList.style.display !== 'none') {
            await loadImportHistory();
        }
    } catch (error) {
        console.error('Error saving to history:', error);
    }
}

// Nueva función para cargar el historial
async function loadImportHistory() {
    try {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        const storageKey = `importHistory_${window.accountId}`;
        const stored = await chrome.storage.local.get(storageKey);
        const history = stored[storageKey] || [];

        historyList.innerHTML = '';

        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-history">No import history available yet</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'history-table';
        
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Products</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(item => {
                    const date = new Date(item.created_at);
                    return `
                        <tr>
                            <td>${date.toLocaleDateString()}</td>
                            <td>${date.toLocaleTimeString()}</td>
                            <td>${item.total_products}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        `;
        
        historyList.appendChild(table);
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = '<div class="empty-history">Error loading import history</div>';
    }
}

function setupTabListeners() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Remover active de todos los tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Agregar active al tab clickeado
            tab.classList.add('active');

            // Mostrar la sección correspondiente
            if (tab.textContent === 'Import') {
                document.getElementById('mappingSection').style.display = 'block';
                document.getElementById('historySection').style.display = 'none';
            } else if (tab.textContent === 'History') {
                document.getElementById('mappingSection').style.display = 'none';
                document.getElementById('historySection').style.display = 'block';
                // Cargar el historial cuando se muestra la sección
                await loadImportHistory();
            }
        });
    });
}

const TEMPLATE_COLUMNS = [
    'sku', 'name', 'brand', 'category', 'image_url', 'base_price', 
    'msrp', 'description', 'active', 'upc', 'sales_unit', 
    'base_unit_of_measure', 'base_units_per_sales_unit', 
    'custom1_name', 'custom1_value', 'custom2_name', 'custom2_value', 
    'custom3_name', 'custom3_value'
];

function showTemplateModal() {
    if (document.getElementById('loginSection').style.display !== 'none') {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'template-modal';
    modal.innerHTML = `
        <div class="template-modal-header">
            <h3>Empty Spreadsheet Detected</h3>
        </div>
        <div class="template-modal-content">
            <p>It looks like you're starting fresh. Would you like to use our import template to get started or stick with your current format?</p>
        </div>
        <div class="template-modal-actions">
            <button class="template-btn template-btn-secondary" id="useOwnFormat">
                Use Current Format
            </button>
            <button class="template-btn template-btn-primary" id="useTemplate">
                Start with Template
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('useOwnFormat').addEventListener('click', () => {
        modal.remove();
        overlay.remove();
    });

    document.getElementById('useTemplate').addEventListener('click', async () => {
        await createImportTemplate();
        modal.remove();
        overlay.remove();
    });
}

async function createImportTemplate() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const spreadsheetId = tab.url.match(/\/d\/(.*?)\//)[1];

        // Send message to background script
        const response = await chrome.runtime.sendMessage({
            action: 'updateSheet',
            spreadsheetId: spreadsheetId,
            range: 'A1:S1',
            values: [TEMPLATE_COLUMNS]
        });

        if (!response || response.error) {
            throw new Error(response?.error || 'Failed to update sheet');
        }

        // Wait for changes to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reload columns
        await loadSheetColumns();

    } catch (error) {
        console.error('Error creating template:', error);
        showError('Failed to create template. Please try again.');
    }
}

async function initializeGoogleApi() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: 'YOUR_API_KEY',
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

function validateProduct(product, rowIndex) {
    const errors = [];
    
    // Validar campos requeridos
    if (!product.sku || product.sku.length < 3) {
        errors.push({
            message: `Row ${rowIndex}: SKU must be at least 3 characters`,
            row: rowIndex
        });
    }
    
    if (!product.name || product.name.length < 3) {
        errors.push({
            message: `Row ${rowIndex}: Name must be at least 3 characters`,
            row: rowIndex
        });
    }

    if (!product.brand) {
        errors.push({
            message: `Row ${rowIndex}: Brand is required`,
            row: rowIndex
        });
    }
    
    // Validar campos numéricos
    if (product.base_price !== undefined && isNaN(product.base_price)) {
        errors.push({
            message: `Row ${rowIndex}: Base price must be a valid number`,
            row: rowIndex
        });
    }

    if (product.msrp !== undefined && isNaN(product.msrp)) {
        errors.push({
            message: `Row ${rowIndex}: MSRP must be a valid number`,
            row: rowIndex
        });
    }

    return errors;
}

