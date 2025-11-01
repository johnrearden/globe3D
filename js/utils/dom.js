/**
 * DOM Utilities Module
 * Provides efficient DOM element caching and manipulation helpers
 */

/**
 * Element cache to avoid repeated DOM queries
 */
class ElementCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get element by ID with caching
     * @param {string} id - Element ID
     * @returns {HTMLElement|null} The cached or newly fetched element
     */
    get(id) {
        if (!this.cache.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.cache.set(id, element);
            }
            return element;
        }
        return this.cache.get(id);
    }

    /**
     * Clear the cache for a specific element or all elements
     * @param {string} [id] - Optional element ID to clear, clears all if not provided
     */
    clear(id) {
        if (id) {
            this.cache.delete(id);
        } else {
            this.cache.clear();
        }
    }
}

// Export singleton instance
export const elements = new ElementCache();

/**
 * Show an element by setting display to 'block'
 * @param {HTMLElement} element - The element to show
 */
export function show(element) {
    if (element) {
        element.style.display = 'block';
    }
}

/**
 * Hide an element by setting display to 'none'
 * @param {HTMLElement} element - The element to hide
 */
export function hide(element) {
    if (element) {
        element.style.display = 'none';
    }
}

/**
 * Toggle element visibility
 * @param {HTMLElement} element - The element to toggle
 */
export function toggle(element) {
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Set element visibility using visibility property
 * @param {HTMLElement} element - The element to modify
 * @param {boolean} visible - Whether the element should be visible
 */
export function setVisibility(element, visible) {
    if (element) {
        element.style.visibility = visible ? 'visible' : 'hidden';
    }
}

/**
 * Show an element by setting display to 'flex'
 * @param {HTMLElement} element - The element to show
 */
export function showFlex(element) {
    if (element) {
        element.style.display = 'flex';
    }
}

/**
 * Set element text content safely
 * @param {HTMLElement} element - The element to modify
 * @param {string} text - The text content to set
 */
export function setText(element, text) {
    if (element) {
        element.textContent = text;
    }
}

/**
 * Add a class to an element
 * @param {HTMLElement} element - The element to modify
 * @param {string} className - The class name to add
 */
export function addClass(element, className) {
    if (element && className) {
        element.classList.add(className);
    }
}

/**
 * Remove a class from an element
 * @param {HTMLElement} element - The element to modify
 * @param {string} className - The class name to remove
 */
export function removeClass(element, className) {
    if (element && className) {
        element.classList.remove(className);
    }
}

/**
 * Toggle a class on an element
 * @param {HTMLElement} element - The element to modify
 * @param {string} className - The class name to toggle
 */
export function toggleClass(element, className) {
    if (element && className) {
        element.classList.toggle(className);
    }
}
