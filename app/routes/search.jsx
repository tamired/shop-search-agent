/**
 * Search API Route
 * Handles search queries from the widget using MCP tools
 */
import { json } from "@remix-run/node";
import MCPClient from "../mcp-client";
import { getCustomerAccountUrl } from "../db.server";
import AppConfig from "../services/config.server";
import { createClaudeService } from "../services/claude.server";
import { unauthenticated } from "../shopify.server";

/**
 * Remix loader function for handling GET requests
 */
export async function loader({ request }) {
  // Handle OPTIONS requests (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  // API-only: reject GET requests
  return json(
    { error: AppConfig.errorMessages.apiUnsupported },
    { status: 400, headers: getCorsHeaders(request) }
  );
}

/**
 * Remix action function for handling POST requests
 */
export async function action({ request }) {
  return handleSearchRequest(request);
}

/**
 * Handle search requests
 * @param {Request} request - The request object
 * @returns {Response} JSON response with search results
 */
async function handleSearchRequest(request) {
  try {
    // Get search data from request body
    const body = await request.json();
    const query = body.query;
    const shopId = body.shopId;
    const enableProducts = body.enableProducts !== false; // Default to true
    const enableFAQ = body.enableFAQ !== false; // Default to true
    const limit = body.limit || 4;

    // Validate required query
    if (!query || !query.trim()) {
      return json(
        { error: "Search query is required" },
        { status: 400, headers: getCorsHeaders(request) }
      );
    }

    console.log('Processing search request:', { query, shopId, enableProducts, enableFAQ, limit });

    // Generate conversation ID for this search session
    const conversationId = Date.now().toString();
    
    // Get shop domain and customer MCP endpoint
    const shopDomain = request.headers.get("Origin") || request.headers.get("Referer");
    const customerMcpEndpoint = await getCustomerMcpEndpoint(shopDomain, conversationId);

    // Initialize MCP client
    const mcpClient = new MCPClient(
      shopDomain,
      conversationId,
      shopId,
      customerMcpEndpoint
    );

    // Initialize Claude service
    const claudeService = createClaudeService();

    let storefrontMcpTools = [];

    try {
      // Connect to storefront MCP server to get available tools
      storefrontMcpTools = await mcpClient.connectToStorefrontServer();
      console.log(`Connected to MCP with ${storefrontMcpTools.length} tools`);
    } catch (error) {
      console.warn('Failed to connect to MCP servers, falling back to mock data:', error.message);
      return json(await getMockSearchResults(query), { headers: getCorsHeaders(request) });
    }

    // Execute search using Claude with MCP tools
    const searchResults = await executeSearch({
      query,
      claudeService,
      mcpClient,
      enableProducts,
      enableFAQ,
      limit
    });

    return json(searchResults, { headers: getCorsHeaders(request) });

  } catch (error) {
    console.error('Error in search request handler:', error);
    
    // Fallback to mock results on error
    try {
      const body = await request.json().catch(() => ({}));
      const mockResults = await getMockSearchResults(body.query || "");
      console.log('Returning mock results due to error in main handler');
      return json(mockResults, { headers: getCorsHeaders(request) });
    } catch (mockError) {
      console.error('Error generating mock results:', mockError);
      return json(
        { 
          error: "Search service temporarily unavailable",
          results: []
        },
        { status: 500, headers: getCorsHeaders(request) }
      );
    }
  }
}

/**
 * Execute search using Claude and MCP tools
 * @param {Object} params - Search parameters
 * @returns {Array} Search results formatted for the widget
 */
async function executeSearch({ query, claudeService, mcpClient, enableProducts, enableFAQ, limit }) {
  // Build search prompt for Claude
  const searchPrompt = buildSearchPrompt(query, enableProducts, enableFAQ, limit);
  
  // Prepare conversation for Claude
  const conversation = [
    {
      role: 'user',
      content: searchPrompt
    }
  ];

  let searchResults = [];
  let toolCalls = [];

  try {
    console.log('Starting Claude conversation for search query:', query);
    
    // Check if we have any tools available
    if (!mcpClient.tools || mcpClient.tools.length === 0) {
      console.warn('No MCP tools available, falling back to mock results');
      return await getMockSearchResults(query);
    }

    console.log(`Available MCP tools: ${mcpClient.tools.map(t => t.name).join(', ')}`);

    // Stream conversation with Claude to get tool calls
    const response = await claudeService.streamConversation(
      {
        messages: conversation,
        promptType: 'search',
        tools: mcpClient.tools
      },
      {
        onText: (textDelta) => {
          // We don't need to handle text for search, but log it for debugging
          if (textDelta.trim()) {
            console.log('Claude text response:', textDelta.trim());
          }
        },
        onMessage: (message) => {
          console.log('Claude message completed');
        },
        onToolUse: async (content) => {
          const toolName = content.name;
          const toolArgs = content.input;
          
          console.log(`Executing tool: ${toolName} with args:`, JSON.stringify(toolArgs, null, 2));
          
          try {
            // Call the MCP tool
            const toolResponse = await mcpClient.callTool(toolName, toolArgs);
            
            if (toolResponse.error) {
              console.error(`Tool ${toolName} returned error:`, toolResponse.error);
            } else if (toolResponse.content) {
              console.log(`Tool ${toolName} returned content:`, typeof toolResponse.content === 'string' ? toolResponse.content.substring(0, 200) + '...' : toolResponse.content);
              toolCalls.push({
                tool: toolName,
                args: toolArgs,
                response: toolResponse
              });
            } else {
              console.warn(`Tool ${toolName} returned no content`);
            }
          } catch (toolError) {
            console.error(`Error calling tool ${toolName}:`, toolError);
          }
        }
      }
    );

    console.log(`Completed Claude conversation. Tool calls made: ${toolCalls.length}`);

    // Process tool responses to extract search results
    searchResults = processToolResponses(toolCalls, enableProducts, enableFAQ, limit);
    
    console.log(`Processed ${toolCalls.length} tool responses into ${searchResults.length} search results`);

    // If no results found through tools, return mock results
    if (searchResults.length === 0) {
      console.log('No results found through MCP tools, falling back to mock results');
      return await getMockSearchResults(query);
    }
    
  } catch (error) {
    console.error('Error executing search with Claude:', error);
    console.log('Falling back to mock results due to Claude error');
    return await getMockSearchResults(query);
  }

  return searchResults;
}

/**
 * Build search prompt for Claude
 * @param {string} query - User search query
 * @param {boolean} enableProducts - Whether to search for products
 * @param {boolean} enableFAQ - Whether to search for FAQ/help content
 * @param {number} limit - Maximum number of results
 * @returns {string} Formatted prompt for Claude
 */
function buildSearchPrompt(query, enableProducts, enableFAQ, limit) {
  const searchTypes = [];
  if (enableProducts) searchTypes.push('products');
  if (enableFAQ) searchTypes.push('FAQ/help content');
  
  return `You are a helpful shopping assistant for a Shopify store. A customer is searching for: "${query}"

Please help them by searching for relevant ${searchTypes.join(' and ')} using the available tools. 

Search requirements:
- Find up to ${limit} most relevant results
- Use appropriate search tools based on the query type
- For product searches, look for products that match the query
- For FAQ/help searches, find relevant information that answers the customer's question
- Prioritize the most relevant and helpful results

Customer query: "${query}"

Please use the available tools to search for relevant results.`;
}

/**
 * Process tool responses to extract and format search results
 * @param {Array} toolCalls - Array of tool call results
 * @param {boolean} enableProducts - Whether products are enabled
 * @param {boolean} enableFAQ - Whether FAQ is enabled
 * @param {number} limit - Maximum number of results
 * @returns {Array} Formatted search results
 */
function processToolResponses(toolCalls, enableProducts, enableFAQ, limit) {
  const results = [];
  
  for (const toolCall of toolCalls) {
    try {
      const { tool, response } = toolCall;
      
      if (!response.content) continue;
      
      // Parse the response content
      let content;
      try {
        content = typeof response.content === 'string' 
          ? JSON.parse(response.content) 
          : response.content;
      } catch (e) {
        content = response.content;
      }
      
      // Process different types of tool responses
      if (tool.includes('search') || tool.includes('product')) {
        // Handle product search results
        if (enableProducts && content.products) {
          const products = Array.isArray(content.products) ? content.products : [content.products];
          
          for (const product of products) {
            if (results.length >= limit) break;
            
            results.push({
              type: 'product',
              id: product.id || `product_${results.length}`,
              name: product.title || product.name || 'Product',
              price: formatPrice(product.priceRange || product.price),
              image: getProductImage(product),
              rating: 4.5, // Default rating since Shopify doesn't provide this
              description: product.description || product.excerpt || '',
              handle: product.handle,
              url: product.url || `/products/${product.handle}`
            });
          }
        }
      } else if (tool.includes('help') || tool.includes('faq') || tool.includes('support')) {
        // Handle FAQ/help content results
        if (enableFAQ && content.articles) {
          const articles = Array.isArray(content.articles) ? content.articles : [content.articles];
          
          for (const article of articles) {
            if (results.length >= limit) break;
            
            results.push({
              type: 'faq',
              id: article.id || `faq_${results.length}`,
              question: article.title || article.question || 'Question',
              answer: article.summary || article.content || article.answer || 'Answer not available',
              url: article.url
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Error processing tool response:', error);
    }
  }
  
  return results.slice(0, limit);
}

/**
 * Format price from Shopify price range or simple price
 * @param {Object|string|number} price - Price data
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
  if (!price) return 'Price not available';
  
  if (typeof price === 'object' && price.minVariantPrice) {
    const amount = price.minVariantPrice.amount;
    const currency = price.minVariantPrice.currencyCode || 'USD';
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  }
  
  if (typeof price === 'string' || typeof price === 'number') {
    return `$${parseFloat(price).toFixed(2)}`;
  }
  
  return 'Price not available';
}

/**
 * Get product image URL
 * @param {Object} product - Product data
 * @returns {string} Image URL
 */
function getProductImage(product) {
  if (product.featuredImage?.url) {
    return product.featuredImage.url;
  }
  
  if (product.images && product.images.length > 0) {
    return product.images[0].url || product.images[0];
  }
  
  if (product.image) {
    return typeof product.image === 'string' ? product.image : product.image.url;
  }
  
  // Return a placeholder SVG if no image found
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#f3f4f6"/>
      <g fill="#9ca3af" transform="translate(60, 60)">
        <rect x="20" y="20" width="40" height="40" rx="4"/>
        <circle cx="30" cy="30" r="3"/>
        <path d="M20 50 l10-10 10 10 10-15 10 15"/>
      </g>
      <text x="100" y="130" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="12">No Image</text>
    </svg>
  `)}`;
}

/**
 * Get the customer MCP endpoint for a shop
 * @param {string} shopDomain - The shop domain
 * @param {string} conversationId - The conversation ID
 * @returns {string} The customer MCP endpoint
 */
async function getCustomerMcpEndpoint(shopDomain, conversationId) {
  try {
    // Check if the customer account URL exists in the DB
    const existingUrl = await getCustomerAccountUrl(conversationId);

    // If URL exists, return early with the MCP endpoint
    if (existingUrl) {
      return `${existingUrl}/customer/api/mcp`;
    }

    // If not, query for it from the Shopify API
    const { hostname } = new URL(shopDomain);
    const { storefront } = await unauthenticated.storefront(hostname);

    const response = await storefront.graphql(
      `#graphql
      query shop {
        shop {
          customerAccountUrl
        }
      }`,
    );

    const body = await response.json();
    const customerAccountUrl = body.data.shop.customerAccountUrl;

    return `${customerAccountUrl}/customer/api/mcp`;
  } catch (error) {
    console.error("Error getting customer MCP endpoint:", error);
    return null;
  }
}

/**
 * Get mock search results for fallback
 * @param {string} query - Search query
 * @returns {Array} Mock search results
 */
async function getMockSearchResults(query) {
  return new Promise((resolve) => {
    setTimeout(() => {
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
    }, 500);
  });
}

/**
 * Gets CORS headers for the response
 * @param {Request} request - The request object
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || request.headers.get("Referer");
  
  // Allow requests from Shopify storefronts specifically
  let allowedOrigin = "*";
  if (origin) {
    // Allow all myshopify.com domains and localhost for development
    if (origin.includes('.myshopify.com') || 
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') ||
        origin.includes('ngrok') ||
        origin.includes('trycloudflare.com')) {
      allowedOrigin = origin;
    }
  }
  
  console.log('CORS: Request origin:', origin, '-> Allowed origin:', allowedOrigin);

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
    "Vary": "Origin"
  };
} 