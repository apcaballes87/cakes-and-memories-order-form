/**
 * Service to handle Facebook Messenger interactions
 */

const FB_PAGE_ACCESS_TOKEN = import.meta.env.VITE_FB_PAGE_ACCESS_TOKEN;
const FB_GRAPH_API_VERSION = 'v20.0';
const FB_GRAPH_API_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}/me/messages`;

/**
 * Sends a confirmation message to a customer on Facebook Messenger
 * @param psid The Page-Scoped ID of the user
 * @param message The message text to send
 * @returns Promise with the API response
 */
export const sendMessengerConfirmation = async (psid: string, message: string): Promise<any> => {
  if (!FB_PAGE_ACCESS_TOKEN) {
    console.error('VITE_FB_PAGE_ACCESS_TOKEN is not configured');
    return { error: 'Token not configured' };
  }

  if (!psid || psid === 'default-user') {
    console.warn('Invalid PSID provided for Messenger confirmation:', psid);
    return { error: 'Invalid PSID' };
  }

  try {
    const response = await fetch(`${FB_GRAPH_API_URL}?access_token=${FB_PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text: message },
        messaging_type: 'RESPONSE', // Using RESPONSE as this is a reply to an order form interaction
      }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Facebook Graph API error:', result);
      return { error: result.error || 'Failed to send message' };
    }

    console.log('Messenger confirmation sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending Messenger confirmation:', error);
    return { error };
  }
};
