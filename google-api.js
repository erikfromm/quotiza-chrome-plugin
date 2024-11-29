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

window.getSheetData = async function(spreadsheetId, activeSheetId) {
    try {
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ 
                interactive: true,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
            }, function(token) {
                if (chrome.runtime.lastError) {
                    console.error('Auth error:', chrome.runtime.lastError);
                    reject(new Error('Authentication failed'));
                } else {
                    console.log('Token obtained successfully');
                    resolve(token);
                }
            });
        });

        // 2. Obtener los metadatos de la hoja
        console.log('Fetching spreadsheet metadata...');
        const metadataResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!metadataResponse.ok) {
            const errorText = await metadataResponse.text();
            console.error('Metadata API Response:', metadataResponse.status, errorText);
            throw new Error(`Metadata API error: ${metadataResponse.status}`);
        }

        const metadata = await metadataResponse.json();
        
        // Encontrar la hoja activa
        let activeSheet;
        if (activeSheetId === '0') {
            // Si el gid es 0, usar la primera hoja
            activeSheet = metadata.sheets[0];
        } else {
            // Si no, buscar por el gid específico
            activeSheet = metadata.sheets.find(sheet => 
                sheet.properties.sheetId.toString() === activeSheetId
            );
        }

        console.log('Sheets in document:', metadata.sheets.map(s => ({
            title: s.properties.title,
            sheetId: s.properties.sheetId
        })));
        console.log('Looking for sheet with ID:', activeSheetId);
        console.log('Found sheet:', activeSheet?.properties?.title);

        if (!activeSheet || !activeSheet.properties || !activeSheet.properties.title) {
            throw new Error('No valid active sheet found');
        }

        const sheetName = activeSheet.properties.title;
        console.log('Using sheet name:', sheetName);

        // 3. Obtener los datos usando el nombre de la hoja activa
        const range = `${sheetName}!A1:Z1000`;
        console.log('Fetching data with range:', range);
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Response:', response.status, errorText);
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.values || [];

    } catch (error) {
        console.error('Error in getSheetData:', error);
        if (error.message.includes('Authentication failed')) {
            throw new Error('Please sign in to access the spreadsheet');
        }
        throw new Error('Unable to access spreadsheet data. Please make sure you have permission to view this document.');
    }
};

console.log('Google API client loaded with enhanced error handling');
