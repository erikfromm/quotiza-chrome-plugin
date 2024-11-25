// Google API Client Library
(function() {
    const gapi = window.gapi = window.gapi || {};
    gapi._bs = new Date().getTime();
    
    gapi.load = function(name, callback) {
        if (callback) callback();
    };

    gapi.client = {
        init: async function(config) {
            this.apiKey = config.apiKey;
            this.clientId = config.clientId;
            return Promise.resolve();
        },
        
        sheets: {
            spreadsheets: {
                values: {
                    get: async function(params) {
                        try {
                            const token = await new Promise((resolve, reject) => {
                                chrome.identity.getAuthToken({ interactive: true }, function(token) {
                                    if (chrome.runtime.lastError) {
                                        reject(chrome.runtime.lastError);
                                    } else {
                                        resolve(token);
                                    }
                                });
                            });

                            const response = await fetch(
                                `https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheetId}/values/${params.range}`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${token}`
                                    }
                                }
                            );

                            if (!response.ok) {
                                throw new Error('Failed to fetch spreadsheet data');
                            }

                            const data = await response.json();
                            return {
                                result: {
                                    values: data.values || []
                                }
                            };
                        } catch (error) {
                            console.error('Error in sheets.get:', error);
                            throw error;
                        }
                    }
                }
            }
        }
    };
})();

console.log('Google API client loaded');

async function getSheetData(spreadsheetId) {
    try {
        // Limpiar token existente primero
        await new Promise((resolve, reject) => {
            chrome.identity.removeCachedAuthToken({ 
                token: window.currentToken 
            }, () => resolve());
        });

        // Obtener nuevo token con manejo de errores mejorado
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ 
                interactive: true,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            }, function(token) {
                if (chrome.runtime.lastError) {
                    console.error('Auth Error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!token) {
                    console.error('No token received');
                    reject(new Error('Authentication failed - no token received'));
                    return;
                }
                window.currentToken = token;
                resolve(token);
            });
        });

        console.log('Token obtained successfully');

        // Hacer la petición a la API con mejor manejo de errores
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error:', errorData);
            throw new Error(`API request failed: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error('Detailed error in getSheetData:', error);
        throw new Error(`Failed to get sheet data: ${error.message}`);
    }
}

// Exponer la función globalmente
window.getSheetData = getSheetData;
console.log('Google API client loaded with enhanced error handling');
