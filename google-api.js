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
        // Obtener token directamente usando chrome.identity
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, function(token) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(token);
                }
            });
        });

        // Hacer la petición directamente a la API de Google Sheets
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to fetch spreadsheet data');
        }

        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error('Error in getSheetData:', error);
        throw error;
    }
}

// Exponer la función globalmente
window.getSheetData = getSheetData;
console.log('Google API client loaded with enhanced error handling');
