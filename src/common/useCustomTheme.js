// Custom theme hook — lets the user override accent color / gradient / glow
const React = require('react');

const STORAGE_KEY = 'customTheme';

const hexToRgb = (hex) => {
    const sanitized = hex.replace('#', '');
    const bigint = parseInt(sanitized, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
};

const applyTheme = (hex) => {
    if (!hex) return;
    const { r, g, b } = hexToRgb(hex);
    const root = document.documentElement;
    root.style.setProperty('--primary-accent-color', `rgb(${r}, ${g}, ${b})`);
    root.style.setProperty('--secondary-background-color', `rgba(${r}, ${g}, ${b}, 0.25)`);
    root.style.setProperty('--outer-glow', `0px 0px 15px rgba(${r}, ${g}, ${b}, 0.37)`);
    root.style.setProperty('--modal-background-color', `rgba(${Math.round(r * 0.15 + 15 * 0.85)}, ${Math.round(g * 0.15 + 13 * 0.85)}, ${Math.round(b * 0.15 + 32 * 0.85)}, 1)`);
};

const useCustomTheme = () => {
    const [color, setColorState] = React.useState(() => {
        return localStorage.getItem(STORAGE_KEY) || '#7B5BF5';
    });

    React.useEffect(() => {
        applyTheme(color);
    }, []);

    const setColor = React.useCallback((hex) => {
        setColorState(hex);
        localStorage.setItem(STORAGE_KEY, hex);
        applyTheme(hex);
    }, []);

    const resetColor = React.useCallback(() => {
        const defaultColor = '#7B5BF5';
        setColorState(defaultColor);
        localStorage.removeItem(STORAGE_KEY);
        applyTheme(defaultColor);
    }, []);

    return { color, setColor, resetColor };
};

module.exports = useCustomTheme;