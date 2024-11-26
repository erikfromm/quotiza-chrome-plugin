let isInjected = {};

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url.includes('docs.google.com/spreadsheets')) {
        try {
            // Solo inyectamos si no lo hemos hecho antes
            if (!isInjected[tab.id]) {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['sidebar.css']
                });
                
                isInjected[tab.id] = true;
            }
            
            // Enviamos el mensaje
            chrome.tabs.sendMessage(tab.id, { 
                action: 'toggleSidebar' 
            });
        } catch (error) {
            console.error('Error:', error);
        }
    }
});

// Limpiar el objeto isInjected cuando se cierra una pestaña
chrome.tabs.onRemoved.addListener((tabId) => {
    delete isInjected[tabId];
});