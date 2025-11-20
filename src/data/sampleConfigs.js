// Sample config URLs for StreamInspector
export const defaultConfigs = [
    {
        id: '1',
        name: 'Quintar MultiSport',
        url: 'https://nba-prod.configs.quintar.ai/meta/2025/0.2.0/quintarsampleapp_multisport.json',
        lastFetched: null,
        data: null,
    },
];

// LocalStorage key for configs
export const STORAGE_KEY = 'streaminspector_configs';

// Load configs from localStorage
export function loadConfigs() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : defaultConfigs;
    } catch (e) {
        console.error('Error loading configs:', e);
        return defaultConfigs;
    }
}

// Save configs to localStorage
export function saveConfigs(configs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch (e) {
        console.error('Error saving configs:', e);
    }
}
