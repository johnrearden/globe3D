/**
 * Search Module
 * Handles country search with autocomplete and keyboard navigation
 */

import { state } from '../data/state.js';

export class SearchManager {
    constructor(options = {}) {
        this.elements = options.elements;
        this.globeManager = options.globeManager;
        this.flagRenderer = options.flagRenderer;
        this.countryData = options.countryData;
        this.countryToISO = options.countryToISO;
        this.rotateGlobeToCountry = options.rotateGlobeToCountry;
        this.resetIdleTimer = options.resetIdleTimer;

        // Search state
        this.currentSearchIndex = -1;
        this.selectedSearchCountry = null;
    }

    /**
     * Initialize search event listeners
     */
    init() {
        const searchInput = this.elements.get('country-search');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.onSearchInput(e));
            searchInput.addEventListener('keydown', (e) => this.onSearchKeyDown(e));
        }

        // Single delegated click listener on the results container, attached once.
        // Result rows are re-rendered on every keystroke, so per-row listeners would
        // accumulate; delegation reads the clicked row's data-country instead.
        const resultsContainer = this.elements.get('search-results');
        if (resultsContainer) {
            resultsContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.search-result-item');
                if (item) {
                    this.selectCountryFromSearch(item.dataset.country);
                }
            });
        }

        console.log('SearchManager initialized');
    }

    /**
     * Handle search input
     * @param {Event} event - Input event
     */
    onSearchInput(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        const resultsContainer = this.elements.get('search-results');

        // Reset search index when user types
        this.currentSearchIndex = -1;

        // Clear results if search is empty
        if (searchTerm === '') {
            resultsContainer.innerHTML = '';
            this.selectedSearchCountry = null; // Clear selection when search is empty
            return;
        }

        // Get country names from the meta map
        const uniqueCountryNames = this.globeManager.getCountryNames();

        // Filter countries that match the search term
        const matchingCountries = uniqueCountryNames
            .filter(name => name.toLowerCase().includes(searchTerm))
            .sort();

        // Display results
        if (matchingCountries.length === 0) {
            resultsContainer.innerHTML = '<div style="color: var(--text-soft); padding: 8px;">No countries found</div>';
        } else {
            // Rows are click-handled via the delegated listener set up in init().
            resultsContainer.innerHTML = matchingCountries
                .map(name => `<div class="search-result-item" data-country="${name}">${name}</div>`)
                .join('');
        }
    }

    /**
     * Handle Enter key and arrow keys in search
     * @param {Event} event - Keyboard event
     */
    onSearchKeyDown(event) {
        const resultsContainer = this.elements.get('search-results');
        const resultItems = resultsContainer.querySelectorAll('.search-result-item');

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (resultItems.length > 0) {
                this.currentSearchIndex = (this.currentSearchIndex + 1) % resultItems.length;
                this.updateSearchSelection(resultItems);
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (resultItems.length > 0) {
                this.currentSearchIndex = this.currentSearchIndex <= 0 ? resultItems.length - 1 : this.currentSearchIndex - 1;
                this.updateSearchSelection(resultItems);
            }
        } else if (event.key === 'Enter') {
            const searchTerm = event.target.value.trim();

            // Get country names from the meta map
            const uniqueCountryNames = this.globeManager.getCountryNames();

            // If user has navigated with arrow keys, use that selection
            let matchedCountry = null;
            if (this.currentSearchIndex >= 0 && this.currentSearchIndex < resultItems.length) {
                matchedCountry = resultItems[this.currentSearchIndex].getAttribute('data-country');
            } else {
                // Try exact match first (case insensitive)
                matchedCountry = uniqueCountryNames.find(
                    name => name.toLowerCase() === searchTerm.toLowerCase()
                );

                // If no exact match, try partial match (take first result)
                if (!matchedCountry) {
                    const matches = uniqueCountryNames
                        .filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .sort();
                    matchedCountry = matches[0];
                }
            }

            if (matchedCountry) {
                this.selectCountryFromSearch(matchedCountry);
                // Select all text in the input
                event.target.select();
            }
        }
    }

    /**
     * Update visual selection in search results
     * @param {NodeList} resultItems - Search result items
     */
    updateSearchSelection(resultItems) {
        resultItems.forEach((item, index) => {
            if (index === this.currentSearchIndex) {
                item.style.backgroundColor = 'var(--accent-soft)';
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                // Update input value with selected country
                this.elements.get('country-search').value = item.getAttribute('data-country');
            } else {
                item.style.backgroundColor = '';
            }
        });
    }

    /**
     * Select country from search and hide results
     * @param {string} countryName - Name of the country to select
     */
    selectCountryFromSearch(countryName) {
        this.selectedSearchCountry = countryName; // Track selected country
        this.focusOnCountryByName(countryName);
        // Hide search results after selection
        this.elements.get('search-results').innerHTML = '';
        this.currentSearchIndex = -1; // Reset search index

        // Reset the idle timer to give user 10 seconds before rotation resumes
        if (this.resetIdleTimer) {
            this.resetIdleTimer();
        }
    }

    /**
     * Focus on country by name
     * @param {string} countryName - Name of the country to focus on
     */
    focusOnCountryByName(countryName) {
        const record = this.globeManager.getCountryByName(countryName);
        if (!record) return;

        if (this.flagRenderer) {
            this.flagRenderer.show(countryName, this.countryData, this.countryToISO,
                this.globeManager.getCapital(countryName)?.name);
        }

        this.globeManager.clearSelection();
        this.globeManager.setSelectedCountry(countryName);

        if (this.rotateGlobeToCountry) {
            this.rotateGlobeToCountry(record);
        }
    }

    /**
     * Get current selected search country
     * @returns {string|null}
     */
    getSelectedCountry() {
        return this.selectedSearchCountry;
    }

    /**
     * Clear search input and results
     */
    clear() {
        const searchInput = this.elements.get('country-search');
        const resultsContainer = this.elements.get('search-results');

        if (searchInput) {
            searchInput.value = '';
        }
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }

        this.currentSearchIndex = -1;
        this.selectedSearchCountry = null;
    }
}
