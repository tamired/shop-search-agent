# AI Search Widget

An intelligent search widget for Shopify stores that provides AI-powered product and FAQ search using MCP (Model Context Protocol) tools.

## Features

- **AI-Powered Search**: Uses Claude AI with MCP tools to provide intelligent search results
- **Product Search**: Finds relevant products based on natural language queries
- **FAQ Search**: Searches through help articles and frequently asked questions
- **Real-time Results**: Fast, responsive search with loading animations
- **Mobile Optimized**: Works seamlessly on desktop and mobile devices
- **Customizable**: Fully customizable colors, text, and behavior

## Setup Instructions

### 1. Backend Configuration

The widget integrates with the app's backend search route (`/search`) which uses storefront-MCP tools. Make sure you have:

1. **MCP Server Running**: Ensure your storefront-MCP server is configured and running
2. **Environment Variables**: Set up the required environment variables:
   ```bash
   ANTHROPIC_API_KEY=your_claude_api_key
   SHOPIFY_APP_URL=your_app_url  # e.g., https://your-app.com
   ```

### 2. Widget Configuration

1. **Install the Extension**: The widget is included as a Shopify app block extension
2. **Add to Theme**: In the Shopify admin, go to Online Store > Themes > Customize
3. **Add Search Widget**: Add the "AI Search Widget" block to your theme
4. **Configure Settings**:
   - **App URL**: Enter your Shopify app's URL (required for API calls)
   - **Custom API Endpoint**: (Optional) Use a custom search endpoint
   - **Results Per Page**: Number of results to show (2-10)
   - **Enable Product Search**: Toggle product search functionality
   - **Enable FAQ Search**: Toggle FAQ/help article search

### 3. Customization

The widget can be customized in the Shopify admin:

- **Colors**: Primary, secondary, and button colors
- **Text**: Widget title, subtitle, and search placeholder
- **Behavior**: Enable/disable product and FAQ search

### 4. How It Works

1. **User Search**: User enters a search query in the widget
2. **AI Processing**: Query is sent to Claude AI via the backend route
3. **MCP Tools**: Claude uses storefront-MCP tools to search products and content
4. **Results Display**: Formatted results are displayed in the widget

### 5. API Integration

The widget communicates with the backend via:

- **Endpoint**: `POST /search`
- **Payload**:
  ```json
  {
    "query": "user search query",
    "shopId": "shop_id",
    "enableProducts": true,
    "enableFAQ": true,
    "limit": 4
  }
  ```
- **Response**:
  ```json
  [
    {
      "type": "product",
      "id": "product_id",
      "name": "Product Name",
      "price": "$99.99",
      "image": "image_url",
      "rating": 4.5,
      "description": "Product description",
      "handle": "product-handle"
    },
    {
      "type": "faq",
      "id": "faq_id",
      "question": "Question text",
      "answer": "Answer text"
    }
  ]
  ```

### 6. Fallback Behavior

If the backend is unavailable or MCP tools fail:
- Widget automatically falls back to mock data
- Ensures the user experience remains smooth
- Logs errors for debugging

### 7. Development

For local development:
- Widget automatically detects localhost and uses `http://localhost:3000/search`
- Configure your local app to run on port 3000
- Ensure CORS is properly configured in the backend

### 8. Troubleshooting

**Widget not working?**
- Check the App URL configuration in the widget settings
- Verify the backend search route is accessible
- Check browser console for error messages
- Ensure MCP servers are running and accessible

**No search results?**
- Verify storefront-MCP tools are properly configured
- Check backend logs for MCP connection issues
- Ensure Claude API key is configured
- Widget will fall back to mock data if backend fails

### 9. Production Deployment

For production:
1. Set the correct `SHOPIFY_APP_URL` in your environment
2. Configure the widget's App URL setting to match your production app URL
3. Ensure your MCP servers are accessible from the production environment
4. Test the integration thoroughly before going live

## Support

If you encounter issues:
1. Check the browser console for JavaScript errors
2. Review the backend logs for API errors
3. Verify MCP server connectivity
4. Ensure all environment variables are correctly set 