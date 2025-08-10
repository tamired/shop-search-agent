(function() {
  'use strict';

  // Global state
  let isVisible = true;
  let isExpanded = false;
  let isMinimal = true;
  let isLoading = false;
  let showResults = false;
  let isMobile = false;
  let isKeyboardOpen = false;
  let isTransitioning = false;
  let query = '';
  let results = [];
  let currentIconIndex = 0;

  // AI Icons for rotation (using SVG path data)
  const aiIcons = [
    // Bot
    `<circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/><path d="m15.5 3.5-1.5 1.5M10 10l-1.5-1.5m7 7-1.5-1.5M10 14l-1.5 1.5"/>`,
    // Sparkles
    `<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>`,
    // Zap
    `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
    // Brain
    `<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>`,
    // Cpu
    `<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>`,
    // Search
    `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`
  ];

  // DOM elements
  let container;
  let bubble;
  let interface_;
  let input;
  let button;
  let loading;
  let loadingIcon;
  let resultsPanel;
  let resultsContent;
  let resultsClose;

  // Configuration from Liquid template
  const config = window.searchWidgetConfig || {};

  // Hardcoded mapping of shop domains to app URLs
  // This removes the need for manual configuration
  const APP_URL_MAPPING = {
    // Add your shop domains and their corresponding app URLs here
    'tuki-storefront.myshopify.com': 'https://often-dialog-personally-networking.trycloudflare.com',
    // Add more mappings as needed
    // 'another-shop.myshopify.com': 'https://another-app-url.com',
  };

  // Determine the API endpoint automatically
  function getApiEndpoint() {
    // Use custom endpoint if provided
    if (config.customApiEndpoint) {
      console.log('Using custom API endpoint:', config.customApiEndpoint);
      return config.customApiEndpoint;
    }

    // For development environments
    if (window.location.hostname === 'localhost' || 
        window.location.hostname.includes('127.0.0.1') ||
        window.location.hostname.includes('ngrok')) {
      console.log('Detected development environment');
      return 'http://localhost:3000/search';
    }

    // Get the current shop domain from the configuration
    const shopDomain = config.shopDomain;
    
    // Look up the app URL in our mapping
    if (shopDomain && APP_URL_MAPPING[shopDomain]) {
      const appUrl = APP_URL_MAPPING[shopDomain];
      console.log(`Using mapped app URL for ${shopDomain}:`, appUrl);
      return `${appUrl}/search`;
    }

    // For Cloudflare tunnels - check if we're on a cloudflare domain (development)
    if (window.location.hostname.includes('trycloudflare.com')) {
      const cloudflareUrl = window.location.origin + '/search';
      console.log('Detected Cloudflare tunnel, using same origin:', cloudflareUrl);
      return cloudflareUrl;
    }

    // If we can't determine the app URL, log an error with instructions
    console.error('❌ App URL mapping not found for shop:', shopDomain);
    console.error('Please add the mapping to APP_URL_MAPPING in search-widget.js:');
    console.error(`'${shopDomain}': 'YOUR_APP_URL_HERE',`);
    
    return null; // Return null to trigger fallback to mock data
  }

  // Icon rotation interval
  let iconRotationInterval;

  // Start rotating icons during loading
  function startIconRotation() {
    if (!loadingIcon) return;
    
    iconRotationInterval = setInterval(() => {
      currentIconIndex = (currentIconIndex + 1) % aiIcons.length;
      const svg = loadingIcon.querySelector('svg');
      if (svg) {
        svg.innerHTML = aiIcons[currentIconIndex];
      }
    }, 300);
  }

  // Stop rotating icons
  function stopIconRotation() {
    if (iconRotationInterval) {
      clearInterval(iconRotationInterval);
      iconRotationInterval = null;
    }
  }

  // Handle transitions
  function handleTransition() {
    if (isMobile) return;

    isTransitioning = true;
    if (interface_) {
      interface_.classList.add('transitioning');
    }
    
    setTimeout(() => {
      isTransitioning = false;
      if (interface_) {
        interface_.classList.remove('transitioning');
      }
    }, 600);
  }

  // Mobile detection and setup
  function checkMobile() {
    const mobile = window.innerWidth < 768;
    isMobile = mobile;

    if (mobile) {
      isVisible = true;
      isMinimal = false;
      isExpanded = false;
    } else {
      isMinimal = true;
      isExpanded = false;
    }
    
    updateWidgetState();
  }

  // Keyboard detection for mobile
  function detectKeyboard() {
    if (!isMobile) return;

    const initialHeight = window.screen.height;
    const currentHeight = window.innerHeight;
    const heightDifference = initialHeight - currentHeight;
    const keyboardThreshold = 150;

    const keyboardIsOpen = heightDifference > keyboardThreshold;
    
    if (keyboardIsOpen !== isKeyboardOpen) {
      isKeyboardOpen = keyboardIsOpen;
      updateWidgetState();
    }
  }

  // Update widget visual state
  function updateWidgetState() {
    if (!container) return;

    // Update container positioning
    if (isMobile) {
      if (isKeyboardOpen) {
        container.style.position = 'fixed';
        container.style.bottom = '0';
        container.style.left = '0';
        container.style.transform = 'none';
        container.style.width = '100%';
      } else {
        container.style.position = 'fixed';
        container.style.bottom = '16px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.width = 'auto';
      }
    }

    // Update bubble visibility
    if (bubble) {
      bubble.style.display = (isMinimal && !isExpanded) ? 'flex' : 'none';
    }

    // Update interface visibility
    if (interface_) {
      if (isMinimal && !isExpanded) {
        interface_.classList.remove('active');
      } else {
        interface_.classList.add('active');
      }
    }

    // Update loading state
    if (loading) {
      if (isLoading) {
        loading.classList.add('active');
        startIconRotation();
      } else {
        loading.classList.remove('active');
        stopIconRotation();
      }
    }

    // Update results panel
    if (resultsPanel) {
      if (showResults) {
        console.log('Opening results panel');
        resultsPanel.classList.add('active');
        if (isMobile) {
          document.body.classList.add('search-widget-open');
        }
      } else {
        console.log('Closing results panel');
        resultsPanel.classList.remove('active');
        document.body.classList.remove('search-widget-open');
      }
    } else {
      console.error('Results panel element not found!');
    }
  }

  // Handle search functionality
  async function handleSearch() {
    if (!query.trim()) {
      console.log('Search aborted: empty query');
      return;
    }

    console.log('Starting search with query:', query);

    // Check if we have a valid API endpoint
    if (!config.apiEndpoint) {
      console.error('❌ No valid API endpoint found. Please configure the App URL in widget settings.');
      // Show error message to user
      alert('Search is not configured properly. Please contact the store administrator to set up the App URL in the widget settings.');
      return;
    }

    console.log('Using API endpoint:', config.apiEndpoint);

    // Blur input to hide keyboard on mobile
    if (isMobile && input) {
      input.blur();
    }

    isLoading = true;
    if (!isMobile) {
      isExpanded = true;
      isMinimal = false;
    }
    isVisible = true;

    console.log('Search state updated - Loading:', isLoading);
    updateWidgetState();

    try {
      // Prepare headers for the request
      const headers = {
        'Content-Type': 'application/json',
      };

      // Add origin header for CORS
      if (window.location.origin) {
        headers['Origin'] = window.location.origin;
      }

      console.log('Making search request to:', config.apiEndpoint);
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          query: query,
          shopId: config.shopId,
          enableProducts: config.enableProducts,
          enableFAQ: config.enableFAQ,
          limit: config.resultsPerPage || 4
        })
      });

      if (response.ok) {
        results = await response.json();
        console.log('API results received:', results);
        
        // Ensure results is an array
        if (!Array.isArray(results)) {
          console.warn('API returned non-array results, converting:', results);
          results = results.results || results.data || [];
        }
      } else {
        console.error('Search API request failed with status:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        
        // Provide more specific error messages
        if (response.status === 404) {
          throw new Error(`Search endpoint not found (404). Please verify the App URL is correct: ${config.apiEndpoint}`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden (403). Please check CORS settings and authentication.`);
        } else {
          throw new Error(`Search API request failed: ${response.status} ${response.statusText}`);
        }
      }

      isLoading = false;
      showResults = true;
      console.log('Search completed - Loading:', isLoading, 'ShowResults:', showResults);
      
      displayResults();
      updateWidgetState();
    } catch (error) {
      console.error('Search error:', error);
      isLoading = false;
      
      // Show error state or fallback to mock data
      console.log('Falling back to mock data due to error');
      results = await getMockResults();
      showResults = true;
      console.log('Fallback results received:', results);
      displayResults();
      updateWidgetState();
    }
  }

  // Mock search results for development/fallback
  async function getMockResults() {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Create inline SVG placeholders as data URLs
        const headphonesImage = `data:image/svg+xml;base64,${btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <rect width="200" height="200" fill="#f472b6"/>
            <g fill="white" transform="translate(50, 50)">
              <path d="M50 20C30 20 14 36 14 56v30c0 8 7 15 15 15h6V71c0-14 11-25 25-25s25 11 25 25v30h6c8 0 15-7 15-15V56c0-20-16-36-36-36z"/>
              <circle cx="35" cy="80" r="15" fill="#f472b6" stroke="white" stroke-width="2"/>
              <circle cx="65" cy="80" r="15" fill="#f472b6" stroke="white" stroke-width="2"/>
            </g>
            <text x="100" y="140" text-anchor="middle" fill="white" font-family="Arial" font-size="14" font-weight="bold">Headphones</text>
          </svg>
        `)}`;

        const watchImage = `data:image/svg+xml;base64,${btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <rect width="200" height="200" fill="#22d3ee"/>
            <g fill="white" transform="translate(70, 50)">
              <rect x="0" y="20" width="60" height="80" rx="15" fill="white" stroke="#22d3ee" stroke-width="2"/>
              <rect x="5" y="25" width="50" height="40" rx="8" fill="#22d3ee"/>
              <circle cx="30" cy="85" r="8" fill="#22d3ee"/>
              <rect x="-10" y="35" width="8" height="15" rx="4" fill="white"/>
              <rect x="62" y="35" width="8" height="15" rx="4" fill="white"/>
              <rect x="15" y="10" width="30" height="8" rx="4" fill="white"/>
              <rect x="15" y="102" width="30" height="8" rx="4" fill="white"/>
            </g>
            <text x="100" y="140" text-anchor="middle" fill="white" font-family="Arial" font-size="14" font-weight="bold">Smart Watch</text>
          </svg>
        `)}`;

        const mockResults = [
          {
            type: "product",
            id: 1,
            name: "Wireless Headphones",
            price: "$99.99",
            image: headphonesImage,
            rating: 4.5,
            description: "High-quality wireless headphones with noise cancellation"
          },
          {
            type: "faq",
            id: 2,
            question: "What is your return policy?",
            answer: "We offer a 30-day return policy for all items in original condition."
          },
          {
            type: "product",
            id: 3,
            name: "Smart Watch",
            price: "$199.99",
            image: watchImage,
            rating: 4.8,
            description: "Feature-rich smartwatch with health monitoring"
          },
          {
            type: "faq",
            id: 4,
            question: "Do you offer free shipping?",
            answer: "Yes, we offer free shipping on orders over $50."
          }
        ];
        resolve(mockResults);
      }, 2000);
    });
  }

  // Display search results
  function displayResults() {
    if (!resultsContent || !results) {
      console.error('Cannot display results - missing elements:', {
        resultsContent: !!resultsContent,
        results: !!results
      });
      return;
    }

    console.log('Displaying results:', results.length, 'items');
    resultsContent.innerHTML = '';

    results.forEach((result, index) => {
      console.log(`Processing result ${index}:`, result.type, result.name || result.question);
      if (result.type === 'product') {
        const productCard = createProductCard(result);
        resultsContent.appendChild(productCard);
      } else if (result.type === 'faq') {
        const faqTile = createFAQTile(result);
        resultsContent.appendChild(faqTile);
      }
    });

    console.log('Results display completed, content added to resultsContent');
  }

  // Create product card element
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'search-product-card';
    
    const stars = Array.from({length: 5}, (_, i) => {
      const filled = i < Math.floor(product.rating);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${filled ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`;
    }).join('');

    card.innerHTML = `
      <div class="search-product-image">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
      </div>
      <div class="search-product-info">
        <h3 class="search-product-title">${product.name}</h3>
        <p class="search-product-description">${product.description}</p>
        <div class="search-product-rating">
          <div class="search-product-stars">${stars}</div>
          <span class="search-product-rating-text">${product.rating}</span>
        </div>
        <div class="search-product-price">${product.price}</div>
      </div>
    `;

    // Add click handler to navigate to product
    card.addEventListener('click', () => {
      if (product.handle) {
        window.location.href = `/products/${product.handle}`;
      }
    });

    return card;
  }

  // Create FAQ tile element
  function createFAQTile(faq) {
    const tile = document.createElement('div');
    tile.className = 'search-faq-tile';
    
    tile.innerHTML = `
      <h4 class="search-faq-question">${faq.question}</h4>
      <p class="search-faq-answer">${faq.answer}</p>
    `;

    return tile;
  }

  // Expand widget (desktop)
  function expandWidget(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!isMobile) {
      isVisible = true;
      isMinimal = false;
      handleTransition();
      updateWidgetState();
    }
  }

  // Close results panel
  function closeResults() {
    showResults = false;
    isVisible = true;
    isMinimal = true;
    updateWidgetState();
  }

  // Handle key press events
  function handleKeyPress(e) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }

  // Handle scroll events (desktop only)
  function handleScroll() {
    if (isMobile || showResults) return;

    const currentScrollY = window.scrollY;
    const scrollThreshold = 100;

    if (currentScrollY > scrollThreshold) {
      isVisible = false;
    } else {
      isVisible = true;
      isMinimal = true;
    }

    updateWidgetState();
  }

  // Initialize event listeners
  function initEventListeners() {
    // Bubble click handler
    if (bubble) {
      bubble.addEventListener('click', expandWidget);
    }

    // Input handlers
    if (input) {
      input.addEventListener('input', (e) => {
        query = e.target.value;
      });
      input.addEventListener('keypress', handleKeyPress);
      
      // Mobile keyboard detection
      if (isMobile) {
        input.addEventListener('focus', () => {
          setTimeout(detectKeyboard, 300);
        });
        input.addEventListener('blur', () => {
          setTimeout(() => {
            isKeyboardOpen = false;
            updateWidgetState();
          }, 300);
        });
      }
    }

    // Search button handler
    if (button) {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSearch();
      });
    }

    // Results close button handler
    if (resultsClose) {
      resultsClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeResults();
      });
    }

    // Window resize handler
    window.addEventListener('resize', () => {
      checkMobile();
      if (isMobile) {
        detectKeyboard();
      }
    });

    // Scroll handler for desktop
    if (!isMobile) {
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScroll, 100);
      }, { passive: true });
    }

    // Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && showResults) {
        closeResults();
      }
    });
  }

  // Initialize the search widget
  function init() {
    console.log('Initializing search widget...');
    console.log('Initial config:', config);
    console.log('Shop domain:', config.shopDomain);
    console.log('Window location:', window.location.hostname);
    
    // Determine the API endpoint now that config is fully loaded
    config.apiEndpoint = getApiEndpoint();
    console.log('Final API endpoint:', config.apiEndpoint);
    
    // Find DOM elements
    container = document.querySelector('.search-widget-container');
    bubble = document.querySelector('.search-widget-bubble');
    interface_ = document.querySelector('.search-widget-interface');
    input = document.querySelector('.search-widget-input');
    button = document.querySelector('.search-widget-button');
    loading = document.querySelector('.search-widget-loading');
    loadingIcon = document.querySelector('.search-loading-icon');
    resultsPanel = document.querySelector('.search-results-panel');
    resultsContent = document.querySelector('.search-results-content');
    resultsClose = document.querySelector('.search-results-close');

    // CRITICAL FIX: Move results panel outside of Shopify app block container
    if (resultsPanel && container) {
      console.log('Moving results panel to document body to break out of Shopify sandbox');
      // Remove from current container
      resultsPanel.parentNode.removeChild(resultsPanel);
      // Append directly to body
      document.body.appendChild(resultsPanel);
      console.log('Results panel moved to body successfully');
    }

    // Debug: Log which elements were found
    console.log('DOM elements found:', {
      container: !!container,
      bubble: !!bubble,
      interface_: !!interface_,
      input: !!input,
      button: !!button,
      loading: !!loading,
      loadingIcon: !!loadingIcon,
      resultsPanel: !!resultsPanel,
      resultsContent: !!resultsContent,
      resultsClose: !!resultsClose
    });

    if (!container) {
      console.error('Search widget container not found');
      return;
    }

    // Check if API endpoint is configured
    if (!config.apiEndpoint) {
      console.warn('⚠️ No API endpoint configured. Search will fall back to mock data.');
      console.warn('Current shop domain:', config.shopDomain);
      console.warn('Available mappings:', Object.keys(APP_URL_MAPPING));
    } else {
      console.log('✅ API endpoint configured:', config.apiEndpoint);
    }

    // Initialize mobile detection
    checkMobile();

    // Set up event listeners
    initEventListeners();

    // Initial state update
    updateWidgetState();

    console.log('Search widget initialized successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose public API if needed
  window.SearchWidget = {
    search: handleSearch,
    close: closeResults,
    toggle: expandWidget
  };

})(); 