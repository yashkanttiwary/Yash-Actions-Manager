
export const getLegibleTextColor = (hex: string, isDarkBackground: boolean): string => {
    if (!hex || !hex.startsWith('#')) return isDarkBackground ? '#ffffff' : '#000000';
    
    // Parse hex
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    
    // Calculate Luminance (Rec. 601)
    // 0.299 R + 0.587 G + 0.114 B
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);

    if (isDarkBackground) {
        // Dark Mode (Background is dark gray/black)
        // Ensure text is light enough.
        // If color is very dark (e.g. Navy, Black, Dark Brown), lighten it or swap to white.
        // Threshold around 80-100 out of 255.
        if (lum < 100) {
            // It's too dark. Return a light color.
            return '#e2e8f0'; // Slate-200
        }
        // If it's reasonably bright, keep it (e.g. Yellow, Cyan, Neon Green look good on dark)
        return hex;
    } else {
        // Light Mode (Background is white/light gray)
        // Ensure text is dark enough.
        // If color is very light (e.g. Yellow, Pale Green, Cyan), darken it.
        // Threshold around 130-150. Yellow is 225.
        if (lum > 140) {
            // It's too light. Darken it.
            // Darken by reducing RGB values
            const darkenFactor = 0.45; // Keep 45% of original brightness
            r = Math.floor(r * darkenFactor);
            g = Math.floor(g * darkenFactor);
            b = Math.floor(b * darkenFactor);
            return `rgb(${r},${g},${b})`;
        }
        return hex;
    }
};

// New Utility: Calculates strictly Black or White based on background luminance
export const getContrastColor = (hex: string): string => {
    if (!hex || !hex.startsWith('#')) return '#000000';
    
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Threshold of 128 is standard. 
    // >= 128 means background is light -> return black text
    // < 128 means background is dark -> return white text
    return (yiq >= 128) ? '#1f2937' : '#ffffff'; // Using gray-800 for black to reduce harshness
};
